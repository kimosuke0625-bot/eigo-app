import { Fragment, useEffect, useState, type ReactNode } from 'react'
import type { Example, Item } from '../db/schema'
import { bankRef, playText, prepare, type BankRef } from '../speech/audioBank'
import { hideExample, restoreExamples, saveGloss, useEdited } from '../content/edits'
import { prepareMine } from '../speech/myAudio'

export function SpeakButton({ text, voiceURI, rate = 1, label = '読み上げ', big = false, bank }: {
  text: string
  voiceURI: string
  /** 音声置き場の音声（あれば PC で作った音声で再生する） */
  bank?: BankRef
  rate?: number
  label?: string
  big?: boolean
}) {
  // 表示されたら音声を先に用意しておき、押した瞬間に鳴るようにする
  useEffect(() => { if (bank) void prepare(bank) }, [bank?.kind, bank?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  // 自分の音声（旅の手帳）があれば、それも用意しておく
  useEffect(() => { void prepareMine(text) }, [text])
  return (
    <button type="button" className={big ? 'btn secondary speak-big' : 'icon-btn'} aria-label={label}
      onClick={(e) => { e.stopPropagation(); playText({ ref: bank, text, voiceURI, rate }) }}>
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

function ExampleLine({ ex, item, voiceURI, showJa, canReplace }: {
  ex: Example
  item: Item
  voiceURI: string
  showJa: boolean
  canReplace: boolean
}) {
  const [confirm, setConfirm] = useState(false)
  return (
    <li className="example">
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="en"><Highlight text={ex.en} forms={item.forms ?? [item.english]} /></div>
          {showJa && <div className="muted">{ex.ja}</div>}
        </div>
        <SpeakButton text={ex.en} voiceURI={voiceURI} label="例文を読み上げ" bank={bankRef.example(ex.en)} />
      </div>
      <div className="row example-meta">
        {ex.enId ? (
          <a className="source" href={`https://tatoeba.org/ja/sentences/show/${ex.enId}`} target="_blank" rel="noreferrer">
            Tatoeba #{ex.enId}
          </a>
        ) : <span className="source">このアプリで作成</span>}
        {showJa && !confirm && (
          <button className="mini-btn" onClick={(e) => { e.stopPropagation(); setConfirm(true) }}>意訳を報告</button>
        )}
      </div>
      {confirm && (
        <div className="banner warn" onClick={(e) => e.stopPropagation()}>
          {canReplace
            ? 'この例文を外して、控えの例文に差し替えますか？'
            : '控えの例文がもうありません。この例文を外しますか？'}
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn danger" onClick={() => void hideExample(item.id, ex)}>外す</button>
            <button className="btn secondary" onClick={() => setConfirm(false)}>やめる</button>
          </div>
        </div>
      )}
    </li>
  )
}

/** 日本語訳。その場で書き直せる（端末に保存し、書き出しにも含まれる） */
function Gloss({ item, original }: { item: Item; original: string | undefined }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.japanese ?? '')
  const edited = item.japanese !== original
  if (editing) {
    return (
      <div className="gloss-edit" onClick={(e) => e.stopPropagation()}>
        <input type="text" value={text} autoFocus onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') void saveGloss(item.id, text).then(() => setEditing(false))
          }} />
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn" onClick={() => void saveGloss(item.id, text).then(() => setEditing(false))}>保存</button>
          <button className="btn secondary" onClick={() => setEditing(false)}>やめる</button>
          {edited && (
            <button className="btn secondary" onClick={() => void saveGloss(item.id, '').then(() => setEditing(false))}>
              元の訳に戻す
            </button>
          )}
        </div>
        {edited && <p className="muted">元の訳：{original}</p>}
      </div>
    )
  }
  return (
    <p className="gloss">
      {item.japanese}
      {edited && <span className="tag" style={{ marginLeft: 6 }}>修正済み</span>}
      <button className="mini-btn" aria-label="日本語訳を書き直す"
        onClick={(e) => { e.stopPropagation(); setText(item.japanese ?? ''); setEditing(true) }}>✏️ 訳を直す</button>
    </p>
  )
}

/**
 * 答えの面。Phase に合わせて形を変える。
 * 1: 日本語訳＋例文1つ / 2: 日本語訳＋例文3つまで / 3: やさしい英語の定義＋例文（訳はタップで表示） / 4: 英英のみ
 * 利用者が直した訳や外した例文を反映して表示する。
 */
export function AnswerFace({ item: original, phase, voiceURI, showJa, onToggleJa, hideHeadword = false }: {
  item: Item
  phase: number
  voiceURI: string
  showJa: boolean
  onToggleJa: () => void
  /** 表の面にすでに見出し語が出ているときは繰り返さない */
  hideHeadword?: boolean
}) {
  const item = useEdited(original)
  const english = phase >= 3 && item.definition
  const shown = examplesForPhase(item, phase)
  const canReplace = item.examples.length > shown.length
  const hiddenCount = original.examples.length - item.examples.length
  return (
    <div className={hideHeadword ? 'answer' : 'answer standalone'}>
      {!hideHeadword && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="headword">{item.english}</span>
          <SpeakButton text={item.english} voiceURI={voiceURI} bank={bankRef.head(item.english)} />
        </div>
      )}
      {english ? (
        <>
          <p className="definition">{item.definition}</p>
          {phase === 3 && (
            showJa
              ? <Gloss item={item} original={original.japanese} />
              : <button className="link-btn" onClick={(e) => { e.stopPropagation(); onToggleJa() }}>日本語訳を見る</button>
          )}
        </>
      ) : (
        <Gloss item={item} original={original.japanese} />
      )}
      <ul className="examples">
        {shown.map((ex) => (
          <ExampleLine key={ex.enId ?? ex.en} ex={ex} item={item} voiceURI={voiceURI}
            showJa={phase <= 2 || (phase === 3 && showJa)} canReplace={canReplace} />
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button className="mini-btn" onClick={(e) => { e.stopPropagation(); void restoreExamples(item.id) }}>
          外した例文（{hiddenCount}）を元に戻す
        </button>
      )}
    </div>
  )
}
