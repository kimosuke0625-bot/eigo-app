import { useEffect, useState } from 'react'
import { materialClips } from '../speech/clips'

export type MaterialAudio = NonNullable<Awaited<ReturnType<typeof materialClips>>>

/** 素材の内蔵音声（文ごとの音声ファイル）。読み込み中は undefined、内蔵音声がなければ null */
export function useMaterialAudio(materialId: string): MaterialAudio | null | undefined {
  const [audio, setAudio] = useState<MaterialAudio | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void materialClips(materialId).then((a) => alive && setAudio(a ?? null))
    return () => { alive = false }
  }, [materialId])
  return audio
}

/** いま聞いている声の説明（どの話者の声か） */
export function VoiceNote({ audio }: { audio: MaterialAudio | null | undefined }) {
  if (!audio) return <p className="muted voice-note">🔈 声：端末の読み上げ</p>
  return <p className="muted voice-note">🔈 声：{audio.voiceLabel}（PC で作った高品質な合成音声）</p>
}

/**
 * 素材全体が1つの音声ファイル（人の朗読、取り込んだ音声）のときの再生。
 * 一時停止した所から続けられ、速さも変えられる。
 */
export function useWholeAudio(src: string | Blob | undefined) {
  const [el] = useState(() => (src ? new Audio() : null))
  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  const [time, setTime] = useState({ now: 0, total: 0 })
  useEffect(() => {
    if (!el || !src) return
    const url = typeof src === 'string' ? `${import.meta.env.BASE_URL}audio/${src}` : URL.createObjectURL(src)
    el.src = url
    el.preload = 'metadata'
    const onTime = () => setTime({ now: el.currentTime, total: Number.isFinite(el.duration) ? el.duration : 0 })
    const onEnd = () => { setPlaying(false); setEnded(true) }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onTime)
    el.addEventListener('ended', onEnd)
    el.addEventListener('pause', () => setPlaying(false))
    return () => {
      el.pause()
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onTime)
      el.removeEventListener('ended', onEnd)
      if (typeof src !== 'string') URL.revokeObjectURL(url)
    }
  }, [el, src])
  if (!el) return null
  return {
    playing, ended, time,
    play: (rate: number) => {
      el.playbackRate = rate
      ;(el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
      void el.play().then(() => setPlaying(true), () => setPlaying(false))
    },
    pause: () => { el.pause(); setPlaying(false) },
    restart: (rate: number) => { el.currentTime = 0; el.playbackRate = rate; void el.play().then(() => setPlaying(true), () => {}) },
    setRate: (rate: number) => { el.playbackRate = rate },
  }
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
