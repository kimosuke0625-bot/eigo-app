import { useEffect, useState } from 'react'
import { materialClips, type RepeatMode } from '../speech/clips'

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
    const onTime = () => {
      const total = Number.isFinite(el.duration) ? el.duration : 0
      setTime({ now: el.currentTime, total })
      // 全体をくり返している（loop）ときは ended が来ないので、終わりの近くまで聞いたら「聞き終えた」にする
      if (total && el.currentTime >= total - 1) setEnded(true)
    }
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
    /** 全体をくり返すか */
    setLoop: (on: boolean) => { el.loop = on },
    /** 少し戻る（秒） */
    back: (sec: number) => { el.currentTime = Math.max(0, el.currentTime - sec) },
  }
}

/**
 * くり返しの設定（なし・全体・1文）。次に開いたときも同じにする（端末の中だけ。保存できなくても動く）。
 * 1文のくり返しは文ごとの音声のときだけ選べる。
 */
const REPEAT_KEY = 'eigo.listenRepeat'
export function useRepeatMode(): [RepeatMode, (m: RepeatMode) => void] {
  const [mode, setMode] = useState<RepeatMode>(() => {
    try {
      const v = localStorage.getItem(REPEAT_KEY)
      return v === 'all' || v === 'one' ? v : 'none'
    } catch { return 'none' }
  })
  const set = (m: RepeatMode) => {
    setMode(m)
    try { localStorage.setItem(REPEAT_KEY, m) } catch { /* 保存できなくても続ける */ }
  }
  return [mode, set]
}

/** くり返しの切り替え（なし・全体・1文） */
export function RepeatSwitch({ mode, onChange, allowOne }: { mode: RepeatMode; onChange: (m: RepeatMode) => void; allowOne: boolean }) {
  const options: [RepeatMode, string][] = [['none', 'なし'], ['all', '全体'], ...(allowOne ? [['one', '1文'] as [RepeatMode, string]] : [])]
  return (
    <div className="row" style={{ alignItems: 'center', gap: 8 }}>
      <span className="muted">🔁 くり返し</span>
      <div className="seg" aria-label="くり返し" style={{ flex: 1 }}>
        {options.map(([m, label]) => <button key={m} aria-pressed={mode === m} onClick={() => onChange(m)}>{label}</button>)}
      </div>
    </div>
  )
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
