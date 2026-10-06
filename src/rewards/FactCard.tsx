import { useEffect, useState } from 'react'
import { bankRef, playText, prepare } from '../speech/audioBank'
import { updateSettings } from '../db/settings'
import type { Settings } from '../db/schema'
import { factEnglish, type FactContent, type FactsData } from './facts'

/**
 * 雑学カード。英語が表、日本語が裏。開くと英語を読み上げる。
 * Phase 1〜2 はやさしい版、Phase 3 以降は標準版の英文。
 */
export function FactCard({ fact, data, settings, autoSpeak = false }: {
  fact: FactContent
  data: FactsData
  settings: Settings
  autoSpeak?: boolean
}) {
  const [flipped, setFlipped] = useState(false)
  const english = factEnglish(fact, settings.phase)
  const category = data.categories.find((c) => c.key === fact.category)?.ja ?? fact.category
  const liked = settings.likedCategories.includes(fact.category)
  // Phase 1〜2 はやさしい版、3以降は標準版の音声
  const ref = bankRef.fact(fact.id, settings.phase <= 2)
  useEffect(() => { void prepare(ref) }, [ref.key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoSpeak) playText({ ref, text: english, voiceURI: settings.voiceURI })
  }, [autoSpeak, english, settings.voiceURI])

  const toggleLike = () => updateSettings({
    likedCategories: liked
      ? settings.likedCategories.filter((c) => c !== fact.category)
      : [...settings.likedCategories, fact.category],
  })

  return (
    <div className={`fact-card${fact.rare ? ' rare' : ''}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="tag">{fact.emoji} {category}</span>
        {fact.rare && <span className="tag rare-tag">✨ レア</span>}
      </div>
      <button className="fact-body" onClick={() => setFlipped(!flipped)} aria-label="タップで日本語と英語を切り替え">
        {flipped ? <p className="fact-ja">{fact.ja}</p> : <p className="fact-en">{english}</p>}
        <span className="muted fact-hint">{flipped ? 'タップで英語に戻る' : 'タップで日本語を見る'}</span>
      </button>
      <div className="row">
        <button className="btn secondary" onClick={() => playText({ ref, text: english, voiceURI: settings.voiceURI })}>🔊 聞く</button>
        <button className="btn secondary" onClick={() => playText({ ref, text: english, voiceURI: settings.voiceURI, rate: 0.8 })}>🐢 ゆっくり</button>
        <button className={`btn ${liked ? '' : 'secondary'}`} onClick={() => void toggleLike()} aria-pressed={liked}>
          {liked ? '★ この分野を多めに' : '☆ もっと知りたい'}
        </button>
      </div>
      <a className="source" href={fact.source} target="_blank" rel="noreferrer">出典：{decodeURIComponent(fact.source.replace(/^https:\/\//, ''))}</a>
    </div>
  )
}
