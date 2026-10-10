// 録音（MediaRecorder）。iPhone の Safari は mp4、PC の Chrome は webm で録音する。

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

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
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

/**
 * 練習の開始ボタンで、マイクと音声の再生を一度に許可してもらう。
 * iPhone では画面をタップした直後でないと録音も再生も始められないため、最初のタップで両方を準備する。
 */
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
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return { mic: true }
  } catch (e) {
    const err = e as { name?: string; message?: string }
    return { mic: false, problem: micProblemOf(e), detail: [err?.name, err?.message].filter(Boolean).join('：') }
  }
}

/** 音声を再生する（録音の聞き比べ用）。止める関数を返す */
export function playBlob(blob: Blob, onEnd?: () => void): () => void {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.onended = () => { URL.revokeObjectURL(url); onEnd?.() }
  void audio.play().catch(() => onEnd?.())
  return () => { audio.pause(); URL.revokeObjectURL(url); onEnd?.() }
}
