import { Fragment, type ReactNode } from 'react'
import type { Example, Item } from '../db/schema'
import { speak } from '../speech/voices'

export function SpeakButton({ text, voiceURI, rate = 1, label = '読み上げ', big = false }: {
  text: string
  voiceURI: string
  rate?: number
  label?: string
  big?: boolean
}) {
  return (
    <button type="button" className={big ? 'btn secondary speak-big' : 'icon-btn'} aria-label={label}
      onClick={(e) => { e.stopPropagation(); speak(text, voiceURI, rate) }}>
      🔊{big && <span> {label}</span>}
    </button>
  )
}

/** 例文の中の見出し語（活用形を含む）を太字にする */
export function Highlight({ text, forms }: { text: string; forms: string[] }): ReactNode {
  const set = new Set(forms.map((f) => f.toLowerCase()))
  const parts = text.split(/([A-Za-z']+)/)
  return parts.map((p, i) =>
    set.has(p.toLowerCase()) ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>,
  )
}

export function examplesForPhase(item: Item, phase: number): Example[] {
  return item.examples.slice(0, phase === 1 ? 1 : 3)
}

function ExampleLine({ ex, item, voiceURI, showJa }: { ex: Example; item: Item; voiceURI: string; showJa: boolean }) {
  return (
    <li className="example">
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="en"><Highlight text={ex.en} forms={item.forms ?? [item.english]} /></div>
          {showJa && <div className="muted">{ex.ja}</div>}
        </div>
        <SpeakButton text={ex.en} voiceURI={voiceURI} label="例文を読み上げ" />
      </div>
      {ex.enId && (
        <a className="source" href={`https://tatoeba.org/ja/sentences/show/${ex.enId}`} target="_blank" rel="noreferrer">
          Tatoeba #{ex.enId}
        </a>
      )}
    </li>
  )
}

/**
 * 答えの面。Phase に合わせて形を変える。
 * 1: 日本語訳＋例文1つ / 2: 日本語訳＋例文3つまで / 3: やさしい英語の定義＋例文（訳はタップで表示） / 4: 英英のみ
 */
export function AnswerFace({ item, phase, voiceURI, showJa, onToggleJa, hideHeadword = false }: {
  item: Item
  phase: number
  voiceURI: string
  showJa: boolean
  onToggleJa: () => void
  /** 表の面にすでに見出し語が出ているときは繰り返さない */
  hideHeadword?: boolean
}) {
  const english = phase >= 3 && item.definition
  return (
    <div className={hideHeadword ? 'answer' : 'answer standalone'}>
      {!hideHeadword && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="headword">{item.english}</span>
          <SpeakButton text={item.english} voiceURI={voiceURI} />
        </div>
      )}
      {english ? (
        <>
          <p className="definition">{item.definition}</p>
          {phase === 3 && (
            showJa
              ? <p className="gloss">{item.japanese}</p>
              : <button className="link-btn" onClick={onToggleJa}>日本語訳を見る</button>
          )}
        </>
      ) : (
        <p className="gloss">{item.japanese}</p>
      )}
      <ul className="examples">
        {examplesForPhase(item, phase).map((ex, i) => (
          <ExampleLine key={i} ex={ex} item={item} voiceURI={voiceURI} showJa={phase <= 2 || (phase === 3 && showJa)} />
        ))}
      </ul>
    </div>
  )
}
