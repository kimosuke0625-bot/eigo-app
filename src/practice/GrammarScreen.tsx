import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Card, type Settings } from '../db/schema'
import {
  EXERCISE_LABELS, finishedItems, findExercise, isAccepted, loadGrammar, reportGrammar, shuffledTokens,
  type GrammarData, type GrammarExercise, type GrammarItem,
} from '../content/grammar'
import { EXPR_MAX_PER_DAY, introduce, recordReview, todaysQueue } from '../srs/store'
import { nextCard, startOfDay } from '../srs/queue'
import { GRAM_PREFIX } from '../srs/deck'
import type { Grade } from '../srs/fsrs'
import { bankRef } from '../speech/audioBank'
import { SpeakButton } from './WordParts'
import { useSessionTimer } from './useSessionTimer'
import { Steps } from '../ui/Steps'
import { PixelIcon } from '../ui/PixelIcon'
import { addXp, reviewXp } from '../rewards/xp'
import { playCorrect, playTry } from '../rewards/sound'

type View = { kind: 'map' } | { kind: 'lesson'; id: string } | { kind: 'review' }

/**
 * 文法の修行（フェーズ9）。修行の地図 → 1項目の修行（解説 → 練習 → 口頭で即答 → 自分のことを1文）→ 解いた問題は文法の復習に出る。
 * 学習時間は「言語の学習」。
 */
export function GrammarScreen({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  const result = useSessionTimer('grammar', 'language')
  const [data, setData] = useState<GrammarData | null>(null)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>({ kind: 'map' })
  // 「この練習について」は画面の上の「？」（初めて開いたときは自動で出る。App.tsx の HelpButton）
  useEffect(() => { loadGrammar().then(setData).catch((e: Error) => setError(e.message)) }, [])

  if (error) return <div className="stack"><p className="banner warn">{error}（通信できるときにもう一度開いてください）</p><button className="btn secondary block" onClick={onExit}>戻る</button></div>
  if (!data) return <p className="muted">読み込み中…</p>
  const back = () => setView({ kind: 'map' })
  return (
    <>
      {view.kind === 'map' && <GrammarMap data={data} onOpen={(id) => setView({ kind: 'lesson', id })} onReview={() => setView({ kind: 'review' })} onExit={onExit} />}
      {view.kind === 'lesson' && (
        <Lesson key={view.id} item={data.items.find((x) => x.id === view.id)!} settings={settings} onBack={back}
          onExercise={() => { result.current.exercises = (result.current.exercises ?? 0) + 1 }} />
      )}
      {view.kind === 'review' && <GrammarReview data={data} settings={settings} onBack={back} />}
    </>
  )
}

/** 修行の地図：まとまり（町）ごとに修行場（項目）を並べる。終えた修行場には印が付く */
function GrammarMap({ data, onOpen, onReview, onExit }: { data: GrammarData; onOpen: (id: string) => void; onReview: () => void; onExit: () => void }) {
  const done = useLiveQuery(() => finishedItems(data), [data], new Set<string>())
  const due = useLiveQuery(async () => (await db.cards.where('itemId').startsWith(GRAM_PREFIX).toArray()).filter((c) => c.due <= Date.now()).length, [], 0)
  const stages = [...new Set(data.items.map((x) => x.stage))]
  return (
    <div className="stack gram-map">
      <section className="card">
        <h2 className="win-title"><PixelIcon name="scroll" size={20} /> 修行の地図（中学・高校・その先）</h2>
        <p className="muted">項目の並びは学習指導要領（小学校・中学校・高等学校の外国語）の文法事項に沿い、その先は CEFR-J Grammar Profile のレベル順です。全部で{data.items.length}項目です。</p>
        <button className="btn block" disabled={due === 0} onClick={onReview}>文法の復習 {due > 0 ? `（${due}問）` : '（今日の分はありません）'}</button>
      </section>
      {stages.map((st) => (
        <section className="card gram-town" key={st}>
          <h3>{st}</h3>
          <ol className="gram-places">
            {data.items.filter((x) => x.stage === st).map((it) => (
              <li key={it.id}>
                <button className={`menu-item as-button${done.has(it.id) ? ' gram-done' : ''}`} onClick={() => onOpen(it.id)}>
                  <span className="gram-no">{it.no}</span>
                  <div className="body">
                    <div className="name">{it.title}</div>
                    <div className="muted">{done.has(it.id) ? '修行ずみ（問題は復習に出ます）' : `問題 ${it.exercises.length}問・口頭で即答・自分のことを1文`}</div>
                  </div>
                  {done.has(it.id) ? <span className="gram-stamp" aria-label="修行ずみ">済</span> : <span className="min">▶</span>}
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <button className="btn secondary block" onClick={onExit}>戻る</button>
    </div>
  )
}

const LESSON_STEPS = ['解説', '練習', '口頭で即答', '自分のことを1文']

/** 1項目の修行 */
function Lesson({ item, settings, onBack, onExercise }: { item: GrammarItem; settings: Settings; onBack: () => void; onExercise: () => void }) {
  const [step, setStep] = useState(0)
  const [idx, setIdx] = useState(0)
  const grades = useRef<{ grade: Grade; ms: number }[]>([])
  const [already, setAlready] = useState(false)
  useEffect(() => {
    void db.cards.where('itemId').anyOf(item.exercises.map((x) => x.id)).count().then((n) => setAlready(n === item.exercises.length))
  }, [item])
  const firstOral = item.exercises.findIndex((x) => x.type === 'oral')
  const stepNow = step === 0 ? 0 : step === 2 ? 3 : step === 3 ? 4 : idx >= firstOral ? 2 : 1

  const finish = useCallback(async () => {
    // 修行で解いた結果を最初の評価にして、問題を文法の復習カードにする（もう一度修行したときは記録しない）
    if (!already) {
      const now = Date.now()
      for (const [i, x] of item.exercises.entries()) {
        await introduce(x.id, now)
        const card = await db.cards.where('itemId').equals(x.id).first()
        const g = grades.current[i]
        if (card && g) await recordReview(card, g.grade, { answerMs: g.ms, mode: `grammar-${x.type}`, now })
      }
    }
    setStep(3)
  }, [already, item])

  return (
    <div className="stack gram-lesson">
      <div className="gram-head">
        <span className="gram-no">{item.no}</span>
        <div><div className="muted">{item.stage}</div><h2>{item.title}</h2></div>
      </div>
      <Steps steps={LESSON_STEPS} current={stepNow}
        guide={stepNow === 0 ? 'ポイントと例文を読み、例文は声に出してまねしましょう。' : stepNow === 1 ? '答えてから、正しい文を声に出して読みましょう。' : stepNow === 2 ? '日本語を見て、5秒以内に英語で言ってみましょう。' : '学んだ形で、自分のことを1文言ってみましょう。'} />

      {step === 0 && (
        <>
          <Explanation item={item} settings={settings} />
          <button className="btn block" onClick={() => setStep(1)}>練習へ（{item.exercises.length}問）</button>
        </>
      )}
      {step === 1 && (
        <>
          <p className="muted gram-count">{idx + 1} / {item.exercises.length}　{EXERCISE_LABELS[item.exercises[idx].type]}</p>
          <ExerciseView key={item.exercises[idx].id} item={item} ex={item.exercises[idx]} settings={settings}
            onNext={(grade, ms) => {
              grades.current[idx] = { grade, ms }
              onExercise()
              if (idx + 1 < item.exercises.length) setIdx(idx + 1)
              else setStep(2)
            }} />
        </>
      )}
      {step === 2 && <Myself item={item} onDone={() => void finish()} />}
      {step === 3 && (
        <section className="card stack" style={{ textAlign: 'center' }}>
          <h2 className="win-title">修行完了</h2>
          <p className="gram-stamp big" aria-hidden>済</p>
          <p>{item.no}. {item.title}</p>
          <p className="muted">{already ? 'もう一度の修行でした（復習の予定は変わりません）。' : `解いた${item.exercises.length}問は、文法の復習で間を空けて出題されます。`}</p>
          <button className="btn block" onClick={onBack}>修行の地図へ</button>
        </section>
      )}
      {step < 3 && <button className="btn secondary block" onClick={onBack}>ここでやめる（地図へ）</button>}
    </div>
  )
}

/** 解説：ポイント・例文・まちがいの例（✕ 文法の誤り／△ 正式な場面では避ける／△ 意味が違う）・出典・疑問の記録 */
function Explanation({ item, settings }: { item: GrammarItem; settings: Settings }) {
  const points = item.points.filter((p) => settings.grammarShowUnverified || !p.check)
  const errors = item.mistakes.filter((m) => m.kind === 'error')
  const informals = item.mistakes.filter((m) => m.kind === 'informal')
  const meanings = item.mistakes.filter((m) => m.kind === 'meaning')
  return (
    <>
      <section className="card gram-points">
        <h3>ポイント</h3>
        <ul>
          {points.map((p, i) => (
            <li key={i}>
              {p.check && <span className="tag warn">要確認</span>}{p.text}
              {p.en && <span className="gram-inline" lang="en">{p.en.join('　')}</span>}
            </li>
          ))}
        </ul>
      </section>
      <section className="card gram-examples">
        <h3>例文</h3>
        <ul>
          {item.examples.map((e) => (
            <li key={e.en} className="row phrase-ex">
              <div style={{ flex: 1 }}>
                <span className="en" lang="en">{e.en}</span>
                {e.ja && <span className="ja">{e.ja}</span>}
                <span className="gram-src">{e.source === 'tatoeba' ? `Tatoeba #${e.enId}` : '自作（LanguageTool で確認）'}</span>
              </div>
              <SpeakButton text={e.en} bank={bankRef.example(e.en)} voiceURI={settings.voiceURI} label="例文を読み上げ" />
            </li>
          ))}
        </ul>
      </section>
      {errors.length > 0 && (
        <section className="card gram-mistakes">
          <h3><span className="mark-x">✕</span> 文法の誤り</h3>
          <p className="muted">英語として誤りの文（形の誤り）です。どれも、正しい形を学習指導要領解説（文部科学省）の例文・説明、またはその範囲外の項目では CEFR-J Grammar Profile の項目の定義と、辞書（Wiktionary）の両方で確かめました。</p>
          {errors.map((m) => m.kind === 'error' && (
            <div className="gram-mistake" key={m.wrong}>
              <p><span className="mark-x">✕</span> <s lang="en">{m.wrong}</s></p>
              <p><span className="mark-o">○</span> <span lang="en">{m.right}</span></p>
              <p className="muted">{m.note}</p>
              <details><summary>確かめた方法</summary>
                <p className="muted">根拠：{m.proof.kaisetsu}</p>
                <p className="muted">{m.proof.dictionary}</p>
                <p className="muted">文法チェック（LanguageTool、参考）：{m.proof.languageTool.length ? m.proof.languageTool.join(' ／ ') : '検出なし'}</p>
              </details>
            </div>
          ))}
        </section>
      )}
      {informals.length > 0 && (
        <section className="card gram-mistakes">
          <h3><span className="mark-tri">△</span> くだけた言い方（正式な場面では避ける）</h3>
          <p className="muted">くだけた会話では母語話者も言うことがありますが、標準的な英語ではありません。自分で話すとき・書くときは ○ の形を使いましょう。</p>
          {informals.map((m) => m.kind === 'informal' && (
            <div className="gram-mistake" key={m.wrong}>
              <p><span className="mark-tri">△</span> <span lang="en">{m.wrong}</span></p>
              <p><span className="mark-o">○</span> <span lang="en">{m.right}</span></p>
              <p className="muted">{m.note}</p>
              {m.work && <p className="gram-work">仕事の場面：{m.work}</p>}
              <details><summary>確かめた方法</summary>
                <p className="muted">{m.proof.dictionary}</p>
                <p className="muted">{m.proof.spoken}</p>
              </details>
            </div>
          ))}
        </section>
      )}
      {meanings.length > 0 && (
        <section className="card gram-mistakes">
          <h3><span className="mark-tri">△</span> 文法は正しいが、意味が違う</h3>
          <p className="muted">英語としては正しい文ですが、言いたいことと意味がずれる例です。</p>
          {meanings.map((m) => m.kind === 'meaning' && (
            <div className="gram-mistake" key={m.wrong}>
              <p><span className="mark-tri">△</span> <span lang="en">{m.wrong}</span></p>
              <p className="muted">言いたいこと：{m.intended}</p>
              <p><span className="mark-o">○</span> <span lang="en">{m.right}</span></p>
              <p className="muted">{m.note}</p>
              {m.work && <p className="gram-work">仕事の場面：{m.work}</p>}
            </div>
          ))}
        </section>
      )}
      <section className="card">
        <details>
          <summary>出典（学習指導要領解説・CEFR-J の該当箇所）</summary>
          <ul className="gram-sources">
            {item.sources.map((s, i) => <li key={i}>{s.doc}　{s.where}{s.page ? `　p.${s.page}` : ''}</li>)}
          </ul>
          <p className="muted">解説と問題は、この箇所と照らし合わせて自作しました（文章は写していません）。例文は Tatoeba（CC BY 2.0 FR）の実在の文です。</p>
        </details>
        <GrammarDoubt item={item} />
      </section>
    </>
  )
}

const DOUBT_KINDS = ['解説', '例文', 'まちがいの例', '問題の答え', 'その他']

/** 「この解説に疑問がある」：端末に記録するだけ（設定の「疑問の記録」で一覧を見られる） */
function GrammarDoubt({ item }: { item: GrammarItem }) {
  const [open, setOpen] = useState(false)
  const [what, setWhat] = useState('')
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)
  return (
    <div className="doubt-box">
      {saved ? <p className="banner ok">記録しました。設定の「疑問の記録」で見られます。</p> : !open ? (
        <button className="btn secondary small" onClick={() => setOpen(true)}>この解説に疑問がある</button>
      ) : (
        <div className="stack">
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {DOUBT_KINDS.map((k) => <button key={k} className={`chip${what === k ? ' used' : ''}`} onClick={() => setWhat(k)}>{k}</button>)}
          </div>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="どこが違うと思うか（任意）" />
          <button className="btn small" disabled={!what} onClick={() => { void reportGrammar(item, what, note).then(() => setSaved(true)) }}>記録する</button>
        </div>
      )}
      <p className="muted">説明や答えが違うと感じたら記録できます。後で見直しに使います（記録は端末の中だけに残ります）。</p>
    </div>
  )
}

/** 1問の出題と答え合わせ。onNext に評価（FSRS の 1〜4）と答えるまでの時間を返す */
function ExerciseView({ item, ex, settings, onNext }: { item: GrammarItem; ex: GrammarExercise; settings: Settings; onNext: (g: Grade, ms: number) => void }) {
  const [shownAt] = useState(() => Date.now())
  const [ms, setMs] = useState(0)
  const [result, setResult] = useState<null | { ok: boolean; mine: string }>(null)
  const [picked, setPicked] = useState<number[]>([])
  const [text, setText] = useState('')
  const [reported, setReported] = useState(false)
  const tokens = useMemo(() => (ex.type === 'order' ? shuffledTokens(ex.id, ex.tokens) : []), [ex])
  const check = (mine: string) => {
    const ok = isAccepted(mine, ex.answers)
    setMs(Date.now() - shownAt)
    setResult({ ok, mine })
    if (ok) playCorrect(1)
    else playTry()
  }
  const model = ex.type === 'fill' ? ex.text.replace('___', ex.answers[0]) : ex.answers[0]

  if (ex.type === 'oral') return <OralView ex={ex} settings={settings} onNext={onNext} />

  return (
    <section className="card stack gram-ex">
      <p className="gram-ja">{ex.ja}</p>
      {ex.type === 'fill' && (
        <>
          <p className="gram-sentence" lang="en">{ex.text.split('___').map((part, i) => <span key={i}>{i > 0 && <span className="gram-blank">{result ? ex.answers[0] : '＿＿＿'}</span>}{part}</span>)}</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {ex.choices.map((c) => (
              <button key={c} className={`btn secondary${result && ex.answers.includes(c) ? ' gram-right' : ''}${result && result.mine === c && !result.ok ? ' gram-wrong' : ''}`}
                disabled={!!result} onClick={() => check(c)} lang="en">{c}</button>
            ))}
          </div>
        </>
      )}
      {ex.type === 'order' && (
        <>
          <p className="gram-built" lang="en">{picked.map((i) => tokens[i]).join(' ') || '（語を順に押す）'}</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {tokens.map((t, i) => (
              <button key={i} className={`chip${picked.includes(i) ? ' used' : ''}`} disabled={!!result || picked.includes(i)} onClick={() => setPicked([...picked, i])} lang="en">{t}</button>
            ))}
          </div>
          {!result && (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn secondary small" disabled={!picked.length} onClick={() => setPicked(picked.slice(0, -1))}>1つ戻す</button>
              <button className="btn small" disabled={picked.length !== tokens.length} onClick={() => check(picked.map((i) => tokens[i]).join(' '))}>答え合わせ</button>
            </div>
          )}
        </>
      )}
      {ex.type === 'rewrite' && (
        <>
          <p className="gram-sentence" lang="en">{ex.from}</p>
          <textarea rows={2} lang="en" autoCapitalize="sentences" value={text} disabled={!!result} onChange={(e) => setText(e.target.value)} placeholder="英語で書く" />
          {!result && <button className="btn small" disabled={!text.trim()} onClick={() => check(text)}>答え合わせ</button>}
        </>
      )}

      {result && (
        <div className={`banner ${result.ok ? 'ok' : 'warn'}`}>
          <p><strong>{result.ok ? '正解' : 'ちがいます'}</strong></p>
          <p className="muted">{ex.answers.length > 1 ? '正解として認める答え（どれでも正解）：' : '答え：'}</p>
          <ul className="gram-answers">{(ex.type === 'fill' ? [model] : ex.answers).map((a) => <li key={a} lang="en">{a}</li>)}</ul>
          <div className="row"><SpeakButton text={model} bank={bankRef.example(model)} voiceURI={settings.voiceURI} label="正しい文を聞く" /><span className="muted">声に出して読みましょう</span></div>
          {!result.ok && ex.type !== 'fill' && (
            reported ? <p className="muted">記録しました。見直して正しければ、認める答えに加えます。</p>
              : <button className="btn secondary small" onClick={() => { void reportGrammar(item, '問題の答え', `${ex.id}「${ex.ja}」に「${result.mine}」と答えた。正しいと思う。`).then(() => setReported(true)) }}>自分の答えも正しいと思う</button>
          )}
        </div>
      )}
      {result && <button className="btn block" onClick={() => onNext(result.ok ? 3 : 1, ms)}>次へ</button>}
    </section>
  )
}

const ORAL_SECONDS = 5

/** 口頭で即答：日本語を見て5秒以内に英語で言う → 手本を聞く → 言えたかを正直に選ぶ */
function OralView({ ex, settings, onNext }: { ex: GrammarExercise; settings: Settings; onNext: (g: Grade, ms: number) => void }) {
  const [shownAt] = useState(() => Date.now())
  const [left, setLeft] = useState(ORAL_SECONDS)
  const [revealedMs, setRevealedMs] = useState(0)
  useEffect(() => {
    if (revealedMs) return
    const t = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => window.clearInterval(t)
  }, [revealedMs])
  const reveal = () => setRevealedMs(Date.now() - shownAt)
  return (
    <section className="card stack gram-ex">
      <p className="gram-label"><PixelIcon name="sword" size={16} /> 口頭で即答</p>
      <p className="gram-ja big">{ex.ja}</p>
      {!revealedMs ? (
        <>
          <div className="gram-timer" aria-label={`のこり${left}秒`}><span style={{ width: `${(left / ORAL_SECONDS) * 100}%` }} /></div>
          <p className="muted">{left > 0 ? `英語で声に出して言ってみましょう（あと${left}秒）` : '時間です。言えなくても大丈夫。答えを見ましょう'}</p>
          <button className="btn block" onClick={reveal}>答えを見る</button>
        </>
      ) : (
        <>
          <p className="muted">{ex.answers.length > 1 ? '手本（どれでも正解）' : '手本'}</p>
          <ul className="gram-answers">{ex.answers.map((a) => <li key={a} lang="en">{a}</li>)}</ul>
          <div className="row">
            <SpeakButton big text={ex.answers[0]} bank={bankRef.example(ex.answers[0])} voiceURI={settings.voiceURI} label="聞く" />
            <span className="muted">聞いて、もう一度まねして言いましょう</span>
          </div>
          <div className="grade-row command">
            <button className="grade g1" onClick={() => onNext(1, revealedMs)}><span className="label">言えなかった</span></button>
            <button className="grade g2" onClick={() => onNext(2, revealedMs)}><span className="label">詰まった</span></button>
            <button className="grade g3" onClick={() => onNext(3, revealedMs)}><span className="label">すぐ言えた</span></button>
          </div>
        </>
      )}
    </section>
  )
}

/** 自分のことを1文：その文法で自分のことを言う（書いてもよい）。見本と確かめる点を見て終える */
function Myself({ item, onDone }: { item: GrammarItem; onDone: () => void }) {
  const [text, setText] = useState('')
  const [showSample, setShowSample] = useState(false)
  const [checked, setChecked] = useState<boolean[]>(item.myself.checks.map(() => false))
  return (
    <section className="card stack gram-ex">
      <p className="gram-label"><PixelIcon name="star" size={16} /> 自分のことを1文</p>
      <p className="gram-ja">{item.myself.task}</p>
      <p className="muted">まず声に出して言いましょう。書いて確かめてもかまいません（書いた文は保存しません）。</p>
      <textarea rows={2} lang="en" value={text} onChange={(e) => setText(e.target.value)} placeholder="英語で書く（任意）" />
      <div className="stack gram-checks">
        {item.myself.checks.map((c, i) => (
          <label key={c} className="row"><input type="checkbox" checked={checked[i]} onChange={() => setChecked(checked.map((v, j) => (j === i ? !v : v)))} /> {c}</label>
        ))}
      </div>
      {showSample
        ? <div><p className="muted">見本</p><ul className="gram-answers">{item.myself.samples.map((s) => <li key={s} lang="en">{s}</li>)}</ul></div>
        : <button className="btn secondary small" onClick={() => setShowSample(true)}>見本を見る</button>}
      <p className="muted">合っているか不安な文は、Claude に添削を頼むと確かめられます（練習 →「添削を取り込む」）。</p>
      <button className="btn block" onClick={onDone}>言えた（修行を終える）</button>
    </section>
  )
}

/** 文法の復習：期日が来た問題を出す。表現と同じく、同じ問題は1日2回まで */
function GrammarReview({ data, settings, onBack }: { data: GrammarData; settings: Settings; onBack: () => void }) {
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [current, setCurrent] = useState<{ card: Card; shownAt: number; attemptsToday: number } | null>(null)
  const [count, setCount] = useState({ total: 0, ok: 0, xp: 0 })
  useEffect(() => { void todaysQueue('gram').then(setQueue) }, [])
  useEffect(() => {
    if (!queue) return
    const next = nextCard(queue, Date.now())
    if (!next) { setCurrent(null); return }
    void db.reviews.where('cardId').equals(next.id!).filter((r) => r.at >= startOfDay(Date.now())).count()
      .then((n) => setCurrent({ card: next, shownAt: Date.now(), attemptsToday: n }))
  }, [queue])

  if (!queue) return <p className="muted">読み込み中…</p>
  const found = current ? findExercise(data, current.card.itemId) : undefined
  if (!current || !found) {
    return (
      <section className="card stack" style={{ textAlign: 'center' }}>
        <h2 className="win-title">{count.total ? '文法の復習の結果' : '文法の復習'}</h2>
        {count.total ? <p className="result-lead">{count.total}問のうち {count.ok}問 正解・言えた（+{count.xp} XP）</p> : <p>今日復習する問題はありません。</p>}
        <button className="btn block" onClick={onBack}>修行の地図へ</button>
      </section>
    )
  }
  const { item, ex } = found
  return (
    <div className="stack">
      <p className="muted gram-count">のこり {queue.filter((c) => c.due <= current.shownAt).length}問　{item.no}. {item.title}　{EXERCISE_LABELS[ex.type]}</p>
      <ExerciseView key={`${current.card.id}-${current.shownAt}`} item={item} ex={ex} settings={settings}
        onNext={async (g, ms) => {
          const gain = reviewXp({ attemptsToday: current.attemptsToday, answerMs: ms, combo: 0, deck: 'gram' })
          void addXp(gain.total)
          const updated = await recordReview(current.card, g, { answerMs: ms, mode: `grammar-${ex.type}` })
          setCount((c) => ({ total: c.total + 1, ok: c.ok + (g >= 2 ? 1 : 0), xp: c.xp + gain.total }))
          const rest = queue.filter((c) => c.id !== current.card.id)
          const again = current.attemptsToday + 1 < EXPR_MAX_PER_DAY && updated.due <= Date.now() + 20 * 60 * 1000
          setQueue(again ? [...rest, updated] : rest)
        }} />
      <button className="btn secondary block" onClick={onBack}>ここでやめる（地図へ）</button>
    </div>
  )
}
