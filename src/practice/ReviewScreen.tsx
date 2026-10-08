import { Steps } from '../ui/Steps'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db, type Card, type Item, type Settings } from '../db/schema'
import { GRADES, GRADE_LABELS, formatInterval, previewIntervals, type Grade } from '../srs/fsrs'
import { chooseMode, nextCard, startOfDay, type PresentMode } from '../srs/queue'
import { recordReview, todaysQueue } from '../srs/store'
import { speechSupported } from '../speech/voices'
import { bankRef, playText } from '../speech/audioBank'
import { AnswerFace, Highlight, SpeakButton } from './WordParts'
import { useSessionTimer } from './useSessionTimer'
import { applyEdit } from '../content/edits'
import { playComboStage, playCorrect, playCrit, playLevelUp, playTry } from '../rewards/sound'
import { addXp, COMBO_STEPS, comboStage, HONEST_LINES, levelFromXp, reviewXp } from '../rewards/xp'
import { Floats, LevelBar, Sparks, type Float } from '../rewards/XpParts'
import { PixelIcon } from '../ui/PixelIcon'

// item は利用者の修正を反映した語（表の面に使う）、raw は元の語（答えの面が修正を反映して表示する）
// attemptsToday は、このカードを今日すでに思い出そうとした回数（経験値の計算に使う）
type Current = { card: Card; item: Item; raw: Item; mode: PresentMode; shownAt: number; attemptsToday: number }

const MODE_PROMPT: Record<PresentMode, string> = {
  word: 'この語の意味を声に出して言ってみましょう',
  chunk: '太字の語の意味を、文の中で考えて声に出しましょう',
  listen: '音声だけを聞いて、何の語か・意味を言ってみましょう',
}
const MODE_NAME: Record<PresentMode, string> = { word: '単語', chunk: '例文', listen: '聞き取り' }

/** この戦い（復習の1回）の記録 */
interface Battle { total: number; recalled: number; xp: number; maxCombo: number; crits: number; levelUps: number; honest: number }

/**
 * 復習カード（フェーズ6.5：戦闘の画面）。
 * 1問ごとに経験値が飛び出し、連続で思い出せるとコンボ倍率が上がる。まれに会心の一撃。
 * 演出は1問につき1秒以内。思い出せなかったときも経験値は入る（罰はない）。
 */
export function ReviewScreen({ settings, onExit, onAddCards }: {
  settings: Settings
  onExit: () => void
  onAddCards: () => void
}) {
  const result = useSessionTimer('review', 'language')
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [current, setCurrent] = useState<Current | null>(null)
  // 答えを見た時刻（0 = まだ）。ボタンに出す次回までの間隔もこの時刻で計算する
  const [revealedAt, setRevealedAt] = useState(0)
  const revealed = revealedAt > 0
  const [showJa, setShowJa] = useState(false)
  const [battle, setBattle] = useState<Battle>({ total: 0, recalled: 0, xp: 0, maxCombo: 0, crits: 0, levelUps: 0, honest: 0 })
  // 正直ボーナスの一言（次に評価するまで出しておく）
  const [honestLine, setHonestLine] = useState('')
  // 思い出せた回数の連続（コンボ）。続くほど倍率・音・演出が上がる
  const combo = useRef(0)
  const [comboShown, setComboShown] = useState(0)
  const answerMs = useRef(0)
  // 経験値の表示。保存を待たずにすぐ伸ばす（保存後の値と大きいほうを出す）
  const [startXp] = useState(settings.xpTotal)
  const gained = useRef(0)
  const shownXp = Math.max(settings.xpTotal, startXp + battle.xp)
  const [floats, setFloats] = useState<Float[]>([])
  const floatId = useRef(0)
  const [hit, setHit] = useState<{ seed: number; strength: number; crit: boolean }>({ seed: 0, strength: 0, crit: false })
  // 聞き取りの出題は、端末で読み上げができるとき
  const tts = speechSupported()
  const fx = settings.effects

  useEffect(() => {
    todaysQueue('word').then(setQueue)
  }, [])

  const present = useCallback(async (q: Card[]) => {
    const card = nextCard(q, Date.now())
    if (!card) { setCurrent(null); return }
    const raw = await db.items.get(card.itemId)
    const item = raw && applyEdit(raw, await db.edits.get(card.itemId))
    if (!item) { setQueue(q.filter((c) => c.id !== card.id)); return }
    const since = startOfDay(Date.now())
    const attemptsToday = await db.reviews.where('cardId').equals(card.id!).filter((r) => r.at >= since).count()
    const mode = chooseMode(card, { tts, hasExample: item.examples.length > 0 })
    setCurrent({ card, item, raw: raw!, mode, shownAt: Date.now(), attemptsToday })
    setRevealedAt(0)
    setShowJa(false)
    if (mode === 'listen') {
      const t = item.examples[0]?.en
      playText({ ref: t ? bankRef.example(t) : bankRef.head(item.english), text: t ?? item.english, voiceURI: settings.voiceURI })
    }
  }, [tts, settings.voiceURI])

  useEffect(() => {
    if (queue) void present(queue)
  }, [queue, present])

  const reveal = useCallback(() => {
    if (!current || revealed) return
    const now = Date.now()
    answerMs.current = now - current.shownAt
    setRevealedAt(now)
  }, [current, revealed])

  const addFloat = useCallback((text: string, kind: Float['kind']) => {
    const id = ++floatId.current
    setFloats((f) => [...f.slice(-4), { id, text, kind }])
    window.setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 950)
  }, [])

  const grade = useCallback(async (g: Grade) => {
    if (!current || !queue) return
    // 効果音はタップの直後に鳴らす（iPhone では待ち時間をはさむと鳴らないことがある）
    const recalled = g >= 2
    const prevStage = comboStage(combo.current)
    combo.current = recalled ? combo.current + 1 : 0
    const stage = comboStage(combo.current)
    setComboShown(combo.current)
    const gain = reviewXp({ attemptsToday: current.attemptsToday, answerMs: answerMs.current, combo: combo.current, forgot: g === 1 })
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
    const updated = await recordReview(current.card, g, { answerMs: answerMs.current, mode: current.mode })
    void addXp(gain.total, { crit: gain.crit > 1, combo: combo.current })
    result.current.reviews = (result.current.reviews ?? 0) + 1
    result.current.recalled = (result.current.recalled ?? 0) + (recalled ? 1 : 0)
    // 学習中のカードはこの回のうちにもう一度出す（20分以内に期日が来るもの）
    const rest = queue.filter((c) => c.id !== current.card.id)
    setQueue(updated.due <= Date.now() + 20 * 60 * 1000 ? [...rest, updated] : rest)
  }, [current, queue, result, addFloat, battle.honest, startXp])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal() }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) void grade(Number(e.key) as Grade)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, reveal, grade])

  if (!queue) return <p className="muted">読み込み中…</p>

  if (!current) {
    return (
      <div className="review battle" data-fx={fx}>
        <section className="card stack win" style={{ textAlign: 'center' }}>
          <h2 className="win-title">{battle.total ? '戦いの結果' : '静かな道'}</h2>
          {battle.total > 0 ? (
            <>
              <p className="result-lead">{battle.total}回 思い出そうとしました</p>
              <dl className="result-grid">
                <div><dt>思い出せた</dt><dd>{battle.recalled}</dd></div>
                <div><dt>最高コンボ</dt><dd>{battle.maxCombo}</dd></div>
                <div><dt>会心の一撃</dt><dd>{battle.crits}</dd></div>
                <div><dt>正直ボーナス</dt><dd>{battle.honest}</dd></div>
                <div><dt>経験値</dt><dd>+{battle.xp}</dd></div>
                <div><dt>思い出そうとした</dt><dd>{battle.total}</dd></div>
              </dl>
              <LevelBar total={shownXp} />
              {battle.levelUps > 0 && <p className="result-lead">レベルが {battle.levelUps} 上がりました！</p>}
              <p className="muted">思い出せなかったカードも、思い出そうとした分の経験値が入っています。「忘れた」と正直に押した分は、正直ボーナスつきです。</p>
            </>
          ) : (
            <p>今日戦う（復習する）カードはありません。</p>
          )}
          <button className="btn block" onClick={onAddCards}>＋ 新しいカードを覚える</button>
          <button className="btn secondary block" onClick={onExit}>今日の画面に戻る</button>
        </section>
      </div>
    )
  }

  const { card, item, raw, mode } = current
  const intervals = revealed ? previewIntervals(card.fsrs, revealedAt, settings.retention) : null
  const remaining = queue.filter((c) => c.due <= current.shownAt).length
  const stage = comboStage(comboShown)

  return (
    <div className={`review battle stage-${stage}`} data-fx={fx}>
      <div className="battle-hud">
        <LevelBar total={shownXp} compact />
        <div className="hud-row">
          <span className="hud-item"><PixelIcon name="slime" size={18} /> のこり <strong className="num">{remaining}</strong></span>
          <span className="hud-item"><PixelIcon name="sword" size={18} /> <strong className="num">{battle.total}</strong>回</span>
          {comboShown >= 3
            ? <span className={`combo-badge s${stage}`} key={comboShown}><span className="num">{comboShown}</span> COMBO <span className="mult">×{COMBO_STEPS[stage].mult}</span></span>
            : <span className="tag">{MODE_NAME[mode]}</span>}
        </div>
      </div>

      {honestLine && <p className="honest-line" key={honestLine + battle.total}><PixelIcon name="star" size={16} /> {honestLine}</p>}
      <Steps steps={['思い出して声に出す', '答えを見て評価する']} current={revealed ? 1 : 0}
        guide={revealed ? '思い出せたかどうかを、正直に4つから選びましょう。' : MODE_PROMPT[mode]} />
      <div className="card-stage">
        {/* 演出の層はカードの外に置く（次のカードに替わっても途中で消えない） */}
        <div className="hit-layer" key={`h${hit.seed}`} aria-hidden>
          {hit.seed > 0 && <span className="slash" />}
          {hit.crit && <span className="flash" />}
          <Sparks seed={hit.seed} level={fx} strength={hit.strength} />
        </div>
        <Floats floats={floats} />
        <section className="card flashcard win" key={`c${card.id}-${current.shownAt}`} onClick={reveal}>
          <span className="win-title">{MODE_NAME[mode]}</span>
          {mode === 'word' && (
            <div className="row" style={{ justifyContent: 'center' }}>
              <span className="headword">{item.english}</span>
              <SpeakButton text={item.english} voiceURI={settings.voiceURI} bank={bankRef.head(item.english)} />
            </div>
          )}
          {mode === 'chunk' && (
            <p className="front-sentence"><Highlight text={item.examples[0].en} forms={item.forms ?? [item.english]} /></p>
          )}
          {mode === 'listen' && (
            <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
              <SpeakButton big text={item.examples[0]?.en ?? item.english} voiceURI={settings.voiceURI} label="もう一度聞く"
                bank={item.examples[0] ? bankRef.example(item.examples[0].en) : bankRef.head(item.english)} />
              <SpeakButton big text={item.examples[0]?.en ?? item.english} voiceURI={settings.voiceURI} rate={0.8} label="ゆっくり"
                bank={item.examples[0] ? bankRef.example(item.examples[0].en) : bankRef.head(item.english)} />
            </div>
          )}

          {revealed ? (
            <AnswerFace item={raw} phase={settings.phase} voiceURI={settings.voiceURI}
              showJa={showJa} onToggleJa={() => setShowJa(true)} hideHeadword={mode === 'word'} />
          ) : (
            <button className="btn block" style={{ marginTop: 16 }} onClick={(e) => { e.stopPropagation(); reveal() }}>
              答えを見る
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
