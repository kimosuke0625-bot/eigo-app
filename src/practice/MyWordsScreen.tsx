import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { rankLabel } from '../content/ngsl'
import { idiomInfo, loadIdioms } from '../content/idioms'
import { addWords, needsMeaning, parseWordList, planWords, removeMyWord, switchDeck, type PlanRow } from '../content/myWords'
import { Steps } from '../ui/Steps'

const STEPS = ['リストを貼り付ける', '確かめる', '追加']
/** 一度にこれより多く加えると、しばらく復習が重くなることを知らせる */
const MANY = 30

/**
 * 自分で選んだ単語のリストを貼り付けて、単語の復習に加える（2026-10-14 利用者の依頼）。
 * 単語集にある語はその訳と例文を、ない語は自分の訳でカードを作る。
 */
export function MyWordsScreen({ onExit, onReview, onExprReview }: { onExit: () => void; onReview: () => void; onExprReview: () => void }) {
  const [raw, setRaw] = useState('')
  const [stage, setStage] = useState<'paste' | 'check' | 'done'>('paste')
  const [rows, setRows] = useState<PlanRow[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [pasteError, setPasteError] = useState(false)
  const [added, setAdded] = useState({ word: 0, expr: 0 })
  const [busy, setBusy] = useState(false)
  // 「外す」は2回押して確かめる（カードと復習の記録も消えるため）
  const [confirm, setConfirm] = useState('')
  const mine = useLiveQuery(() => db.myWords.orderBy('addedAt').reverse().toArray(), [], [])

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) { setRaw(t); setPasteError(false) }
    } catch {
      setPasteError(true)
    }
  }
  const read = async () => {
    // 熟語集は表現の復習を開くまで読み込まれていないことがあるので、見分ける前に読み込む（通信できないときは熟語集なしで分ける）
    await loadIdioms().catch(() => undefined)
    const r = parseWordList(raw)
    setSkipped(r.skipped)
    setRows(await planWords(r.words))
    setStage('check')
  }
  const setJa = (i: number, ja: string) => setRows(rows.map((r, k) => (k === i ? { ...r, japanese: ja } : r)))
  const missing = rows.filter((r) => needsMeaning(r) && !r.japanese.trim()).length
  const adding = rows.filter((r) => r.kind !== 'reviewing' && !(needsMeaning(r) && !r.japanese.trim()))
  const willAdd = adding.length
  const willWord = adding.filter((r) => r.deck === 'word').length
  const toggle = (i: number) => setRows(rows.map((r, k) => (k === i ? switchDeck(r) : r)))

  return (
    <div>
      <Steps steps={STEPS} current={stage === 'paste' ? 0 : stage === 'check' ? 1 : 2}
        guide={stage === 'paste' ? '1行に1語（熟語も可）。「英語 - 訳」のように訳を付けてもOK。' : stage === 'check' ? '単語と熟語・表現に分けました。新しく作るものには訳を入れてから、追加しましょう。' : '単語は単語の復習、熟語・表現は表現の復習で出題されます。'} />

      {stage === 'paste' && (
        <section className="card stack">
          <h2>自分の単語を追加</h2>
          <p className="muted">仕事や読み物で出会った語を貼り付けると、復習に加わります。単語と熟語・表現は自動で分けます。単語集（NGSL・ビジネス語彙）や熟語集（300個）にあるものは、その訳と実在の例文を使います。ないものは自分の訳でカードを作ります（2語以上の表現は旅の手帳にも入ります）。</p>
          <button className="btn secondary block" onClick={() => void pasteFromClipboard()}>📋 コピーしたリストを貼り付ける</button>
          {pasteError && <p className="banner warn">自動で貼り付けられませんでした。下の欄を長押しして「ペースト」を選んでください。</p>}
          <textarea className="paste-area" rows={10} value={raw} onChange={(e) => setRaw(e.target.value)}
            placeholder={'resilient - 立ち直りが早い\nleverage：活用する\nlook forward to ~\ntouch base - 連絡を取る\nnegotiate, deadline, agenda'} />
          <button className="btn block" disabled={!raw.trim()} onClick={() => void read()}>読み取る</button>
          <button className="btn secondary block" onClick={onExit}>戻る</button>
        </section>
      )}

      {stage === 'check' && (
        <section className="card stack">
          <h2>読み取った語（{rows.length}）</h2>
          {rows.length === 0 && <p className="banner warn">英語の語を読み取れませんでした。1行に1語ずつ書いてみてください。</p>}
          <ul className="mywords-list">
            {rows.map((r, i) => (
              <li key={`${i}-${r.english}`} className="stack">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong lang="en">{r.item?.english ?? r.english}</strong>
                  <span>
                    <span className="tag">{r.deck === 'word' ? '単語' : '熟語・表現'}</span>
                    <span className={`tag${needsMeaning(r) ? ' warn' : ''}`}>
                      {r.kind === 'listed' ? `単語集（${rankLabel(r.item!)}）` : r.kind === 'idiom' ? '熟語集' : r.kind === 'reviewing' ? 'すでに復習中' : r.item ? '旅の手帳' : '新しく作る'}
                    </span>
                  </span>
                </div>
                {needsMeaning(r) && (
                  <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => toggle(i)}>
                    {r.deck === 'word' ? '→ 熟語・表現として加える' : '→ 単語として加える'}
                  </button>
                )}
                {r.item && r.item.english.toLowerCase() !== r.english.toLowerCase() && <p className="muted">「{r.english}」は「{r.item.english}」の形として加えます。</p>}
                {r.item && <p className="muted">{r.kind === 'idiom' ? '熟語集' : r.deck === 'word' ? '単語集' : '旅の手帳'}の訳：{r.item.japanese}{r.item.examples.length ? `（例文 ${r.item.examples.length}）` : ''}</p>}
                {r.kind === 'idiom' && (idiomInfo(r.itemId)?.senseCount ?? 1) > 1 && <p className="muted">意味が複数ある熟語なので、いちばんよく使う意味のカードを加えます（ほかの意味は表現の復習で順に出ます）。</p>}
                {(needsMeaning(r) || (r.deck === 'word' && r.item)) && (
                  <label className="field"><span>{needsMeaning(r) ? '訳（必ず入れる）' : '自分の訳（入れると、この訳に書き直す）'}</span>
                    <input value={r.japanese} onChange={(e) => setJa(i, e.target.value)} placeholder={needsMeaning(r) ? '例：立ち直りが早い' : '空のままなら単語集の訳'} /></label>
                )}
              </li>
            ))}
          </ul>
          {skipped.length > 0 && <p className="muted">英語として読めなかった行（外しました）：{skipped.join(' ／ ')}</p>}
          {missing > 0 && <p className="banner warn">訳のない新しい語・表現が {missing} 個あります。訳を入れないと、それは加えません。</p>}
          {willAdd > MANY && <p className="banner info">一度に {willAdd} 個加えると、しばらく毎日の復習が多くなります。少しずつ分けて加えてもかまいません。</p>}
          <button className="btn block" disabled={busy || willAdd === 0} onClick={async () => {
            setBusy(true)
            setAdded(await addWords(rows))
            setBusy(false)
            setStage('done')
          }}>{willWord && willAdd - willWord ? `単語 ${willWord} 個・熟語と表現 ${willAdd - willWord} 個を加える` : `${willWord ? '単語の復習' : '表現の復習'}に ${willAdd} 個加える`}</button>
          <button className="btn secondary block" onClick={() => setStage('paste')}>貼り付けに戻る</button>
        </section>
      )}

      {stage === 'done' && (
        <section className="card stack" style={{ textAlign: 'center' }}>
          <h2>単語 {added.word} 個・熟語と表現 {added.expr} 個を加えました</h2>
          <p className="muted">単語は「単語の復習」、熟語と表現は「表現の復習」で、今日から出題されます（1日の新しいカードの数とは別に加わります）。</p>
          {added.word > 0 && <button className="btn block" onClick={onReview}>単語の復習へ</button>}
          {added.expr > 0 && <button className={`btn ${added.word > 0 ? 'secondary ' : ''}block`} onClick={onExprReview}>表現の復習へ</button>}
          <button className="btn secondary block" onClick={() => { setRaw(''); setRows([]); setStage('paste') }}>続けて追加する</button>
          <button className="btn secondary block" onClick={onExit}>閉じる</button>
        </section>
      )}

      {stage !== 'check' && mine.length > 0 && (
        <section className="card stack">
          <details>
            <summary>自分で加えた語（{mine.length}）</summary>
            <ul className="mywords-list">
              {mine.map((w) => (
                <li key={w.itemId} className="row" style={{ justifyContent: 'space-between' }}>
                  <span><strong lang="en">{w.english}</strong>{w.japanese && <span className="muted">　{w.japanese}</span>}{w.custom && <span className="tag">自作</span>}</span>
                  {confirm === w.itemId
                    ? <button className="link-btn" onClick={() => { void removeMyWord(w.itemId); setConfirm('') }}>本当に外す</button>
                    : <button className="link-btn" onClick={() => setConfirm(w.itemId)}>外す</button>}
                </li>
              ))}
            </ul>
            <p className="muted">「外す」と、その語のカードと復習の記録も消えます。</p>
          </details>
        </section>
      )}
    </div>
  )
}
