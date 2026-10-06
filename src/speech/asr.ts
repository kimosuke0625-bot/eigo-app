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
  // Worker が落ちた（iPhone でメモリが足りないときなど）ら、待っている処理をすべて失敗にして作り直せるようにする
  worker.onerror = (e) => failAll(`音声認識が止まりました${e.message ? `：${e.message}` : ''}`)
  worker.onmessageerror = () => failAll('音声認識とのやりとりに失敗しました')
  return worker
}

function failAll(message: string) {
  worker?.terminate()
  worker = null
  for (const p of pending.values()) p.reject(new Error(message))
  pending.clear()
  setStatus({ state: 'error', message })
}

function call(type: 'load' | 'transcribe', audio?: Float32Array): Promise<string> {
  const id = nextId++
  // 終わらないまま待ち続けないよう、時間の上限を決める（モデルの取得は10分、認識は音声の長さの6倍＋1分）
  const limit = type === 'load' ? 10 * 60_000 : 60_000 + ((audio?.length ?? 0) / 16000) * 6000
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (pending.delete(id)) reject(new Error('時間がかかりすぎたため中止しました'))
    }, limit)
    pending.set(id, {
      resolve: (v) => { window.clearTimeout(timer); resolve(v) },
      reject: (e) => { window.clearTimeout(timer); reject(e) },
    })
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

/** 録音を英語の文字にする（失敗したら例外） */
export async function transcribe(blob: Blob): Promise<string> {
  const r = await transcribeSafe(blob)
  if (!r.ok) throw new Error(r.reason)
  return r.text
}

export function useAsrStatus(): AsrStatus {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => status,
  )
}

/**
 * 録音（webm や mp4）を、Whisper が受け取れる 16kHz・モノラルの波形にする。
 * 再生用の AudioContext は作らない（iPhone は同時に作れる数に上限があり、続けて作ると失敗するため）。
 * 16kHz の OfflineAudioContext で読み込むと、ブラウザがそのまま16kHzに変換してくれる。
 */
export async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
  const ctx = new Offline(1, 16000, 16000)
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  if (decoded.sampleRate === 16000) {
    // 複数チャンネルなら平均してモノラルにする
    const out = new Float32Array(decoded.length)
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const data = decoded.getChannelData(c)
      for (let i = 0; i < data.length; i++) out[i] += data[i] / decoded.numberOfChannels
    }
    return out
  }
  // 古いブラウザなどで変換されなかった場合だけ、描き直して16kHzにする
  const offline = new Offline(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  return (await offline.startRendering()).getChannelData(0).slice()
}

export type TranscribeResult = { ok: true; text: string } | { ok: false; reason: string }

/** 失敗しても例外にせず、画面に出せる理由を返す */
export async function transcribeSafe(blob: Blob): Promise<TranscribeResult> {
  if (!blob.size) return { ok: false, reason: '録音が空でした（マイクが使えなかった可能性があります）' }
  try {
    await loadAsr()
  } catch (e) {
    return { ok: false, reason: `音声認識のモデルを準備できませんでした（${(e as Error).message}）` }
  }
  let audio: Float32Array
  try {
    audio = await decodeTo16kMono(blob)
  } catch (e) {
    return { ok: false, reason: `録音を読み込めませんでした（${blob.type || '形式不明'}：${(e as Error).message || (e as Error).name}）` }
  }
  if (audio.length < 16000 * 0.5) return { ok: false, reason: '録音が短すぎます（0.5秒未満）' }
  try {
    const text = await call('transcribe', audio)
    if (!text.trim()) return { ok: false, reason: '声を聞き取れませんでした（音が小さいか、無音の可能性があります）' }
    return { ok: true, text }
  } catch (e) {
    return { ok: false, reason: `認識の途中で止まりました（${(e as Error).message}）。メモリ不足の場合は、ほかのアプリを閉じてもう一度試してください` }
  }
}
