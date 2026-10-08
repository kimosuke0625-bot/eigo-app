import type { Settings } from '../db/schema'
import { BASE_TOTAL, HOLD_ABOVE_BASE, PILLAR_LABELS, planMenu } from '../today/menu'
import { questCount } from '../rewards/quests'
import { reviewForecast } from '../srs/forecast'

/**
 * 目標時間を変えたとき、今日のメニューがどう変わるかをその場で見せる（2026-10-09 利用者の依頼）。
 * 4つの柱の比率は変えない。60分より多い分は、単語の復習と新しいカードには回さず、ほかの練習に回る。
 */
export function PlanPreview({ settings }: { settings: Settings }) {
  const plan = planMenu(settings.targetMinutes, settings.blockOrder)
  const base = planMenu(BASE_TOTAL, settings.blockOrder)
  const pillars = [...new Set(plan.map((p) => p.pillar))]
  const quests = questCount(settings.targetMinutes)
  return (
    <div className="plan-preview">
      <p className="muted">この目標時間での今日のメニュー（今日のクエスト {quests}つ）。カッコ内は60分のときとの差です。</p>
      {pillars.map((p) => {
        const items = plan.filter((x) => x.pillar === p)
        return (
          <div key={p} className="plan-pillar">
            <strong>{PILLAR_LABELS[p]} {items.reduce((s, x) => s + x.minutes, 0)}分</strong>
            <ul>
              {items.map((x) => {
                const d = x.minutes - (base.find((b) => b.kind === x.kind)?.minutes ?? 0)
                return (
                  <li key={x.kind}>
                    {x.label} {x.minutes}分{d !== 0 && <span className={d > 0 ? 'plan-up' : 'plan-down'}>（{d > 0 ? '+' : ''}{d}）</span>}
                    {settings.targetMinutes > BASE_TOTAL && HOLD_ABOVE_BASE.includes(x.kind) && <span className="muted">（増やさない）</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
      <small className="muted">最低ライン（どの練習でも合計5分で「継続」）は、目標時間を変えても同じです。</small>
    </div>
  )
}

/** 新しく覚える数を変えたときの、数週間後の1日の復習の見込み（新しいカードの数は目標時間を増やしても自動では増やさない） */
export function ReviewForecastNote({ newPerDay, retention, secondsPerCard, unit }: { newPerDay: number; retention: number; secondsPerCard: number; unit: string }) {
  if (newPerDay <= 0) return null
  const f = reviewForecast(newPerDay, retention, secondsPerCard, [1, 2, 4, 8])
  return (
    <small className="muted forecast">
      見込み：毎日{newPerDay}{unit}ずつ加えると、1日の復習は {f.map((x) => `${x.weeks}週間後 約${x.reviews}${unit}（約${x.minutes}分）`).join('、')}。
      毎回思い出せた場合の計算です。忘れた{unit === '枚' ? 'カード' : 'もの'}は出し直すので、実際はこれより多くなります。
    </small>
  )
}
