import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Pack, type Recording, type Settings } from '../db/schema'
import { updateSettings } from '../db/settings'
import { dayKey } from '../today/menu'
import { loadStreak, weekStart } from '../habit/streak'
import { startOfDay } from '../srs/queue'
import { useFacts } from './facts'
import { quoteForDay, useQuotes } from './quotes'
import { playComplete, playFact } from './sound'
import { DailyComplete, TitlesArrived, WeeklySummaryModal } from './RewardModals'
import { PackOpening } from './PackOpening'
import { migrateXp } from './xp'
import { grantTitles, loadStats, newTitles, TITLES, type TitleDef } from './titles'
import { lastWeekSummary, type WeekSummary } from './weekly'

/** 今日復習した単語（雑学を選ぶときに優先する） */
export async function reviewedWordsToday(): Promise<Set<string>> {
  const reviews = await db.reviews.where('at').aboveOrEqual(startOfDay(Date.now())).toArray()
  const cards = await db.cards.bulkGet([...new Set(reviews.map((r) => r.cardId))])
  const items = await db.items.bulkGet(cards.filter((c) => c !== undefined).map((c) => c.itemId))
  const words = new Set<string>()
  for (const i of items) for (const f of i?.forms ?? (i ? [i.english] : [])) words.add(f.toLowerCase())
  return words
}

/**
 * 毎日のごほうび。練習画面を閉じて今日の画面などに戻ったときに出す（練習の途中では邪魔しない）。
 * - 練習を1つやり遂げる（2分以上）→ 雑学パックが1つ届く（開けると雑学が図鑑に入る）
 * - 最低ライン（5分）を達成したのに、その日まだパックが届いていなければ1つ届ける
 * - 1日の目標時間を達成 → トロフィー画面と名言（1日1回）
 */
export function useDailyRewards(settings: Settings, idle: boolean) {
  const today = dayKey()
  const facts = useFacts()
  const quotes = useQuotes()
  // 学習時間（トロフィーの判定）は雑学を読む時間も含める。最低ラインのパックは練習を終えたときに届く（packs.ts）
  const seconds = useLiveQuery(
    async () => (await db.sessions.where('day').equals(today).toArray()).reduce((s, x) => s + x.seconds, 0),
    [today], 0,
  )
  // 届いたことをまだ知らせていない雑学パック
  const arrived = useLiveQuery(() => db.packs.where('opened').equals(0).filter((p) => p.notified === 0).toArray(), [], [] as Pack[])
  // 開封の画面に出しているパック（開けている間に一覧が変わっても並びが崩れないよう、出した時点の一覧を持つ）
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [trophy, setTrophy] = useState<{ streak: number; minutes: number } | null>(null)
  const [titles, setTitles] = useState<{ list: TitleDef[]; compare?: { old: Recording; recent: Recording } } | null>(null)
  const [weekly, setWeekly] = useState<{ summary: WeekSummary; titleNames: string[] } | null>(null)
  const busy = useRef(false)
  // 確かめ終わったら描画し直す（その間に届いたパックなどを取りこぼさない）
  const [checked, setChecked] = useState(0)
  const release = () => { busy.current = false; setChecked((n) => n + 1) }
  // 称号を確かめるのは、アプリを開いたときと、練習画面から戻ったとき
  const titleCheckNeeded = useRef(true)
  useEffect(() => { if (!idle) titleCheckNeeded.current = true }, [idle])
  // これまでの学習から経験値を計算する（初回だけ）
  useEffect(() => { void migrateXp() }, [])

  useEffect(() => {
    if (!idle || !facts || busy.current || packs || trophy || titles || weekly) return
    if (arrived.length > 0) {
      playFact(false)
      setPacks(arrived)
    } else if (settings.lastWeeklySummary !== weekStart(today)) {
      // 週が変わって最初に開いたとき、先週のまとめを出す
      busy.current = true
      void (async () => {
        await updateSettings({ lastWeeklySummary: weekStart(today) })
        const summary = await lastWeekSummary(today)
        if (summary) setWeekly({ summary, titleNames: summary.titles.map((k) => TITLES.find((t) => t.key === k)?.name ?? k) })
        release()
      })()
    } else if (seconds >= settings.targetMinutes * 60 && settings.lastTrophyDay !== today) {
      busy.current = true
      void (async () => {
        const streak = await loadStreak()
        await updateSettings({ lastTrophyDay: today })
        playComplete()
        setTrophy({ streak: streak.current, minutes: Math.floor(seconds / 60) })
        release()
      })()
    } else if (titleCheckNeeded.current) {
      // 称号の条件を確かめる（練習画面から戻ったとき）
      titleCheckNeeded.current = false
      busy.current = true
      void (async () => {
        const stats = await loadStats(settings.phase, new Set(facts.facts.filter((f) => f.rare).map((f) => f.id)))
        const owned = new Set((await db.rewards.where('kind').equals('title').toArray()).map((r) => r.key))
        const got = newTitles(stats, owned)
        if (got.length) {
          await grantTitles(got)
          playComplete()
          setTitles({ list: got, compare: await milestoneCompare() })
        }
        release()
      })()
    }
  }, [idle, facts, seconds, arrived, packs, trophy, titles, weekly, settings, today, checked])

  if (packs && facts) {
    return <PackOpening packs={packs} data={facts} settings={settings} reviewedWords={reviewedWordsToday}
      onClose={() => {
        // 開けなかったパックも、知らせ済みにする（今日の画面の持ち物から開けられる）
        void db.packs.bulkUpdate(packs.map((p) => ({ key: p.id!, changes: { notified: 1 as const } })))
        setPacks(null)
      }} />
  }
  if (weekly) return <WeeklySummaryModal summary={weekly.summary} titleNames={weekly.titleNames} onClose={() => setWeekly(null)} />
  if (titles) return <TitlesArrived titles={titles.list} settings={settings} compare={titles.compare} onClose={() => setTitles(null)} />
  if (trophy) {
    return <DailyComplete quote={quoteForDay(quotes, today)} settings={settings}
      streak={trophy.streak} minutes={trophy.minutes} onClose={() => setTrophy(null)} />
  }
  return null
}

/** 節目の聞き比べ：4週間以上前の録音と、最近の録音（同じ種類の練習のもの） */
async function milestoneCompare(): Promise<{ old: Recording; recent: Recording } | undefined> {
  const all = await db.recordings.orderBy('at').toArray()
  const recent = all.at(-1)
  if (!recent) return undefined
  const old = all.filter((r) => r.kind === recent.kind && recent.at - r.at >= 28 * 86_400_000).at(-1)
  return old ? { old, recent } : undefined
}
