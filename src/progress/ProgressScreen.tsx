import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Settings } from '../db/schema'
import { dayKey, PILLAR_LABELS } from '../today/menu'
import { loadStreak, MIN_SECONDS } from '../habit/streak'
import { CalendarHeat, LineChart, StackedWeekBars, StatTile } from './charts'
import { fillDaily, PILLARS, weeklyMetric, weeklyPillars, weeklyRecall, writeSnapshot } from './stats'

const PILLAR_COLORS = { language: 'var(--series-1)', input: 'var(--series-2)', fluency: 'var(--series-3)', output: 'var(--series-4)' }
const pct = (v: number) => `${Math.round(v * 100)}%`
const shortWeek = (w: string) => `${Number(w.slice(5, 7))}/${Number(w.slice(8, 10))}`

/** 進捗の画面。過去の自分とだけ比べる（他人との比較や順位は置かない） */
export function ProgressScreen({ settings }: { settings: Settings }) {
  const today = dayKey()
  const [ready, setReady] = useState(false)
  useEffect(() => { void writeSnapshot().then(() => setReady(true)) }, [])

  const data = useLiveQuery(async () => {
    const [sessions, reviews, snaps, streak] = await Promise.all([
      db.sessions.toArray(), db.reviews.toArray(), db.snapshots.toArray(), loadStreak(),
    ])
    return { sessions, reviews, snaps, streak }
  }, [ready])

  if (!data) return <p className="muted">集計中…</p>
  const { sessions, reviews, snaps, streak } = data
  const pillars = weeklyPillars(sessions, today, 6)
  const recall = weeklyRecall(reviews, today, 8)
  const vocab = fillDaily(snaps, today, 90)
  const latest = vocab.at(-1)
  const weekMin = Math.round(Object.values(pillars.at(-1)!.minutes).reduce((s, m) => s + m, 0))
  const metric = (key: string) => weeklyMetric(sessions, key, today, 8).map((w) => ({ x: shortWeek(w.week), y: w.value }))
  const hasMetric = (key: string) => sessions.some((s) => typeof s.result?.[key] === 'number')

  return (
    <div>
      <div className="stat-row">
        <StatTile label="連続日数" value={`${streak.current}日`} sub={`最長 ${streak.best}日`} />
        <StatTile label="定着した語彙" value={`${latest?.mature ?? 0}語`} sub={`知っている語 ${latest?.known ?? 0}`} />
        <StatTile label="今週の学習" value={`${weekMin}分`} sub={`目標 ${settings.targetMinutes * 7}分`} />
      </div>
      <p className="muted" style={{ margin: '4px 0 12px' }}>
        {streak.ticketLeft ? '🎫 今週のお休み券：残り1枚（休んでも連続日数は途切れません）' : '🎫 今週のお休み券は使用済み'}
      </p>

      <section className="card">
        <h2>継続のカレンダー</h2>
        <p className="muted">1日5分以上練習すると「継続」です。</p>
        <CalendarHeat totals={streak.totals} restDays={streak.restDays} today={today} minSeconds={MIN_SECONDS} />
      </section>

      <section className="card">
        <h2>4つの柱のバランス（週ごと）</h2>
        <p className="muted">理想は4つがほぼ同じ長さ（言語の学習が少し多め）です。</p>
        <StackedWeekBars
          rows={pillars.map((p) => ({ week: p.week, values: p.minutes }))}
          series={PILLARS.map((k) => ({ key: k, label: PILLAR_LABELS[k], color: PILLAR_COLORS[k] }))} />
      </section>

      <section className="card">
        <h2>定着した語彙数</h2>
        <p className="muted">復習カードのうち、FSRS の安定度が21日以上になった語の数です。</p>
        <LineChart label="定着した語彙数" format={(v) => `${Math.round(v)}`}
          points={vocab.map((v) => ({ x: `${Number(v.day.slice(5, 7))}/${Number(v.day.slice(8))}`, y: v.mature }))} />
      </section>

      <section className="card">
        <h2>復習の正答率（週ごと）</h2>
        <p className="muted">85%前後がちょうどよい難しさです。新しいカードの数は自動で調整されます。</p>
        <LineChart label="正答率" yMax={1} format={pct} target={{ value: 0.85, label: '85%' }}
          points={recall.map((w) => ({ x: shortWeek(w.week), y: w.rate }))} />
      </section>

      <section className="card">
        <h2>聞き取り（ディクテーション一致率）</h2>
        {hasMetric('dictation')
          ? <LineChart label="ディクテーション一致率" yMax={1} format={pct} points={metric('dictation')} color="var(--series-2)" />
          : <p className="muted">ディクテーションをすると表示されます。</p>}
      </section>

      <section className="card">
        <h2>内容確認の正答率</h2>
        {hasMetric('comprehension')
          ? <LineChart label="内容確認の正答率" yMax={1} format={pct} points={metric('comprehension')} color="var(--series-2)" />
          : <p className="muted">多聴・多読の内容確認をすると表示されます。</p>}
      </section>

      <section className="card">
        <h2>読む速さ（1分あたりの語数）</h2>
        {hasMetric('readingWpm')
          ? <LineChart label="読む速さ" format={(v) => `${Math.round(v)}`} points={metric('readingWpm')} color="var(--series-3)" />
          : <p className="muted">速読をすると表示されます。</p>}
      </section>

      <section className="card">
        <h2>話す速さ・シャドーイング</h2>
        <p className="muted">録音の練習（開発フェーズ5）を追加すると表示されます。</p>
      </section>

      <section className="card">
        <h2>4週間ごとの測定</h2>
        <p className="muted">語彙・聞き取り・速読・スピーチ・作文の定期測定は開発フェーズ6で追加します。</p>
      </section>
    </div>
  )
}
