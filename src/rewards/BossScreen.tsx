import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Settings } from '../db/schema'
import { weekStart } from '../habit/streak'
import { dayKey } from '../today/menu'
import { PixelIcon } from '../ui/PixelIcon'
import { SpeakButton } from '../practice/WordParts'
import { bankRef } from '../speech/audioBank'
import { useSessionTimer } from '../practice/useSessionTimer'
import { Floats, type Float } from './XpParts'
import { playComplete, playCorrect, playCrit, playTry } from './sound'
import { addXp } from './xp'
import { BOSS_HIT_XP, BOSS_XP, bossQuestions, defeatBoss, isBossDay, type BossQuestion } from './boss'

/**
 * 週のボス戦。その週に学んだ語の意味を4つから選ぶ。
 * 正解するとボスの体力が減る。間違えた語は後ろに回ってもう一度出る（罰はない）。
 */
export function BossScreen({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  useSessionTimer('boss', 'language')
  const today = dayKey()
  const record = useLiveQuery(() => db.bosses.get(weekStart(today)), [today])
  const [questions, setQuestions] = useState<BossQuestion[] | null>(null)
  const [queue, setQueue] = useState<BossQuestion[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [hits, setHits] = useState(0)
  const [answered, setAnswered] = useState(0)
  const [won, setWon] = useState(false)
  const [floats, setFloats] = useState<Float[]>([])
  const [shake, setShake] = useState(0)
  const floatId = useRef(0)
  const fx = settings.effects

  useEffect(() => {
    void bossQuestions(today).then((q) => { setQuestions(q); setQueue(q) })
  }, [today])

  if (!questions) return <p className="muted">ボスの気配を探っています…</p>

  const defeated = record?.defeated === 1 && !won
  if (!isBossDay() || defeated || questions.length === 0) {
    return (
      <div className="boss">
        <section className="card stack" style={{ textAlign: 'center' }}>
          <h2 className="win-title">週のボス（単語）</h2>
          <PixelIcon name="dragon" size={72} className="boss-art idle" />
          {defeated ? <p>今週のボスはもう倒しました。また来週の週末に現れます。</p>
            : !isBossDay() ? <p>ボスは週末（土・日）に現れます。その週に学んだ単語で戦います（表現は出ません）。</p>
              : <p>今週学んだ単語がまだ少ないため、ボスが現れていません（4語以上で現れます）。</p>}
          <button className="btn block" onClick={onExit}>戻る</button>
        </section>
      </div>
    )
  }

  const total = questions.length
  const q = queue[0]

  const choose = (opt: string) => {
    if (picked || !q) return
    setPicked(opt)
    setAnswered((n) => n + 1)
    void addXp(BOSS_HIT_XP)
    const id = ++floatId.current
    if (opt === q.answer) {
      playCorrect(hits + 1)
      setHits((h) => h + 1)
      setShake((s) => s + 1)
      setFloats((f) => [...f.slice(-3), { id, text: `${hits + 1 === total ? 'とどめ！' : 'ヒット！'} +${BOSS_HIT_XP}`, kind: 'xp' }])
    } else {
      playTry()
      setFloats((f) => [...f.slice(-3), { id, text: `+${BOSS_HIT_XP} XP`, kind: 'xp' }])
    }
    window.setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 950)
  }

  const next = async () => {
    if (!q || !picked) return
    const right = picked === q.answer
    const rest = right ? queue.slice(1) : [...queue.slice(1), q]
    setPicked(null)
    setQueue(rest)
    if (!rest.length) {
      await defeatBoss(total)
      playCrit()
      window.setTimeout(playComplete, 400)
      setWon(true)
    }
  }

  if (won || !q) {
    return (
      <div className="boss" data-fx={fx}>
        <section className="card stack boss-win" style={{ textAlign: 'center' }}>
          <h2 className="win-title">勝利！</h2>
          <PixelIcon name="chestOpen" size={72} className="boss-art" />
          <p className="result-lead">今週のボスを倒しました！</p>
          <dl className="result-grid">
            <div><dt>戦った語</dt><dd>{total}</dd></div>
            <div><dt>答えた回数</dt><dd>{answered}</dd></div>
          </dl>
          <p>ごほうび：<span className="xp-chip">+{BOSS_XP} XP</span> と雑学パック1つ</p>
          <p className="muted">ボスを倒した回数で、限定の称号や配色テーマが手に入ります。</p>
          <button className="btn block" onClick={onExit}>戻る</button>
        </section>
      </div>
    )
  }

  const hp = total - hits
  return (
    <div className="boss battle" data-fx={fx}>
      <section className="card boss-stage">
        <h2 className="win-title">週のボス（単語）：忘却のドラゴン</h2>
        <div className="boss-hp">
          <span className="num">HP {hp} / {total}</span>
          <div className="xp-track hp-track"><div className="hp-fill" style={{ width: `${(hp / total) * 100}%` }} /></div>
        </div>
        <div className="card-stage">
          <Floats floats={floats} />
          <PixelIcon key={shake} name="dragon" size={96} className={`boss-art${shake ? ' hit' : ''}`} />
        </div>
        <p className="muted" style={{ textAlign: 'center' }}>対象：今週学んだ単語。意味を選んで攻撃しましょう。間違えた語は、あとでもう一度出てきます。</p>
      </section>
      <section className="card stack" key={`${q.itemId}-${answered}`}>
        <h2 className="win-title">この語の意味は？</h2>
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="headword">{q.english}</span>
          <SpeakButton text={q.english} voiceURI={settings.voiceURI} bank={bankRef.head(q.english)} />
        </div>
        <div className="options">
          {q.options.map((o) => (
            <button key={o} className={`option${picked ? (o === q.answer ? ' right' : o === picked ? ' wrong' : '') : ''}`}
              disabled={!!picked} onClick={() => choose(o)}>{o}</button>
          ))}
        </div>
        {picked && (
          <>
            <p className={picked === q.answer ? 'banner ok' : 'banner info'}>
              {picked === q.answer ? '命中！ ボスに1ダメージ。' : `おしい！ 正解は「${q.answer}」。この語はもう一度出てきます。`}
            </p>
            <button className="btn block" onClick={() => void next()}>次へ</button>
          </>
        )}
      </section>
      <button className="btn secondary block" style={{ marginTop: 12 }} onClick={onExit}>ここでやめる（週末のうちなら、また挑めます）</button>
    </div>
  )
}
