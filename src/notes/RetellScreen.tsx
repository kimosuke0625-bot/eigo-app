import { useEffect, useRef, useState } from 'react'
import { type Fix, type Settings } from '../db/schema'
import { Steps } from '../ui/Steps'
import { PixelIcon } from '../ui/PixelIcon'
import { SpeakButton } from '../practice/WordParts'
import { useSessionTimer } from '../practice/useSessionTimer'
import { Floats, type Float } from '../rewards/XpParts'
import { playCorrect, playTry } from '../rewards/sound'
import { recordRetell, retellQueue, RETELL_XP } from './store'

const RESULTS = [
  { v: 0 as const, label: 'まだ', cls: 'g1' },
  { v: 1 as const, label: 'おしい', cls: 'g2' },
  { v: 2 as const, label: '言えた', cls: 'g3' },
]

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim()

/** 言い直しの練習：過去の自分の間違った文を見て、正しく言い直す */
export function RetellScreen({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  const result = useSessionTimer('retell', 'language')
  const [queue, setQueue] = useState<Fix[] | null>(null)
  const [i, setI] = useState(0)
  const [typed, setTyped] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [hint, setHint] = useState(false)
  const [done, setDone] = useState({ total: 0, ok: 0, xp: 0 })
  const [floats, setFloats] = useState<Float[]>([])
  const floatId = useRef(0)

  useEffect(() => { void retellQueue(10).then(setQueue) }, [])
  if (!queue) return <p className="muted">準備中…</p>

  const fix = queue[i]
  if (!fix) {
    return (
      <div className="notes">
        <section className="card stack" style={{ textAlign: 'center' }}>
          <h2 className="win-title">{done.total ? '言い直しの結果' : '言い直す文がありません'}</h2>
          {done.total > 0 ? (
            <>
              <p className="result-lead">{done.total}文を言い直しました</p>
              <dl className="result-grid">
                <div><dt>言えた</dt><dd>{done.ok}</dd></div>
                <div><dt>経験値</dt><dd>+{done.xp}</dd></div>
              </dl>
              <p className="muted">言えなかった文は、次の練習で先に出てきます。</p>
            </>
          ) : (
            <p>添削を取り込むと、過去の自分の間違った文がここに出てきます。</p>
          )}
          <button className="btn block" onClick={onExit}>戻る</button>
        </section>
      </div>
    )
  }

  const exact = typed.trim() && norm(typed) === norm(fix.corrected)
  const rate = async (v: 0 | 1 | 2) => {
    if (v === 2) playCorrect(1)
    else playTry()
    const id = ++floatId.current
    setFloats((f) => [...f.slice(-3), { id, text: `+${RETELL_XP} XP`, kind: 'xp' }])
    window.setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 950)
    await recordRetell(fix, v)
    result.current.retold = (result.current.retold ?? 0) + 1
    setDone((d) => ({ total: d.total + 1, ok: d.ok + (v === 2 ? 1 : 0), xp: d.xp + RETELL_XP }))
    setI(i + 1)
    setTyped('')
    setRevealed(false)
    setHint(false)
  }

  return (
    <div className="notes battle" data-fx={settings.effects}>
      <div className="hud-row">
        <span className="hud-item"><PixelIcon name="scroll" size={18} /> のこり <strong className="num">{queue.length - i}</strong></span>
        <span className="hud-item"><PixelIcon name="sword" size={18} /> <strong className="num">{done.total}</strong>文</span>
      </div>
      <Steps steps={['過去の文を読む', '正しく言い直す', '答えと比べる']} current={revealed ? 2 : 1}
        guide={revealed ? '直した文と比べて、言えたかどうかを正直に選びましょう。' : '前の自分が書いた（話した）文です。正しい英語に直して、声に出して言いましょう。'} />
      <div className="card-stage">
        <Floats floats={floats} />
        <section className="card stack" key={fix.id}>
          <h2 className="win-title">過去の自分の文</h2>
          <p className="retell-before">{fix.original}</p>
          {hint ? <p className="muted">ヒント：{fix.type}</p> : <button className="link-btn" onClick={() => setHint(true)}>ヒント（間違いの種類）を見る</button>}
          <textarea className="paste-area" rows={2} value={typed} onChange={(e) => setTyped(e.target.value)} disabled={revealed}
            placeholder="書いてもよい（声に出すだけでも大丈夫）" autoCapitalize="sentences" spellCheck={false} />
          {!revealed ? (
            <button className="btn block" onClick={() => setRevealed(true)}>答えを見る</button>
          ) : (
            <div className="answer">
              <div className="row">
                <p className="retell-after">{fix.corrected}</p>
                <SpeakButton text={fix.corrected} voiceURI={settings.voiceURI} />
              </div>
              {exact && <p className="banner ok">書いた文がぴったり同じです！</p>}
              {fix.note && <p className="muted">{fix.note}</p>}
            </div>
          )}
        </section>
      </div>
      {revealed && (
        <div className="grade-row command three">
          {RESULTS.map((r) => (
            <button key={r.v} className={`grade ${r.cls}`} onClick={() => void rate(r.v)}><span className="label">{r.label}</span></button>
          ))}
        </div>
      )}
      <button className="btn secondary block" style={{ marginTop: 16 }} onClick={onExit}>ここでやめる</button>
    </div>
  )
}
