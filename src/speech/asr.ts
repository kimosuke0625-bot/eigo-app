import { useSyncExternalStore } from 'react'

// 音声認識（Whisper）の窓口。Web Worker を1つだけ作って使い回す。

export type AsrStatus =
  | { state: 'idle' }
  | { state: 'loading'; loaded: number; total: number }
  | { state: 'ready' }
  | { state: 'error'; message: string }
  | { state: 'unsupported' }

let worker: Worker | null = null
let status: AsrStatus = typeof Worker === 'undefined' || typeof WebAssembly === 'undefined' ? { state: 'unsupported' } : { state: 'idle' }
const listeners = new Set<() => void>()
const pending = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>()
let nextId = 1
const progress = new Map<string, { loaded: number; total: number }>()

function setStatus(s: AsrStatus) {
  status = s
  listeners.forEach((l) => l())
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data
    if (m.type === 'progress' && m.file && m.total) {
      progress.set(m.file, { loaded: m.loaded ?? 0, total: m.total })
      const sum = [...progress.values()].reduce((a, p) => ({ loaded: a.loaded + p.loaded, total: a.total + p.total }), { loaded: 0, total: 0 })
      setStatus({ state: 'loading', ...sum })
      return
    }
    const p = pending.get(m.id)
    if (!p) return
    pending.delete(m.id)
    if (m.type === 'ready') { setStatus({ state: 'ready' }); p.resolve('') }
    else if (m.type === 'result') { setStatus({ state: 'ready' }); p.resolve(m.text) }
    else { setStatus({ state: 'error', message: m.message }); p.reject(new Error(m.message)) }
  }
  return worker
}

function call(type: 'load' | 'transcribe', audio?: Float32Array): Promise<string> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, type, audio }, audio ? [audio.buffer] : [])
  })
}

/** モデルを取得して準備する（初回のみ約41MBを取得し、以後はブラウザのキャッシュから読む） */
export function loadAsr(): Promise<void> {
  if (status.state === 'unsupported') return Promise.reject(new Error('この端末では音声認識を使えません'))
  if (status.state === 'ready') return Promise.resolve()
  setStatus({ state: 'loading', loaded: 0, total: 0 })
  return call('load').then(() => undefined)
}

/** 録音を英語の文字にする */
export async function transcribe(blob: Blob): Promise<string> {
  await loadAsr()
  const audio = await decodeTo16kMono(blob)
  return call('transcribe', audio)
}

export function useAsrStatus(): AsrStatus {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => status,
  )
}

/** 録音（webm や mp4）を、Whisper が受け取れる 16kHz・モノラルの波形にする */
export async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctor()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const length = Math.ceil(decoded.duration * 16000)
    const offline = new OfflineAudioContext(1, Math.max(1, length), 16000)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0).slice()
  } finally {
    void ctx.close()
  }
}
