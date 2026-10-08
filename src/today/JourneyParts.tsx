import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Settings } from '../db/schema'
import { updateSettings } from '../db/settings'
import { weekStart } from '../habit/streak'
import { dayKey, PILLAR_LABELS, type PracticeKind } from './menu'
import { PixelIcon } from '../ui/PixelIcon'
import { CHEST_XP, openChest, readQuests, todaysQuests } from '../rewards/quests'
import { claimComeback, COMEBACK_GAP, COMEBACK_XP, daysAway, daysToBoss, isBossDay, loadVersus } from '../rewards/boss'
import { ensureTeaser } from '../rewards/packs'
import { useFacts, type FactContent } from '../rewards/facts'
import { playComplete, playLevelUp } from '../rewards/sound'

/** おかえりボーナス：2日以上休んで戻った日に出す（責める言葉は使わない） */
export function ComebackBanner({ settings }: { settings: Settings }) {
  const today = dayKey()
  const away = useLiveQuery(() => daysAway(today), [today], 0)
  const [got, setGot] = useState(false)
  if (got) return <div className="banner ok comeback"><strong>おかえりボーナスを受け取りました！</strong> 雑学パックも届いています。</div>
  if (away < COMEBACK_GAP || settings.comebackDay === today) return null
  return (
    <div className="banner ok comeback">
      <PixelIcon name="chest" size={28} />
      <div>
        <strong>おかえりなさい、旅人よ。</strong> {away}日ぶりの旅ですね。休んでいる間も、レベルも持ち物もそのままです。
        <button className="btn block" style={{ marginTop: 8 }}
          onClick={async () => { if (await claimComeback(today)) { playComplete(); setGot(true) } }}>
          おかえりボーナスを受け取る（+{COMEBACK_XP} XP と雑学パック）
        </button>
      </div>
    </div>
  )
}

/** 今日のクエスト（3つ）と宝箱 */
export function QuestBoard({ onStart }: { onStart: (k: PracticeKind) => void }) {
  const today = dayKey()
  // その日のクエストを決めて残す（自動更新の中では書き込めないので別に行う）
  const [fixed, setFixed] = useState(false)
  useEffect(() => { void todaysQuests(today).then(() => setFixed(true)) }, [today])
  // 練習の記録が変わるたびに数え直す
  const state = useLiveQuery(() => readQuests(today), [today, fixed])
  const [opening, setOpening] = useState(false)
  if (!state) return null
  const doneCount = state.quests.filter((q) => q.done).length
  const all = doneCount === state.quests.length

  return (
    <section className="card stack quest-win">
      <h2 className="win-title">今日のクエスト</h2>
      <ul className="quest-list">
        {state.quests.map((q) => (
          <li key={q.def.key} className={q.done ? 'done' : ''}>
            <button className="quest-row" onClick={() => onStart(q.def.start as PracticeKind)} disabled={q.done}>
              <span className="quest-check" aria-hidden>{q.done ? '✓' : ''}</span>
              <span className="quest-text">
                <span className="quest-label">{q.def.label}</span>
                <span className="muted">{PILLAR_LABELS[q.def.pillar]}・<span className="num">{Math.min(q.value, q.def.goal)} / {q.def.goal}</span> {q.def.unit}</span>
              </span>
              {!q.done && <span className="min">▶</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className={`chest-row${all && !state.chestOpened ? ' ready' : ''}`}>
        <PixelIcon name={state.chestOpened || opening ? 'chestOpen' : 'chest'} size={40} className="chest-icon" />
        {state.chestOpened ? (
          <p>宝箱を開けました。また明日、新しいクエストが届きます。</p>
        ) : all ? (
          <button className="btn block" disabled={opening} onClick={async () => {
            setOpening(true)
            if (await openChest(today)) { playLevelUp(); window.setTimeout(playComplete, 300) }
            setOpening(false)
          }}>宝箱を開ける（+{CHEST_XP} XP と雑学パック）</button>
        ) : (
          <p className="muted">3つ全部やり遂げると宝箱が開きます（いま {doneCount} / 3）。</p>
        )}
      </div>
    </section>
  )
}

/** 過去の自分との対戦：先週の同じ曜日と、先週の同じ時点までの合計 */
export function VersusWindow({ settings }: { settings: Settings }) {
  const today = dayKey()
  const v = useLiveQuery(() => loadVersus(today), [today, settings.xpTotal])
  const [cheer, setCheer] = useState(false)
  const beat = !!v && v.lastWeekDay > 0 && v.today > v.lastWeekDay
  useEffect(() => {
    // 先週の自分を上回ったら、その日に1回だけ演出を出す
    if (beat && settings.beatDay !== today) {
      void updateSettings({ beatDay: today })
      playLevelUp()
      setCheer(true)
    }
  }, [beat, settings.beatDay, today])
  if (!v) return null
  const weekday = new Date().toLocaleDateString('ja-JP', { weekday: 'short' })
  const bar = (a: number, b: number) => `${Math.min(100, (a / Math.max(1, a, b)) * 100)}%`
  return (
    <section className={`card stack versus-win${cheer ? ' cheer' : ''}`}>
      <h2 className="win-title">先週の自分と対戦</h2>
      {cheer && <p className="versus-cheer">先週の自分を超えた！</p>}
      <div className="versus">
        <div className="versus-row"><span>今日</span><div className="vbar me"><div style={{ width: bar(v.today, v.lastWeekDay) }} /></div><span className="num">{v.today}</span></div>
        <div className="versus-row"><span>先週の{weekday}</span><div className="vbar ghost"><div style={{ width: bar(v.lastWeekDay, v.today) }} /></div><span className="num">{v.lastWeekDay}</span></div>
      </div>
      <div className="versus">
        <div className="versus-row"><span>今週</span><div className="vbar me"><div style={{ width: bar(v.thisWeek, v.lastWeekSoFar) }} /></div><span className="num">{v.thisWeek}</span></div>
        <div className="versus-row"><span>先週の同じ時点</span><div className="vbar ghost"><div style={{ width: bar(v.lastWeekSoFar, v.thisWeek) }} /></div><span className="num">{v.lastWeekSoFar}</span></div>
      </div>
      <p className="muted">
        {v.lastWeekDay === 0 ? '先週のこの曜日はお休みでした。今日の一歩がそのまま記録になります。'
          : beat ? '今日は先週の自分に勝っています。'
            : `あと ${v.lastWeekDay - v.today + 1} XP で先週の自分を超えます。`}
        比べる相手は過去の自分だけです。
      </p>
    </section>
  )
}

/** 週のボスのお知らせ */
export function BossNotice({ onStart }: { onStart: (k: PracticeKind) => void }) {
  const record = useLiveQuery(() => db.bosses.get(weekStart(dayKey())), [])
  if (record?.defeated) return null
  if (!isBossDay()) {
    return <p className="muted boss-note"><PixelIcon name="dragon" size={18} /> 週のボス（単語）はあと {daysToBoss()} 日（土曜）で現れます。</p>
  }
  return (
    <button className="menu-item as-button boss-ready" onClick={() => onStart('boss')}>
      <PixelIcon name="dragon" size={32} className="quest-icon" />
      <div className="body">
        <div className="name">週のボス（単語）が現れた！</div>
        <div className="muted">対象：今週学んだ単語。倒すと +200 XP と雑学パック</div>
      </div>
      <span className="min">▶</span>
    </button>
  )
}

/** 明日の雑学の予告（1日の終わりに、冒頭だけを見せる） */
export function TeaserCard({ settings, show }: { settings: Settings; show: boolean }) {
  const data = useFacts()
  const [fact, setFact] = useState<FactContent | undefined>()
  useEffect(() => {
    if (!show || !data) return
    void ensureTeaser({ facts: data.facts, liked: new Set(settings.likedCategories), phase: settings.phase }).then(setFact)
  }, [show, data, settings.likedCategories, settings.phase])
  if (!show || !fact) return null
  const head = fact.ja.length > 22 ? `${fact.ja.slice(0, 22)}…` : fact.ja
  return (
    <section className="card stack teaser">
      <h2 className="win-title">明日の予告</h2>
      <p className="teaser-text"><span aria-hidden>{fact.emoji}</span> {head}</p>
      <p className="muted">この雑学の続きは、明日の最初の雑学パックに入っています。{fact.rare ? 'しかも……レアの気配。' : ''}</p>
    </section>
  )
}
