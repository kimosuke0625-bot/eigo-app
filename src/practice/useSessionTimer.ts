import { useEffect, useRef } from 'react'
import { db, type Pillar } from '../db/schema'
import { dayKey } from '../today/menu'

/**
 * 練習画面を開いている時間を sessions に記録する。
 * 画面が隠れている間は数えない。iPhone で途中でアプリが閉じられても失われないよう10秒ごとに保存する。
 * maxPerDay を渡すと、同じ種類の練習の1日の合計がその秒数を超えた分は数えない（雑学を読む時間など）。
 */
export function useSessionTimer(kind: string, pillar: Pillar, maxPerDay?: number) {
  const result = useRef<Record<string, number>>({})

  useEffect(() => {
    let seconds = 0
    let last = Date.now()
    let id: number | undefined
    let stopped = false
    let allowed = Infinity
    const day = dayKey()
    const created = db.sessions.add({ at: last, day, kind, pillar, seconds: 0 }).then(async (k) => {
      id = k
      if (maxPerDay !== undefined) {
        const before = (await db.sessions.where('day').equals(day).filter((x) => x.kind === kind && x.id !== k).toArray())
          .reduce((sum, x) => sum + x.seconds, 0)
        allowed = Math.max(0, maxPerDay - before)
      }
    })

    const tick = () => {
      const now = Date.now()
      if (document.visibilityState === 'visible') seconds = Math.min(allowed, seconds + Math.min(now - last, 15000) / 1000)
      last = now
    }
    const save = async () => {
      await created
      if (id !== undefined) await db.sessions.update(id, { seconds: Math.round(seconds), result: { ...result.current } })
    }
    const timer = window.setInterval(() => { tick(); void save() }, 10000)
    const onVisibility = () => { tick(); void save() }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (stopped) return
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      tick()
      void save().then(async () => {
        // 数秒だけ開いて閉じた記録は残さない
        if (id !== undefined && seconds < 5) await db.sessions.delete(id)
      })
    }
  }, [kind, pillar, maxPerDay])

  return result
}
