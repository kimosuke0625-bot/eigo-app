import { useMemo } from 'react'
import type { EffectsLevel } from '../db/schema'
import { levelFromXp } from './xp'

/** レベルと経験値のバー。total が増えるとバーが伸びる */
export function LevelBar({ total, compact = false }: { total: number; compact?: boolean }) {
  const { level, into, need } = levelFromXp(total)
  const pct = Math.min(100, (into / need) * 100)
  return (
    <div className={`lv-bar${compact ? ' compact' : ''}`}>
      <span className="lv-label"><span className="lv-small">Lv</span>{level}</span>
      <div className="xp-track" role="progressbar" aria-label="経験値" aria-valuemin={0} aria-valuemax={need} aria-valuenow={into}>
        {/* key を変えると、レベルが上がったときにバーが0から伸び直す */}
        <div key={level} className="xp-fill" style={{ width: `${pct}%` }} />
      </div>
      {!compact && <span className="xp-num">{into}<span className="lv-small"> / {need}</span></span>}
    </div>
  )
}

export interface Float {
  id: number
  text: string
  kind: 'xp' | 'crit' | 'combo' | 'level'
}

/** 飛び出す数字（約0.9秒で消える） */
export function Floats({ floats }: { floats: Float[] }) {
  return (
    <div className="floats" aria-hidden>
      {floats.map((f) => <span key={f.id} className={`float ${f.kind}`}>{f.text}</span>)}
    </div>
  )
}

const SPARK_COUNT: Record<EffectsLevel, number> = { low: 0, medium: 8, high: 16 }
const SPARK_COLORS = ['#ffd23f', '#f28c28', '#7dd3fc', '#ffffff', '#c4b5fd']

/** 火花（演出が「ふつう」以上。動きを減らす設定では CSS で消す） */
export function Sparks({ seed, level, strength }: { seed: number; level: EffectsLevel; strength: number }) {
  const sparks = useMemo(() => {
    const n = Math.round(SPARK_COUNT[level] * Math.min(1.5, 0.5 + strength * 0.25))
    let s = seed * 9301 + 49297
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    return Array.from({ length: n }, (_, i) => {
      const angle = (i / n) * Math.PI * 2 + rand() * 0.6
      const dist = 50 + rand() * 60
      return {
        key: `${seed}-${i}`,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        color: SPARK_COLORS[Math.floor(rand() * SPARK_COLORS.length)],
      }
    })
  }, [seed, level, strength])
  if (!sparks.length || !seed) return null
  return (
    <div className="sparks" aria-hidden>
      {sparks.map((p) => (
        <span key={p.key} style={{ background: p.color, ['--dx' as string]: `${p.dx}px`, ['--dy' as string]: `${p.dy}px` }} />
      ))}
    </div>
  )
}
