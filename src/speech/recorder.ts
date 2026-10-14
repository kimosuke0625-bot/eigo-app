// 録音（MediaRecorder）。iPhone の Safari は mp4、PC の Chrome は webm で録音する。
// 2026-10-14：「多くの練習でマイクが使えないと頻繁に出る」への対応。
// - 以前は練習の開始ボタンでマイクを一度開いて閉じ、録音のときにもう一度開いていた（1回の練習で2回）。
//   iPhone のホーム画面のアプリはマイクを開くたびに許可を求めることがあり、失敗や確認が倍になる。
//   → 開始ボタンでは許可の状態を調べるだけにし、マイクを開くのは録音を始めるときの1回だけにした。
// - 音を鳴らしている最中に録音を始めると、iPhone はマイクを「使用中」として断ることがある。
//   → 録音の前に鳴っている音を止め、使用中で断られたときは少し待って1回だけやり直す。
import { stopAudio } from './clips'

export function micSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

function pickMime(): string | undefined {
  for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t
  }
  return undefined
}

export interface Recording {
  /** 録音を止めて音声を受け取る */
  stop: () => Promise<Blob>
  /** 録音をやめて捨てる */
  cancel: () => void
  startedAt: number
}

async function openMic(): Promise<MediaStream> {
  const constraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
  try {
    return await navigator.mediaDevices.getUserMedia(constraints)
  } catch (e) {
    // 使用中で断られたとき（音の再生の切り替えが終わっていない）は、少し待って1回だけやり直す
    if (micProblemOf(e) !== 'busy') throw e
    await new Promise((r) => setTimeout(r, 400))
    return navigator.mediaDevices.getUserMedia(constraints)
  }
}

export async function startRecording(): Promise<Recording> {
  // 鳴っている手本の音を止めてからマイクを開く
  try { stopAudio() } catch { /* 止められなくても続ける */ }
  let stream: MediaStream
  try {
    stream = await openMic()
  } catch (e) {
    logMicFailure(e)
    throw e
  }
  const mimeType = pickMime()
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }))
    }
  })
  rec.start(1000)
  return {
    startedAt: Date.now(),
    stop: () => { if (rec.state !== 'inactive') rec.stop(); return done },
    cancel: () => { if (rec.state !== 'inactive') rec.stop(); chunks.length = 0 },
  }
}

export type MicProblem = 'unsupported' | 'denied' | 'notfound' | 'busy' | 'insecure' | 'other'
export interface MicResult { mic: boolean; problem?: MicProblem; detail?: string }

/** getUserMedia の失敗の理由を分ける（画面に正しい案内を出すため） */
export function micProblemOf(e: unknown): MicProblem {
  const name = (e as { name?: string } | null)?.name ?? ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'notfound'
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy'
  return 'other'
}

/** マイクの許可の状態を、マイクを開かずに調べる（分からないときは 'unknown'） */
export async function micPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    const st = await navigator.permissions?.query({ name: 'microphone' as PermissionName })
    return st?.state ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/** マイクが使えなかった記録（端末の中だけ。直近20件。不具合の原因を調べるため） */
const MIC_LOG = 'eigo.micFailures'
export function logMicFailure(e: unknown) {
  try {
    const err = e as { name?: string; message?: string }
    const list = JSON.parse(localStorage.getItem(MIC_LOG) ?? '[]') as { at: number; name: string; message: string }[]
    list.push({ at: Date.now(), name: err?.name ?? '', message: err?.message ?? '' })
    localStorage.setItem(MIC_LOG, JSON.stringify(list.slice(-20)))
  } catch { /* 記録できなくても続ける */ }
}

/**
 * 練習の開始ボタン：音声の再生を許可してもらい、マイクが使えそうかを調べる。
 * iPhone では画面をタップした直後でないと再生を始められないため、最初のタップで準備する。
 * マイクはここでは開かない（開くのは録音を始めるときだけ）。許可しないと決まっているときだけ、理由と直し方を出す。
 */
export async function unlockAudioAndMic(): Promise<MicResult> {
  try {
    // 読み上げを一度だけ無音で鳴らして、以後の自動再生を許可させる
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      speechSynthesis.speak(u)
    }
  } catch { /* 読み上げがなくても続ける */ }
  if (typeof window !== 'undefined' && window.isSecureContext === false) return { mic: false, problem: 'insecure' }
  if (!micSupported()) return { mic: false, problem: 'unsupported' }
  if ((await micPermission()) === 'denied') return { mic: false, problem: 'denied', detail: 'マイクの許可：許可しない' }
  return { mic: true }
}

/** 音声を再生する（録音の聞き比べ用）。止める関数を返す */
export function playBlob(blob: Blob, onEnd?: () => void): () => void {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.onended = () => { URL.revokeObjectURL(url); onEnd?.() }
  void audio.play().catch(() => onEnd?.())
  return () => { audio.pause(); URL.revokeObjectURL(url); onEnd?.() }
}
