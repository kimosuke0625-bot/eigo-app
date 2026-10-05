import { useState, type ReactNode } from 'react'

// グラフの部品（自作SVG）。色はデータの役割ごとに CSS 変数（--series-1〜4、--seq-0〜4）から取る。
// 文字は色をつけず本文の色、識別は横に置いた色の印で行う。どのグラフにも「表で見る」がある。

function TableToggle({ children, table }: { children: ReactNode; table: ReactNode }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <div>
      {asTable ? <div className="viz-table-wrap">{table}</div> : children}
      <button className="link-btn viz-toggle" onClick={() => setAsTable(!asTable)}>
        {asTable ? 'グラフで見る' : '表で見る'}
      </button>
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="viz-legend">
      {items.map((i) => (
        <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  )
}

const fmtWeek = (w: string) => `${Number(w.slice(5, 7))}/${Number(w.slice(8, 10))}〜`

/** 週ごとの横向き積み上げ棒。系列の間は2pxのすき間で区切る */
export function StackedWeekBars<K extends string>({ rows, series, unit = '分' }: {
  rows: { week: string; values: Record<K, number> }[]
  series: { key: K; label: string; color: string }[]
  unit?: string
}) {
  const [hover, setHover] = useState<{ week: string; key: K } | null>(null)
  const max = Math.max(1, ...rows.map((r) => series.reduce((s, x) => s + r.values[x.key], 0)))
  const W = 320
  const labelW = 52
  const barH = 18
  const gap = 12
  const plotW = W - labelW - 44
  const H = rows.length * (barH + gap)
  const total = (r: (typeof rows)[number]) => series.reduce((s, x) => s + r.values[x.key], 0)
  const table = (
    <table className="viz-table">
      <thead><tr><th>週</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}<th>合計</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.week}><td>{fmtWeek(r.week)}</td>
            {series.map((s) => <td key={s.key}>{Math.round(r.values[s.key])}</td>)}
            <td>{Math.round(total(r))}</td></tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <TableToggle table={table}>
      <Legend items={series} />
      <svg viewBox={`0 0 ${W} ${H}`} className="viz" role="img" aria-label="週ごとの学習時間">
        {rows.map((r, i) => {
          const y = i * (barH + gap)
          let x = labelW
          const segs = series.filter((s) => r.values[s.key] > 0)
          return (
            <g key={r.week}>
              <text x={0} y={y + barH * 0.72} className="viz-axis">{fmtWeek(r.week)}</text>
              {segs.map((s, j) => {
                const w = Math.max(0, (r.values[s.key] / max) * plotW - (j < segs.length - 1 ? 2 : 0))
                const last = j === segs.length - 1
                const el = (
                  <path key={s.key} fill={s.color}
                    d={last ? roundedRight(x, y, w, barH, Math.min(4, w)) : `M${x},${y}h${w}v${barH}h${-w}z`}
                    opacity={hover && (hover.week !== r.week || hover.key !== s.key) ? 0.45 : 1}
                    onPointerEnter={() => setHover({ week: r.week, key: s.key })}
                    onPointerLeave={() => setHover(null)}
                    onClick={() => setHover({ week: r.week, key: s.key })} />
                )
                x += w + 2
                return el
              })}
              <text x={x + 4} y={y + barH * 0.72} className="viz-value">{Math.round(total(r))}{unit}</text>
            </g>
          )
        })}
      </svg>
      <p className="viz-tip" aria-live="polite">
        {hover
          ? `${fmtWeek(hover.week)} ${series.find((s) => s.key === hover.key)!.label}：${Math.round(rows.find((r) => r.week === hover.week)!.values[hover.key])}${unit}`
          : '棒に触れると内訳が出ます'}
      </p>
    </TableToggle>
  )
}

function roundedRight(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`
}

/** 1系列の折れ線。終点に値を書き、触れた点の値を下に出す。目標線を引ける */
export function LineChart({ points, yMax, format, target, color = 'var(--series-1)', label }: {
  points: { x: string; y: number | null }[]
  yMax?: number
  format: (v: number) => string
  target?: { value: number; label: string }
  color?: string
  label: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 320
  const H = 150
  const pad = { l: 36, r: 44, t: 12, b: 22 }
  const vals = points.map((p) => p.y).filter((v): v is number => v !== null)
  const max = yMax ?? niceMax(Math.max(...vals, target?.value ?? 0))
  const xs = (i: number) => pad.l + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - pad.l - pad.r))
  const ys = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const segs: string[] = []
  let cur = ''
  points.forEach((p, i) => {
    if (p.y === null) { if (cur) segs.push(cur); cur = ''; return }
    cur += `${cur ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p.y).toFixed(1)}`
  })
  if (cur) segs.push(cur)
  const lastIdx = points.map((p) => p.y).findLastIndex((v) => v !== null)
  // 目盛りは表示したときに重複しない値だけにする（小さい整数の範囲で「1, 1, 0」とならないように）
  const ticks = [0, max / 2, max].filter((t, i, a) => a.findIndex((u) => format(u) === format(t)) === i)
  const table = (
    <table className="viz-table">
      <thead><tr><th>期間</th><th>{label}</th></tr></thead>
      <tbody>{points.map((p) => <tr key={p.x}><td>{p.x}</td><td>{p.y === null ? '—' : format(p.y)}</td></tr>)}</tbody>
    </table>
  )
  if (!vals.length) return <p className="muted">まだ記録がありません。練習を続けると、ここに推移が表示されます。</p>
  if (vals.length < 2) return <p className="muted">いまの値：<strong>{format(vals[0])}</strong>。記録が2回分たまると推移のグラフになります。</p>
  return (
    <TableToggle table={table}>
      <svg viewBox={`0 0 ${W} ${H}`} className="viz" role="img" aria-label={label}
        onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={ys(t)} y2={ys(t)} className="viz-grid" />
            <text x={pad.l - 4} y={ys(t) + 3} className="viz-axis" textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {target && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={ys(target.value)} y2={ys(target.value)} className="viz-target" />
            <text x={W - pad.r + 4} y={ys(target.value) + 3} className="viz-axis">{target.label}</text>
          </g>
        )}
        <text x={pad.l} y={H - 4} className="viz-axis">{points[0].x}</text>
        <text x={W - pad.r} y={H - 4} className="viz-axis" textAnchor="end">{points.at(-1)!.x}</text>
        {segs.map((d, i) => <path key={i} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {hover !== null && points[hover].y !== null && (
          <line x1={xs(hover)} x2={xs(hover)} y1={pad.t} y2={H - pad.b} className="viz-cross" />
        )}
        {points.map((p, i) => p.y !== null && (
          <circle key={i} cx={xs(i)} cy={ys(p.y)} r={i === lastIdx || i === hover ? 4.5 : 0}
            fill={color} stroke="var(--surface)" strokeWidth={2} />
        ))}
        {lastIdx >= 0 && (
          <text x={xs(lastIdx) + 8} y={ys(points[lastIdx].y!) + 4} className="viz-value">{format(points[lastIdx].y!)}</text>
        )}
        {/* 触れた位置に近い点を選ぶための透明な帯（点より広い当たり判定） */}
        {points.map((_, i) => (
          <rect key={`h${i}`} x={xs(i) - (W - pad.l - pad.r) / Math.max(1, points.length - 1) / 2} y={0}
            width={(W - pad.l - pad.r) / Math.max(1, points.length - 1)} height={H} fill="transparent"
            onPointerEnter={() => setHover(i)} onClick={() => setHover(i)} />
        ))}
      </svg>
      <p className="viz-tip" aria-live="polite">
        {hover !== null ? `${points[hover].x}：${points[hover].y === null ? '記録なし' : format(points[hover].y!)}` : 'グラフに触れると値が出ます'}
      </p>
    </TableToggle>
  )
}

/** 学習カレンダー。色の濃さで練習時間、お休み券を使った日は印で示す */
export function CalendarHeat({ totals, restDays, today, weeks = 12, minSeconds }: {
  totals: Map<string, number>
  restDays: Set<string>
  today: string
  weeks?: number
  minSeconds: number
}) {
  const [hover, setHover] = useState<string | null>(null)
  const [y, m, d] = today.split('-').map(Number)
  const t = new Date(y, m - 1, d)
  const monday = new Date(y, m - 1, d - ((t.getDay() + 6) % 7) - 7 * (weeks - 1))
  const cell = 20
  const gap = 4
  const days: { key: string; col: number; row: number }[] = []
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    const p = (n: number) => String(n).padStart(2, '0')
    const key = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
    if (key > today) break
    days.push({ key, col: Math.floor(i / 7), row: i % 7 })
  }
  const level = (s: number) => (s <= 0 ? 0 : s < minSeconds ? 1 : s < 30 * 60 ? 2 : s < 60 * 60 ? 3 : 4)
  const W = weeks * (cell + gap) + 18
  const H = 7 * (cell + gap)
  const min = (k: string) => Math.round((totals.get(k) ?? 0) / 60)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="viz" role="img" aria-label="学習カレンダー">
        {['月', '水', '金'].map((l, i) => (
          <text key={l} x={0} y={i * 2 * (cell + gap) + cell * 0.7} className="viz-axis">{l}</text>
        ))}
        {days.map((dd) => {
          const x = 18 + dd.col * (cell + gap)
          const yy = dd.row * (cell + gap)
          const lv = level(totals.get(dd.key) ?? 0)
          return (
            <g key={dd.key} onPointerEnter={() => setHover(dd.key)} onClick={() => setHover(dd.key)}>
              <rect x={x} y={yy} width={cell} height={cell} rx={4} fill={`var(--seq-${lv})`}
                stroke={dd.key === today ? 'var(--text)' : 'none'} strokeWidth={1.5} />
              {restDays.has(dd.key) && <text x={x + cell / 2} y={yy + cell * 0.72} textAnchor="middle" className="viz-rest">休</text>}
            </g>
          )
        })}
      </svg>
      <div className="viz-legend">
        <span>少ない</span>
        {[0, 1, 2, 3, 4].map((l) => <i key={l} style={{ background: `var(--seq-${l})` }} />)}
        <span>多い</span>
        <span style={{ marginLeft: 8 }}>「休」＝お休み券</span>
      </div>
      <p className="viz-tip" aria-live="polite">
        {hover ? `${hover.slice(5).replace('-', '/')}：${min(hover)}分${restDays.has(hover) ? '（お休み券）' : ''}` : '日付に触れると練習時間が出ます'}
      </p>
    </div>
  )
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-tile">
      <div className="muted">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="muted stat-sub">{sub}</div>}
    </div>
  )
}

/** 目盛りがきりのよい数になる最大値（1, 2, 5, 10, 20, 50…） */
export function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 5, 10]) if (v <= m * exp) return m * exp
  return 10 * exp
}
