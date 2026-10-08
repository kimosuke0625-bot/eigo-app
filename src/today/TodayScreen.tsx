import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Settings } from '../db/schema'
import { BLOCK_LABELS, PILLAR_LABELS, currentBlock, dayKey, planMenu, type PracticeKind } from './menu'
import { DEV_PHASE } from './devPhase'
import { needsBackupReminder } from '../settings/backupReminder'
import { updateSettings } from '../db/settings'
import { loadStreak } from '../habit/streak'
import { assessmentDue } from '../assessment/periodic'
import { FactQuizCard } from '../rewards/FactQuizCard'
import { LevelBar } from '../rewards/XpParts'
import { TITLES } from '../rewards/titles'
import { PixelIcon } from '../ui/PixelIcon'
import type { Deck } from '../srs/deck'
import { BossNotice, ComebackBanner, QuestBoard, TeaserCard, VersusWindow } from './JourneyParts'
import { mapPosition, TOWNS, useVocab } from '../progress/TravelMap'

/**
 * 今日の画面（フェーズ6.5：冒険の旅の拠点）。
 * 旅人のステータス（レベル・経験値・連続日数・持ち物）、今日の旅程、依頼の掲示板（今日のメニュー）。
 */
export function TodayScreen({ settings, dueCount, onSettings, onStart, onDiagnostic, onMap }: {
  settings: Settings
  dueCount: Record<Deck, number>
  onSettings: () => void
  onStart: (k: PracticeKind) => void
  onDiagnostic: () => void
  onMap: () => void
}) {
  const vocab = useVocab()
  const today = dayKey()
  const lastAssess = useLiveQuery(async () => (await db.assessments.where('kind').equals('periodic').sortBy('at')).at(-1)?.at ?? 0, [], -1)
  const assessDue = lastAssess !== -1 && assessmentDue(lastAssess || undefined, settings.diagnosedAt > 0 ? settings.diagnosedAt : settings.createdAt)
  const doneByKind = useLiveQuery(
    async () => {
      const out: Partial<Record<string, number>> = {}
      for (const s of await db.sessions.where('day').equals(today).toArray()) out[s.kind] = (out[s.kind] ?? 0) + s.seconds
      return out
    },
    [today],
    {} as Partial<Record<string, number>>,
  )
  // 練習の記録が変わるたびに連続日数を計算し直す
  const streak = useLiveQuery(() => loadStreak(), [])
  // 持ち物：まだ開けていない雑学パック
  const packCount = useLiveQuery(() => db.packs.where('opened').equals(0).count(), [], 0)
  // いちばん新しい称号
  const title = useLiveQuery(async () => {
    const got = (await db.rewards.where('kind').equals('title').toArray()).sort((a, b) => b.acquiredAt - a.acquiredAt)[0]
    return got ? TITLES.find((t) => t.key === got.key)?.name ?? '' : ''
  }, [], '')
  const todayXp = useLiveQuery(async () => (await db.xpDays.get(today))?.xp ?? 0, [today], 0)
  const menu = planMenu(settings.targetMinutes, settings.blockOrder)
  const doneSeconds = Object.values(doneByKind).reduce<number>((s, x) => s + (x ?? 0), 0)
  const doneMin = Math.floor(doneSeconds / 60)
  const remaining = Math.max(0, settings.targetMinutes - doneMin)
  const pct = Math.min(100, (doneMin / settings.targetMinutes) * 100)
  const nowBlock = currentBlock(new Date(), settings.morningEnd, settings.noonEnd)
  const ready = (k: PracticeKind) => (menu.find((m) => m.kind === k)?.availableFrom ?? 99) <= DEV_PHASE
  // いまのブロックで使える練習のうち最初のもの。なければ復習カード
  const startKind = menu.find((m) => m.block === nowBlock && ready(m.kind))?.kind ?? 'review'

  const dateLabel = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
  // 持ち物のパックを開ける（届いたお知らせをもう一度出すと、開封の画面が開く）
  const openPacks = () => db.packs.where('opened').equals(0).modify({ notified: 0 })

  const pos = vocab === undefined ? null : mapPosition(vocab)
  const nextTown = pos ? TOWNS[pos.town + 1] : undefined
  // 1日の終わり（夜のブロック、または目標時間を達成した後）に、明日の雑学を予告する
  const teaser = !!streak?.todayDone && (nowBlock === 'night' || doneMin >= settings.targetMinutes)

  return (
    <div className="today-rpg">
      <ComebackBanner settings={settings} />
      {settings.diagnosedAt <= 0 && (
        <div className="banner info">
          <strong>最初に診断テスト（約4分）</strong>を受けると、ちょうどよい難しさから旅を始められます。
          <button className="btn block" style={{ marginTop: 8 }} onClick={onDiagnostic}>診断テストを受ける</button>
        </div>
      )}
      {needsBackupReminder(settings) && (
        <div className="banner warn">
          前回のバックアップから1週間以上たちました。
          <button className="btn secondary" style={{ marginTop: 8, width: '100%' }} onClick={onSettings}>
            設定でデータを書き出す
          </button>
        </div>
      )}
      {assessDue && (
        <div className="banner info">
          <strong>4週間ごとの測定</strong>の時期です（約20分）。前回の自分と比べて、伸びを確かめましょう。
          <button className="btn block" style={{ marginTop: 8 }} onClick={() => onStart('assessment')}>測定する</button>
        </div>
      )}
      {settings.phaseNotice > 0 && (
        <div className="banner ok">
          語彙が増えたので <strong>Phase {settings.phaseNotice}</strong> に上がりました。カードの答えの形や素材が変わります。
          <button className="btn secondary block" style={{ marginTop: 8 }} onClick={() => void updateSettings({ phaseNotice: 0 })}>
            わかった
          </button>
        </div>
      )}

      <section className="card status-win">
        <h2 className="win-title">旅人のステータス</h2>
        <div className="hero">
          <PixelIcon name="hero" size={48} className="hero-icon" />
          <div>
            <div className="hero-name">旅人 <span className="muted">Phase {settings.phase} の旅路</span></div>
            <div className="hero-title">{title ? `称号：${title}` : '称号：まだなし'}</div>
            <div className="muted">{dateLabel}・今日 <span className="num">+{todayXp}</span> XP</div>
          </div>
        </div>
        <LevelBar total={settings.xpTotal} />
        {pos && (
          <button className="map-line" onClick={onMap}>
            <PixelIcon name={TOWNS[pos.town].icon} size={18} />
            <span>いまの町：<strong>{TOWNS[pos.town].name}</strong>{nextTown && <>・次の「{nextTown.name}」まで あと <span className="num">{(nextTown.at - vocab!).toLocaleString()}</span> 語</>}</span>
            <span className="min">地図 ▶</span>
          </button>
        )}
        <div className="stat-chips">
          <div className="stat-chip">
            <PixelIcon name="flame" size={20} />
            <strong>{streak?.current ?? 0}</strong>
            連続日数{streak?.todayDone ? ' ✓' : ''}
          </div>
          <div className="stat-chip">
            <PixelIcon name="ticket" size={20} />
            <strong>{streak?.ticketLeft ? 1 : 0}</strong>
            今週のお休み券
          </div>
          {packCount > 0 ? (
            <button className="stat-chip has" onClick={() => void openPacks()}>
              <PixelIcon name="pack" size={20} />
              <strong>{packCount}</strong>
              パックをあける
            </button>
          ) : (
            <div className="stat-chip">
              <PixelIcon name="pack" size={20} />
              <strong>0</strong>
              雑学パック
            </div>
          )}
        </div>
      </section>

      <section className="card stack">
        <h2 className="win-title">今日の旅程</h2>
        {settings.cue && <p className="cue">{settings.cue}</p>}
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <strong>のこり <span className="num">{remaining}</span> 分</strong>
            <span className="muted"><span className="num">{doneMin} / {settings.targetMinutes}</span> 分</span>
          </div>
          <div className="road" role="progressbar" aria-label="今日の練習時間" aria-valuemin={0} aria-valuemax={settings.targetMinutes} aria-valuenow={doneMin}>
            <div style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button className="btn block start" onClick={() => onStart(startKind)}>
          ▶ {BLOCK_LABELS[nowBlock]}の依頼に出発する
        </button>
        {streak && !streak.todayDone ? (
          <button className="btn secondary block" onClick={() => onStart('review')}>
            今日は5分だけ（単語の復習で最低ライン）
          </button>
        ) : (
          <p className="muted">✓ 今日の最低ライン（5分）は達成済み。</p>
        )}
        <p className="muted">
          練習を1つやり遂げる（2分以上）たびに雑学パックが届きます。5分練習すればその日は「継続」。
          週に1回はお休み券で、休んでも連続日数が途切れません。休んでもレベルや持ち物は減りません。
        </p>
      </section>

      <QuestBoard onStart={onStart} />
      <BossNotice onStart={onStart} />
      <VersusWindow settings={settings} />
      <TeaserCard settings={settings} show={teaser} />
      <FactQuizCard settings={settings} />

      <h2 className="quest-board-title"><PixelIcon name="scroll" size={22} /> 依頼の掲示板</h2>
      {settings.blockOrder.map((block) => {
        const items = menu.filter((m) => m.block === block)
        const total = items.reduce((s, m) => s + m.minutes, 0)
        return (
          <section key={block}>
            <h3 className="block-title">
              {BLOCK_LABELS[block]}の依頼（{total}分）{block === nowBlock && <span className="now-mark"> ◀ いま</span>}
            </h3>
            {items.map((m) => {
              const doneM = Math.floor((doneByKind[m.kind] ?? 0) / 60)
              const cleared = doneM >= m.minutes
              return (
                <button className={`menu-item as-button${cleared ? ' cleared' : ''}`} key={m.kind} disabled={!ready(m.kind)} onClick={() => onStart(m.kind)}>
                  <PixelIcon name={m.kind === 'review' ? 'sword' : m.kind === 'exprReview' ? 'book' : 'scroll'} size={28} className="quest-icon" />
                  <div className="body">
                    <div className="name">
                      {m.label}
                      {m.kind === 'review' && dueCount.word > 0 && <span className="badge">{dueCount.word}</span>}
                      {m.kind === 'exprReview' && dueCount.expr > 0 && <span className="badge">{dueCount.expr}</span>}
                      {m.kind === 'grammar' && dueCount.gram > 0 && <span className="badge">{dueCount.gram}</span>}
                    </div>
                    <div className="muted">{m.kind === 'review' ? `単語の魔物と戦う。のこり ${dueCount.word} 枚`
                      : m.kind === 'exprReview' ? `表現の稽古。のこり ${dueCount.expr} 枚。${m.detail}`
                      : m.kind === 'grammar' && dueCount.gram > 0 ? `復習 ${dueCount.gram} 問。${m.detail}` : m.detail}</div>
                    <div style={{ marginTop: 4 }}>
                      <span className="tag">{PILLAR_LABELS[m.pillar]}</span>
                      {!ready(m.kind) && <span className="tag soon">準備中</span>}
                      {doneM > 0 && <span className="tag done">{cleared ? '達成' : `${doneM}分 済み`}</span>}
                    </div>
                  </div>
                  <div className="min">{m.minutes}分</div>
                </button>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
