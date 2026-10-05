import { Fragment, useEffect, useState } from 'react'
import { db, type Item, type Settings } from '../db/schema'
import { applyEdit } from '../content/edits'
import { fitOf, FIT_LABELS, knownRatio, loadFormIndex, loadKnownSet, type RatioResult } from '../content/knownRatio'
import type { Mat, Question } from '../content/materials'
import { introduce } from '../srs/store'
import { speak } from '../speech/voices'

/** 既知語率の計算に使う「知っている語」と語形の索引 */
export function useKnowledge() {
  const [state, setState] = useState<{ known: Set<string>; index: Map<string, string> }>()
  useEffect(() => {
    let alive = true
    void Promise.all([loadKnownSet(), loadFormIndex()]).then(([known, index]) => alive && setState({ known, index }))
    return () => { alive = false }
  }, [])
  return state
}

export function ratioOf(m: Mat, k: { known: Set<string>; index: Map<string, string> }): RatioResult {
  return knownRatio(m.body, k.index, k.known)
}

export function FitBadge({ ratio }: { ratio: number }) {
  const fit = fitOf(ratio)
  return <span className={`tag fit-${fit}`}>既知語 {Math.round(ratio * 100)}%・{FIT_LABELS[fit]}</span>
}

/** 語をタップしたときの説明。NGSL の語なら訳を出し、カードに追加できる */
function WordPopup({ word, itemId, settings, onClose }: {
  word: string
  itemId?: string
  settings: Settings
  onClose: () => void
}) {
  const [item, setItem] = useState<Item | null | undefined>(undefined)
  const [status, setStatus] = useState<'none' | 'card' | 'known'>('none')
  useEffect(() => {
    if (!itemId) { setItem(null); return }
    void (async () => {
      const raw = await db.items.get(itemId)
      setItem(raw ? applyEdit(raw, await db.edits.get(itemId)) : null)
      if (await db.cards.where('itemId').equals(itemId).count()) setStatus('card')
      else if (await db.knownWords.get(itemId)) setStatus('known')
    })()
  }, [itemId])
  return (
    <div className="word-popup" role="dialog" aria-label={`${word} の意味`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong style={{ fontSize: '1.1rem' }}>{item?.english ?? word}</strong>
        <div className="row">
          <button className="icon-btn" aria-label="読み上げ" onClick={() => speak(item?.english ?? word, settings.voiceURI)}>🔊</button>
          <button className="icon-btn" aria-label="閉じる" onClick={onClose}>✕</button>
        </div>
      </div>
      {item === undefined && <p className="muted">…</p>}
      {item === null && <p className="muted">NGSL（基本2,809語）に入っていない語です。固有名詞や専門的な語の可能性があります。</p>}
      {item && (
        <>
          <p>{settings.phase >= 3 && item.definition ? item.definition : item.japanese}</p>
          {settings.phase >= 3 && item.definition && <p className="muted">{item.japanese}</p>}
          <p className="muted">NGSL {item.ngslRank}位</p>
          {status === 'none' && (
            <button className="btn block" onClick={() => void introduce(item.id).then(() => setStatus('card'))}>＋ 復習カードに追加</button>
          )}
          {status === 'card' && <p className="muted">✓ 復習カードに入っています</p>}
          {status === 'known' && <p className="muted">✓ 知っている語として登録済み</p>}
        </>
      )}
    </div>
  )
}

/** 本文。読み上げ中の文を強調し、語をタップすると意味を出す */
export function MaterialText({ sentences, breaks, current, index, settings, onSentence }: {
  sentences: string[]
  /** 段落の始まりになる文の番号 */
  breaks?: Set<number>
  current: number
  index: Map<string, string>
  settings: Settings
  onSentence?: (i: number) => void
}) {
  const [popup, setPopup] = useState<{ word: string; itemId?: string } | null>(null)
  const lookup = (raw: string) => {
    const lower = raw.toLowerCase().replace(/['’](s|re|ve|ll|d|m)$/, '').replace(/n['’]t$/, '')
    setPopup({ word: raw, itemId: index.get(lower) })
  }
  return (
    <div className="material-text">
      {sentences.map((s, i) => (
        <Fragment key={i}>
        {i > 0 && breaks?.has(i) && <span className="para-break" />}
        <span className={i === current ? 'sentence now' : 'sentence'}
          onDoubleClick={() => onSentence?.(i)}>
          {s.split(/([A-Za-z]+(?:['’][A-Za-z]+)*)/).map((part, j) =>
            /^[A-Za-z]/.test(part)
              ? <button key={j} className="w" onClick={() => lookup(part)}>{part}</button>
              : <Fragment key={j}>{part}</Fragment>,
          )}{' '}
        </span>
        </Fragment>
      ))}
      {popup && <WordPopup word={popup.word} itemId={popup.itemId} settings={settings} onClose={() => setPopup(null)} />}
    </div>
  )
}

/** 内容確認の質問。全部答えると正答率を返す */
export function QuestionsPanel({ questions, onDone }: { questions: Question[]; onDone: (score: number) => void }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null))
  const all = answers.every((a) => a !== null)
  const correct = answers.filter((a, i) => a === questions[i].answer).length
  const [reported, setReported] = useState(false)
  useEffect(() => {
    if (all && !reported) { setReported(true); onDone(correct / questions.length) }
  }, [all, reported, correct, questions.length, onDone])
  return (
    <div className="stack">
      {questions.map((q, i) => (
        <div key={i} className="question">
          <p><strong>Q{i + 1}.</strong> {q.q}</p>
          <div className="options">
            {q.options.map((o, j) => {
              const chosen = answers[i] === j
              const state = answers[i] === null ? '' : j === q.answer ? 'right' : chosen ? 'wrong' : ''
              return (
                <button key={j} className={`option ${state}`} disabled={answers[i] !== null}
                  onClick={() => setAnswers(answers.map((a, k) => (k === i ? j : a)))}>
                  {o}{state === 'right' && ' ✓'}{state === 'wrong' && ' ✗'}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {all && <p className="banner ok">内容確認：{questions.length}問中 {correct}問 正解</p>}
    </div>
  )
}
