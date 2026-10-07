import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Recording, type Settings } from '../db/schema'
import { updateSettings } from '../db/settings'
import { dayKey } from '../today/menu'
import { loadStreak, MIN_SECONDS, NOT_PRACTICE, weekStart } from '../habit/streak'
import { startOfDay } from '../srs/queue'
import { acquireFact, pickFact, useFacts, type FactContent } from './facts'
import { quoteForDay, useQuotes } from './quotes'
import { playComplete, playFact } from './sound'
import { DailyComplete, FactArrived, TitlesArrived, WeeklySummaryModal } from './RewardModals'
import { grantTitles, loadStats, newTitles, TITLES, type TitleDef } from './titles'
import { lastWeekSummary, type WeekSummary } from './weekly'

/** 今日復習した単語（雑学を選ぶときに優先する） */
async function reviewedWordsToday(): Promise<Set<string>> {
  const reviews = await db.reviews.where('at').aboveOrEqual(startOfDay(Date.now())).toArray()
  const cards = await db.cards.bulkGet([...new Set(reviews.map((r) => r.cardId))])
  const items = await db.items.bulkGet(cards.filter((c) => c !== undefined).map((c) => c.itemId))
  const words = new Set<string>()
  for (const i of items) for (const f of i?.forms ?? (i ? [i.english] : [])) words.add(f.toLowerCase())
  return words
}

/**
 * 毎日のごほうび。練習画面を閉じて今日の画面などに戻ったときに出す（練習の途中では邪魔しない）。
 * - 最低ライン（5分）を達成 → 今日の雑学カードが1枚届く
 * - 1日の目標時間を達成 → トロフィー画面と名言（1日1回）
 */
export function useDailyRewards(settings: Settings, idle: boolean) {
  const today = dayKey()
  const facts = useFacts()
  const quotes = useQuotes()
  // 学習時間（トロフィーの判定）は雑学を読む時間も含め、最低ライン（雑学カード）は練習の時間だけで判定する
  const { seconds, practice } = useLiveQuery(
    async () => {
      const list = await db.sessions.where('day').equals(today).toArray()
      return {
        seconds: list.reduce((s, x) => s + x.seconds, 0),
        practice: list.filter((x) => !NOT_PRACTICE.has(x.kind)).reduce((s, x) => s + x.seconds, 0),
      }
    },
    [today], { seconds: 0, practice: 0 },
  )
  const gotToday = useLiveQuery(() => db.facts.where('acquiredDay').equals(today).count(), [today], -1)
  const [fact, setFact] = useState<FactContent | null>(null)
  const [trophy, setTrophy] = useState<{ streak: number; minutes: number } | null>(null)
  const [titles, setTitles] = useState<{ list: TitleDef[]; compare?: { old: Recording; recent: Recording } } | null>(null)
  const [weekly, setWeekly] = useState<{ summary: WeekSummary; titleNames: string[] } | null>(null)
  const busy = useRef(false)
  const lastTitleCheck = useRef(0)

  useEffect(() => {
    if (!idle || !facts || busy.current || fact || trophy || titles || weekly) return
    if (practice >= MIN_SECONDS && gotToday === 0) {
      busy.current = true
      void (async () => {
        const owned = new Map((await db.facts.toArray()).map((f) => [f.id, f]))
        const picked = pickFact({
          facts: facts.facts, owned, reviewedWords: await reviewedWordsToday(),
          liked: new Set(settings.likedCategories), phase: settings.phase,
        })
        if (picked) {
          await acquireFact(picked, today)
          playFact(picked.rare)
          setFact(picked)
        }
        busy.current = false
      })()
    } else if (settings.lastWeeklySummary !== weekStart(today)) {
      // 週が変わって最初に開いたとき、先週のまとめを出す
      busy.current = true
      void (async () => {
        await updateSettings({ lastWeeklySummary: weekStart(today) })
        const summary = await lastWeekSummary(today)
        if (summary) setWeekly({ summary, titleNames: summary.titles.map((k) => TITLES.find((t) => t.key === k)?.name ?? k) })
        busy.current = false
      })()
    } else if (seconds >= settings.targetMinutes * 60 && settings.lastTrophyDay !== today && gotToday > 0) {
      busy.current = true
      void (async () => {
        const streak = await loadStreak()
        await updateSettings({ lastTrophyDay: today })
        playComplete()
        setTrophy({ streak: streak.current, minutes: Math.floor(seconds / 60) })
        busy.current = false
      })()
    } else if (Date.now() - lastTitleCheck.current > 60_000) {
      // 称号の条件を確かめる（練習画面から戻ったときなど、1分に1回まで）
      lastTitleCheck.current = Date.now()
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
        busy.current = false
      })()
    }
  }, [idle, facts, seconds, practice, gotToday, fact, trophy, titles, weekly, settings, today])

  if (fact && facts) return <FactArrived fact={fact} data={facts} settings={settings} onClose={() => setFact(null)} />
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
