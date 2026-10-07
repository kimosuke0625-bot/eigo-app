import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type FeedbackSource, type JournalEntry, type Recording } from '../db/schema'
import { Steps } from '../ui/Steps'
import { PixelIcon } from '../ui/PixelIcon'
import { ALL_TYPES } from './errorTypes'
import { parseFeedback, type ParsedFix, type ParsedPhrase } from './parse'
import { IMPORT_XP, saveFeedback, SOURCE_LABELS } from './store'

/** 添削を取り込む画面を開くときに、元の練習を指定する */
export interface FeedbackLink {
  source: FeedbackSource
  journalId?: number
  recordingId?: number
  ref?: string
}

const STEPS = ['返事を貼り付ける', '確かめて直す', '保存']

/**
 * 添削を取り込む：Claude の返事を貼り付けると「アプリ取り込み用のまとめ」を読み取る。
 * 保存する前に、読み取った直しと表現を確かめて直せる。読み取れなかった所は手で入力する。
 */
export function ImportScreen({ link, onExit, onNotebook }: { link?: FeedbackLink; onExit: () => void; onNotebook: () => void }) {
  const [raw, setRaw] = useState('')
  const [stage, setStage] = useState<'paste' | 'check' | 'saved'>('paste')
  const [found, setFound] = useState(true)
  const [leftovers, setLeftovers] = useState<string[]>([])
  const [fixes, setFixes] = useState<ParsedFix[]>([])
  const [phrases, setPhrases] = useState<ParsedPhrase[]>([])
  const [source, setSource] = useState<FeedbackSource>(link?.source ?? 'write')
  const [target, setTarget] = useState(() => (link?.journalId ? `j:${link.journalId}` : link?.recordingId ? `r:${link.recordingId}` : 'auto'))
  const [pasteError, setPasteError] = useState(false)
  const [saved, setSaved] = useState<{ fixes: number; phrases: number } | null>(null)

  // 元の練習の候補：最近の作文・音声日記と、スピーチの録音（3回目）
  const recent = useLiveQuery(async () => {
    const journal = (await db.journal.orderBy('at').reverse().limit(30).toArray()).filter((j) => j.kind !== 'assessment').slice(0, 12)
    const speech = (await db.recordings.where('kind').equals('speech').reverse().sortBy('at')).filter((r) => r.transcript && r.round === 3).slice(0, 6)
    return { journal, speech }
  }, [], { journal: [] as JournalEntry[], speech: [] as Recording[] })

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) { setRaw(t); setPasteError(false) }
    } catch {
      setPasteError(true)
    }
  }

  const read = () => {
    const r = parseFeedback(raw)
    setFound(r.found)
    setLeftovers(r.leftovers)
    setFixes(r.fixes)
    setPhrases(r.phrases)
    if (r.source && !link) setSource(r.source)
    setStage('check')
    window.scrollTo({ top: 0 })
  }

  // 「自動」は、同じ種類のいちばん新しい記録につなげる
  const resolveTarget = () => {
    let t = target
    if (t === 'auto') {
      if (source === 'write' || source === 'diary') {
        const j = recent.journal.find((x) => x.kind === source)
        t = j ? `j:${j.id}` : 'none'
      } else if (source === 'speech') {
        t = recent.speech[0] ? `r:${recent.speech[0].id}` : 'none'
      } else t = 'none'
    }
    const [k, id] = t.split(':')
    const journal = k === 'j' ? recent.journal.find((x) => x.id === Number(id)) : undefined
    return {
      journalId: journal?.id,
      recordingId: k === 'r' ? Number(id) : journal?.recordingId,
    }
  }

  const save = async () => {
    const { journalId, recordingId } = resolveTarget()
    await saveFeedback({ source, journalId, recordingId, ref: link?.ref, raw, fixes, phrases })
    setSaved({ fixes: fixes.filter((f) => f.original.trim() || f.corrected.trim()).length, phrases: phrases.filter((p) => p.expression.trim()).length })
    setStage('saved')
    window.scrollTo({ top: 0 })
  }

  const setFix = (i: number, patch: Partial<ParsedFix>) => setFixes(fixes.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const setPhrase = (i: number, patch: Partial<ParsedPhrase>) => setPhrases(phrases.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const label = (j: JournalEntry) => `${j.day.slice(5).replace('-', '/')} ${j.kind === 'diary' ? '音声日記' : '作文'}「${j.text.slice(0, 24) || j.prompt.slice(0, 24)}…」`

  return (
    <div className="notes">
      <Steps steps={STEPS} current={stage === 'paste' ? 0 : stage === 'check' ? 1 : 2}
        guide={stage === 'paste' ? 'Claude の返事を全部コピーして、下に貼り付けましょう。'
          : stage === 'check' ? '読み取った内容を確かめましょう。違う所は直し、足りない所は手で入力できます。'
            : '保存しました。'} />

      {stage === 'paste' && (
        <section className="card stack">
          <h2 className="win-title">師匠の手紙を持ち帰る</h2>
          <p>Claude の返事の最後にある「アプリ取り込み用のまとめ」を読み取ります。返事を丸ごと貼っても、まとめの部分だけを貼っても大丈夫です。</p>
          <button className="btn secondary block" onClick={() => void pasteFromClipboard()}>📋 コピーした返事を貼り付ける</button>
          {pasteError && <p className="banner warn">自動で貼り付けられませんでした。下の欄を長押しして「ペースト」を選んでください。</p>}
          <textarea className="paste-area" rows={10} value={raw} onChange={(e) => setRaw(e.target.value)}
            placeholder={'【アプリ取り込み用のまとめ】\n種類：音声日記\n■直し 1\n元の文：…'} />
          <button className="btn block" disabled={!raw.trim()} onClick={read}>読み取る</button>
          <button className="link-btn" onClick={() => { setRaw(''); setFound(true); setFixes([{ original: '', corrected: '', type: 'その他', note: '' }]); setPhrases([]); setStage('check') }}>
            貼り付けずに、手で入力する
          </button>
        </section>
      )}

      {stage === 'check' && (
        <>
          <section className="card stack">
            <h2 className="win-title">読み取った結果</h2>
            {raw.trim() && (found
              ? <p className="banner ok">直し {fixes.length}つ、新しい表現 {phrases.length}つを読み取りました。</p>
              : <p className="banner warn">決まった形式のまとめが見つかりませんでした。読み取れた分だけ出しています（直し {fixes.length}つ、表現 {phrases.length}つ）。足りない所は手で入力してください。</p>)}
            {leftovers.length > 0 && (
              <details>
                <summary>読み取れなかった行（{leftovers.length}行）</summary>
                <pre className="prompt-text">{leftovers.join('\n')}</pre>
              </details>
            )}
            <label className="field">
              <span>どの練習の添削か</span>
              <select value={source} onChange={(e) => { setSource(e.target.value as FeedbackSource); setTarget('auto') }}>
                {(Object.keys(SOURCE_LABELS) as FeedbackSource[]).map((k) => <option key={k} value={k}>{SOURCE_LABELS[k]}</option>)}
              </select>
            </label>
            {(source === 'write' || source === 'diary' || source === 'speech') && (
              <label className="field">
                <span>元の{source === 'speech' ? '録音' : source === 'diary' ? '音声日記' : '作文'}（あとで並べて見返せます）</span>
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="auto">いちばん新しいもの</option>
                  {source !== 'speech' && recent.journal.filter((j) => j.kind === source).map((j) => <option key={j.id} value={`j:${j.id}`}>{label(j)}</option>)}
                  {source === 'speech' && recent.speech.map((r) => <option key={r.id} value={`r:${r.id}`}>{new Date(r.at).toLocaleDateString('ja-JP')} 「{r.transcript!.slice(0, 24)}…」</option>)}
                  <option value="none">つなげない</option>
                </select>
              </label>
            )}
          </section>

          <h3 className="quest-board-title"><PixelIcon name="scroll" size={20} /> 直し（{fixes.length}）</h3>
          {fixes.map((f, i) => (
            <section className="card stack edit-card" key={i}>
              <h2 className="win-title">直し {i + 1}</h2>
              <label className="field"><span>元の文</span>
                <textarea rows={2} value={f.original} onChange={(e) => setFix(i, { original: e.target.value })} /></label>
              <label className="field"><span>直した文</span>
                <textarea rows={2} value={f.corrected} onChange={(e) => setFix(i, { corrected: e.target.value })} /></label>
              <label className="field"><span>間違いの種類</span>
                <select value={f.type || 'その他'} onChange={(e) => setFix(i, { type: e.target.value })}>
                  {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select></label>
              <label className="field"><span>短い解説</span>
                <textarea rows={2} value={f.note} onChange={(e) => setFix(i, { note: e.target.value })} /></label>
              <button className="link-btn" onClick={() => setFixes(fixes.filter((_, j) => j !== i))}>この直しを外す</button>
            </section>
          ))}
          <button className="btn secondary block" onClick={() => setFixes([...fixes, { original: '', corrected: '', type: 'その他', note: '' }])}>＋ 直しを手で追加</button>

          <h3 className="quest-board-title"><PixelIcon name="book" size={20} /> 新しい表現（{phrases.length}）</h3>
          <p className="muted">保存した表現は「旅の手帳」に入り、復習カードにも加わります。</p>
          {phrases.map((p, i) => (
            <section className="card stack edit-card" key={i}>
              <h2 className="win-title">表現 {i + 1}</h2>
              <label className="field"><span>表現（英語）</span>
                <input type="text" value={p.expression} onChange={(e) => setPhrase(i, { expression: e.target.value })} autoCapitalize="off" /></label>
              <label className="field"><span>意味</span>
                <input type="text" value={p.meaning} onChange={(e) => setPhrase(i, { meaning: e.target.value })} /></label>
              <label className="field"><span>例文（英語）</span>
                <textarea rows={2} value={p.example} onChange={(e) => setPhrase(i, { example: e.target.value })} /></label>
              <label className="field"><span>使う場面</span>
                <input type="text" value={p.scene} onChange={(e) => setPhrase(i, { scene: e.target.value })} /></label>
              <button className="link-btn" onClick={() => setPhrases(phrases.filter((_, j) => j !== i))}>この表現を外す</button>
            </section>
          ))}
          <button className="btn secondary block" onClick={() => setPhrases([...phrases, { expression: '', meaning: '', example: '', scene: '' }])}>＋ 表現を手で追加</button>

          <div className="stack" style={{ marginTop: 16 }}>
            <button className="btn block" disabled={!fixes.some((f) => f.original.trim() || f.corrected.trim()) && !phrases.some((p) => p.expression.trim())}
              onClick={() => void save()}>保存する（+{IMPORT_XP} XP）</button>
            <button className="btn secondary block" onClick={() => setStage('paste')}>貼り付けからやり直す</button>
          </div>
        </>
      )}

      {stage === 'saved' && saved && (
        <section className="card stack">
          <h2 className="win-title">持ち帰りました</h2>
          <p className="result-lead">直し {saved.fixes}つ、新しい表現 {saved.phrases}つを保存しました。<span className="xp-chip">+{IMPORT_XP} XP</span></p>
          <p className="muted">直しは「弱点の研究」と「言い直しの練習」に、表現は「旅の手帳」と復習カードに入りました。</p>
          <button className="btn block" onClick={onNotebook}>旅の手帳を見る</button>
          <button className="btn secondary block" onClick={() => { setRaw(''); setFixes([]); setPhrases([]); setStage('paste') }}>別の返事を取り込む</button>
        </section>
      )}
      <button className="btn secondary block" style={{ marginTop: 12 }} onClick={onExit}>{stage === 'saved' ? '戻る' : 'やめる（保存しません）'}</button>
    </div>
  )
}
