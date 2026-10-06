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
  if (!audio) return <p className="muted voice-note">🔈 声：端末の高品質な声</p>
  return <p className="muted voice-note">🔈 声：{audio.voiceLabel}（PC で作った高品質な合成音声）</p>
}
