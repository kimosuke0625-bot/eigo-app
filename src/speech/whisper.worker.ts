/// <reference lib="webworker" />
// Whisper（英語用の最小モデル whisper-tiny.en）をブラウザの中で動かす Web Worker。
// 音声は端末の中で文字にするだけで、外には送らない。モデルの初回の取得だけ Hugging Face から行う。
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

const MODEL = 'onnx-community/whisper-tiny.en'

env.allowLocalModels = false
// 取得したモデルはブラウザのキャッシュに保存し、2回目からは通信しない
env.useBrowserCache = true

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null

function load() {
  asr ??= pipeline('automatic-speech-recognition', MODEL, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
      if (p.status === 'progress') postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total })
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>
  return asr
}

self.onmessage = async (e: MessageEvent<{ id: number; type: 'load' | 'transcribe'; audio?: Float32Array }>) => {
  const { id, type, audio } = e.data
  try {
    const p = await load()
    if (type === 'load') {
      postMessage({ id, type: 'ready' })
      return
    }
    const out = await p(audio!, { chunk_length_s: 30, stride_length_s: 5 })
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text
    postMessage({ id, type: 'result', text: text.trim() })
  } catch (err) {
    asr = null
    postMessage({ id, type: 'error', message: (err as Error).message })
  }
}
