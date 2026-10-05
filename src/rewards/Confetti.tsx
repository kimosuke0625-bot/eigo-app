import { useMemo } from 'react'
import type { EffectsLevel } from '../db/schema'

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#f97316']
const COUNT: Record<EffectsLevel, number> = { low: 0, medium: 40, high: 90 }

/** 紙吹雪（前回アプリから引き継ぎ）。演出の量が「少なめ」なら出さない。動きを減らす設定の端末でも出さない */
export function Confetti({ level, seed }: { level: EffectsLevel; seed: number }) {
  const pieces = useMemo(() => {
    let s = seed || 1
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    return Array.from({ length: COUNT[level] }, (_, i) => ({
      key: `${seed}-${i}`,
      left: rand() * 100,
      delay: rand() * 0.6,
      duration: 1.8 + rand() * 1.4,
      color: COLORS[Math.floor(rand() * COLORS.length)],
      rotate: rand() * 360,
    }))
  }, [level, seed])
  if (!pieces.length) return null
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p) => (
        <span key={p.key} style={{
          left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`, transform: `rotate(${p.rotate}deg)`,
        }} />
      ))}
    </div>
  )
}
