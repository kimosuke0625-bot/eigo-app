import { useCallback, useEffect, useRef, useState } from 'react'
import { db, type Card, type Item, type Settings } from '../db/schema'
import { GRADES, GRADE_LABELS, formatInterval, previewIntervals, type Grade } from '../srs/fsrs'
import { nextCard, startOfDay } from '../srs/queue'
import { EXPR_MAX_PER_DAY, introducePhrases, recordReview, todaysQueue, waitingPhrases } from '../srs/store'
import { playText } from '../speech/audioBank'
import { Steps } from '../ui/Steps'
import { PixelIcon } from '../ui/PixelIcon'
import { SpeakButton } from './WordParts'
import { useSessionTimer } from './useSessionTimer'
import { playComboStage, playCorrect, playCrit, playLevelUp, playTry } from '../rewards/sound'
import { addXp, COMBO_STEPS, comboStage, EXPR_COMBO_AT, HONEST_LINES, levelFromXp, reviewXp } from '../rewards/xp'
import { Floats, LevelBar, Sparks, type Float } from '../rewards/XpParts'

type Current = { card: Card; item: Item; scene: string; shownAt: number; attemptsToday: number }
interface Battle { total: number; recalled: number; xp: number; maxCombo: number; crits: number; levelUps: number; honest: number }

/** 表現の語（phrase-<id>）から、旅の手帳の「使う場面」を引く */
async function sceneOf(itemId: string): Promise<string> {
  const m = itemId.match(/^phrase-(\d+)$/)
  return m ? (await db.phrases.get(Number(m[1])))?.scene ?? '' : ''
}

/**
 * 表現の復習（2026-10-08 利用者の依頼で単語の復習と分けた）。
 * 日本語の意味と使う場面を見て英語で言ってみる → 答えを見て読み上げを聞き、まねして言う → 正直に評価する。
 * 1枚に時間をかけてよいので、連打の判定とコンボの区切りは単語よりゆるい。学習時間は「アウトプット」。
 */
export function ExprReviewScreen({ settings, onExit, onImport }: { settings: Settings; onExit: () => void; onImport: () => void }) {
  const result = useSessionTimer('exprReview', 'output')
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [info, setInfo] = useState({ added: 0, waiting: 0, phrases: 0 })
  const [current, setCurrent] = useState<Current | null>(null)
  const [revealedAt, setRevealedAt] = useState(0)
  const revealed = revealedAt > 0
  const [battle, setBattle] = useState<Battle>({ total: 0, recalled: 0, xp: 0, maxCombo: 0, crits: 0, levelUps: 0, honest: 0 })
  const [honestLine, setHonestLine] = useState('')
  const combo = useRef(0)
  const [comboShown, setComboShown] = useState(0)
  const answerMs = useRef(0)
  const [startXp] = useState(settings.xpTotal)
  const gained = useRef(0)
  const shownXp = Math.max(settings.xpTotal, startXp + battle.xp)
  const [floats, setFloats] = useState<Float[]>([])
  const floatId = useRef(0)
  const [hit, setHit] = useState({ seed: 0, strength: 0, crit: false })
  const fx = settings.effects

  useEffect(() => {
    void (async () => {
      // 旅の手帳の表現を、1日に決めた数まで表現の束に加えてから始める
      const added = await introducePhrases()
      const q = await todaysQueue('expr')
      setInfo({ added, waiting: await waitingPhrases(), phrases: await db.phrases.count() })
      setQueue(q)
    })()
  }, [])

  const present = useCallback(async (q: Card[]) => {
    const card = nextCard(q, Date.now())
    if (!card) { setCurrent(null); return }
    const item = await db.items.get(card.itemId)
    if (!item) { setQueue(q.filter((c) => c.id !== card.id)); return }
    const since = startOfDay(Date.now())
    const attemptsToday = await db.reviews.where('cardId').equals(card.id!).filter((r) => r.at >= since).count()
    setCurrent({ card, item, scene: await sceneOf(card.itemId), shownAt: Date.now(), attemptsToday })
    setRevealedAt(0)
  }, [])

  useEffect(() => { if (queue) void present(queue) }, [queue, present])

  const reveal = useCallback(() => {
    if (!current || revealed) return
    const now = Date.now()
    answerMs.current = now - current.shownAt
    setRevealedAt(now)
    // 答えを見たらすぐ英語を聞かせる（押した直後なので iPhone でも鳴る）
    playText({ text: current.item.english, voiceURI: settings.voiceURI })
  }, [current, revealed, settings.voiceURI])

  const addFloat = useCallback((text: string, kind: Float['kind']) => {
    const id = ++floatId.current
    setFloats((f) => [...f.slice(-4), { id, text, kind }])
    window.setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 950)
  }, [])

  const grade = useCallback(async (g: Grade) => {
    if (!current || !queue) return
    const recalled = g >= 2
    const prevStage = comboStage(combo.current, 'expr')
    combo.current = recalled ? combo.current + 1 : 0
    const stage = comboStage(combo.current, 'expr')
    setComboShown(combo.current)
    const gain = reviewXp({ attemptsToday: current.attemptsToday, answerMs: answerMs.current, combo: combo.current, forgot: g === 1, deck: 'expr' })
    const before = levelFromXp(startXp + gained.current).level
    gained.current += gain.total
    const levelUp = levelFromXp(startXp + gained.current).level > before
    const stageUp = stage > prevStage

    if (gain.crit > 1) playCrit()
    else if (recalled) playCorrect(combo.current)
    else playTry()
    if (stageUp) playComboStage(stage)
    if (levelUp) window.setTimeout(playLevelUp, 250)

    if (gain.honest > 0) {
      addFloat(`正直ボーナス +${gain.total}`, 'honest')
      setHonestLine(HONEST_LINES[battle.honest % HONEST_LINES.length])
    } else {
      addFloat(gain.crit > 1 ? `会心の一撃！ +${gain.total}` : `+${gain.total} XP`, gain.crit > 1 ? 'crit' : 'xp')
      setHonestLine('')
    }
    if (stageUp) addFloat(`${COMBO_STEPS[stage].name} ×${COMBO_STEPS[stage].mult}`, 'combo')
    if (levelUp) addFloat(`レベルアップ！ Lv ${before + 1}`, 'level')
    if (recalled || gain.crit > 1) setHit({ seed: floatId.current, strength: stage + (gain.crit > 1 ? 2 : 0), crit: gain.crit > 1 })

    setBattle((b) => ({
      total: b.total + 1,
      recalled: b.recalled + (recalled ? 1 : 0),
      xp: b.xp + gain.total,
      maxCombo: Math.max(b.maxCombo, combo.current),
      crits: b.crits + (gain.crit > 1 ? 1 : 0),
      levelUps: b.levelUps + (levelUp ? 1 : 0),
      honest: b.honest + (gain.honest > 0 ? 1 : 0),
    }))
    const updated = await recordReview(current.card, g, { answerMs: answerMs.current, mode: 'expr' })
    void addXp(gain.total, { crit: gain.crit > 1, combo: combo.current })
    result.current.reviews = (result.current.reviews ?? 0) + 1
    result.current.recalled = (result.current.recalled ?? 0) + (recalled ? 1 : 0)
    const rest = queue.filter((c) => c.id !== current.card.id)
    // 同じ表現は1日2回まで。2回目が済んだら、今日はもう出さない（次は FSRS の予定どおり）
    const again = current.attemptsToday + 1 < EXPR_MAX_PER_DAY && updated.due <= Date.now() + 20 * 60 * 1000
    setQueue(again ? [...rest, updated] : rest)
  }, [current, queue, result, addFloat, battle.honest, startXp])

  if (!queue) return <p className="muted">読み込み中…</p>

  if (!current) {
    return (
      <div className="review battle" data-fx={fx}>
        <section className="card stack" style={{ textAlign: 'center' }}>
          <h2 className="win-title">{battle.total ? '表現の復習の結果' : '表現の復習'}</h2>
          {battle.total > 0 ? (
            <>
              <p className="result-lead">{battle.total}回 英語で言ってみました</p>
              <dl className="result-grid">
                <div><dt>言えた</dt><dd>{battle.recalled}</dd></div>
                <div><dt>最高コンボ</dt><dd>{battle.maxCombo}</dd></div>
                <div><dt>正直ボーナス</dt><dd>{battle.honest}</dd></div>
                <div><dt>経験値</dt><dd>+{battle.xp}</dd></div>
              </dl>
              <LevelBar total={shownXp} />
            </>
          ) : info.phrases === 0 ? (
            <p>旅の手帳に表現がまだありません。作文や音声日記の添削を Claude に頼んで取り込むと、ここで復習できます。</p>
          ) : (
            <p>今日復習する表現はありません。</p>
          )}
          {info.waiting > 0 && (
            <p className="muted">旅の手帳には、まだ復習に入っていない表現が {info.waiting} 個あります。1日に {settings.exprNewPerDay} 個ずつ加わります（設定で変えられます）。</p>
          )}
          {info.phrases === 0 && <button className="btn block" onClick={onImport}>添削を取り込む</button>}
          <button className="btn secondary block" onClick={onExit}>戻る</button>
        </section>
      </div>
    )
  }

  const { card, item, scene } = current
  const intervals = revealed ? previewIntervals(card.fsrs, revealedAt, settings.retention) : null
  const remaining = queue.filter((c) => c.due <= current.shownAt).length
  const stage = comboStage(comboShown, 'expr')
  const example = item.examples[0]?.en

  return (
    <div className={`review battle expr-battle stage-${stage}`} data-fx={fx}>
      <div className="battle-hud">
        <LevelBar total={shownXp} compact />
        <div className="hud-row">
          <span className="hud-item"><PixelIcon name="book" size={18} /> のこり <strong className="num">{remaining}</strong></span>
          <span className="hud-item"><PixelIcon name="scroll" size={18} /> <strong className="num">{battle.total}</strong>回</span>
          {comboShown >= EXPR_COMBO_AT[1]
            ? <span className={`combo-badge s${stage}`} key={comboShown}><span className="num">{comboShown}</span> COMBO <span className="mult">×{COMBO_STEPS[stage].mult}</span></span>
            : <span className="tag">表現</span>}
        </div>
      </div>
      {info.added > 0 && battle.total === 0 && <p className="honest-line"><PixelIcon name="book" size={16} /> 旅の手帳から新しい表現を {info.added} 個加えました。</p>}
      {honestLine && <p className="honest-line" key={honestLine + battle.total}><PixelIcon name="star" size={16} /> {honestLine}</p>}

      <Steps steps={['英語で言ってみる', '聞いてまねする', '評価する']} current={revealed ? 1 : 0}
        guide={revealed ? '読み上げを聞いて、同じ調子でまねして言いましょう。言えたかどうかを正直に選びます。' : '日本語の意味と場面を見て、英語で言ってみましょう。うろ覚えでも声に出すのが大事です。'} />
      <div className="card-stage">
        <div className="hit-layer" key={`h${hit.seed}`} aria-hidden>
          {hit.seed > 0 && <span className="slash" />}
          {hit.crit && <span className="flash" />}
          <Sparks seed={hit.seed} level={fx} strength={hit.strength} />
        </div>
        <Floats floats={floats} />
        <section className="card flashcard win expr-card" key={`c${card.id}-${current.shownAt}`} onClick={reveal}>
          <span className="win-title">表現</span>
          <p className="expr-ja">{item.japanese || '（意味が書かれていません）'}</p>
          {scene && <p className="expr-scene"><span className="fix-label">場面</span>{scene}</p>}
          {revealed ? (
            <div className="answer" onClick={(e) => e.stopPropagation()}>
              <p className="expr-en">{item.english}</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <SpeakButton big text={item.english} voiceURI={settings.voiceURI} label="聞く" />
                <SpeakButton big text={item.english} voiceURI={settings.voiceURI} rate={0.75} label="ゆっくり" />
              </div>
              {example && (
                <div className="row phrase-ex" style={{ marginTop: 10 }}>
                  <span className="en">例：{example}</span>
                  <SpeakButton text={example} voiceURI={settings.voiceURI} label="例文を読み上げ" />
                </div>
              )}
            </div>
          ) : (
            <button className="btn block" style={{ marginTop: 16 }} onClick={(e) => { e.stopPropagation(); reveal() }}>
              英語を見て聞く
            </button>
          )}
        </section>
      </div>

      {revealed && intervals && (
        <div className="grade-row command">
          {GRADES.map((g, i) => (
            <button key={g} className={`grade g${g}`} onClick={() => void grade(g)}>
              <span className="label">{GRADE_LABELS[g]}</span>
              <span className="interval">{formatInterval(intervals[g])}後</span>
              <span className="key">{i + 1}</span>
            </button>
          ))}
        </div>
      )}
      <button className="btn secondary block" style={{ marginTop: 16 }} onClick={onExit}>ここでやめる</button>
    </div>
  )
}
