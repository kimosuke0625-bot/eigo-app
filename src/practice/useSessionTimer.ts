import { useEffect, useRef } from 'react'
import { db, type Pillar } from '../db/schema'
import { dayKey } from '../today/menu'

/**
 * 練習画面を開いている時間を sessions に記録する。
 * 画面が隠れている間は数えない。iPhone で途中でアプリが閉じられても失われないよう10秒ごとに保存する。
 */
export function useSessionTimer(kind: string, pillar: Pillar) {
  const result = useRef<Record<string, number>>({})

  useEffect(() => {
    let seconds = 0
    let last = Date.now()
    let id: number | undefined
    let stopped = false
    const created = db.sessions.add({ at: last, day: dayKey(), kind, pillar, seconds: 0 }).then((k) => (id = k))

    const tick = () => {
      const now = Date.now()
      if (document.visibilityState === 'visible') seconds += Math.min(now - last, 15000) / 1000
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
  }, [kind, pillar])

  return result
}
