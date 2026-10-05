import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Settings } from '../db/schema'
import { updateSettings } from '../db/settings'
import { dayKey } from '../today/menu'
import { loadStreak, MIN_SECONDS } from '../habit/streak'
import { startOfDay } from '../srs/queue'
import { acquireFact, pickFact, useFacts, type FactContent } from './facts'
import { quoteForDay, useQuotes } from './quotes'
import { playComplete, playFact } from './sound'
import { DailyComplete, FactArrived } from './RewardModals'

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
  const seconds = useLiveQuery(
    async () => (await db.sessions.where('day').equals(today).toArray()).reduce((s, x) => s + x.seconds, 0),
    [today], 0,
  )
  const gotToday = useLiveQuery(() => db.facts.where('acquiredDay').equals(today).count(), [today], -1)
  const [fact, setFact] = useState<FactContent | null>(null)
  const [trophy, setTrophy] = useState<{ streak: number; minutes: number } | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    if (!idle || !facts || busy.current || fact || trophy) return
    if (seconds >= MIN_SECONDS && gotToday === 0) {
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
    } else if (seconds >= settings.targetMinutes * 60 && settings.lastTrophyDay !== today && gotToday > 0) {
      busy.current = true
      void (async () => {
        const streak = await loadStreak()
        await updateSettings({ lastTrophyDay: today })
        playComplete()
        setTrophy({ streak: streak.current, minutes: Math.floor(seconds / 60) })
        busy.current = false
      })()
    }
  }, [idle, facts, seconds, gotToday, fact, trophy, settings, today])

  if (fact && facts) return <FactArrived fact={fact} data={facts} settings={settings} onClose={() => setFact(null)} />
  if (trophy) {
    return <DailyComplete quote={quoteForDay(quotes, today)} settings={settings}
      streak={trophy.streak} minutes={trophy.minutes} onClose={() => setTrophy(null)} />
  }
  return null
}
