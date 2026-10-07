import { useEffect, useRef, useState } from 'react'
import { db, type Pack, type Settings } from '../db/schema'
import { BASE_MENU } from '../today/menu'
import { FactCard } from './FactCard'
import type { FactsData } from './facts'
import { NEW_FACTS_PER_DAY, openPack, RARITY, type PackResult } from './packs'
import { playPackGlow, playPackOpen } from './sound'
import { Sparks } from './XpParts'

const SOURCE_LABELS: Record<string, string> = {
  ...Object.fromEntries(BASE_MENU.map((m) => [m.kind, m.label])),
  dictation: 'ディクテーション',
  speech: '4/3/2スピーチ',
  conversation: '会話の練習',
  roleplay: '対話の役割練習',
  assessment: '4週間ごとの測定',
  fluency: '4/3/2スピーチ・速読',
}

/** 光ってから開くまでの時間（演出の量ごと）。動きを減らす設定では短くする */
const CHARGE_MS = { low: 350, medium: 900, high: 1100 }

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** 雑学パックの絵（SVG）。色は CSS の変数で変える */
function PackArt() {
  return (
    <svg className="pack-art" viewBox="0 0 120 160" aria-hidden>
      <defs>
        <linearGradient id="pack-foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--pack-a)" />
          <stop offset="0.5" stopColor="var(--pack-b)" />
          <stop offset="1" stopColor="var(--pack-a)" />
        </linearGradient>
      </defs>
      <path d="M10 14 L20 6 L30 14 L40 6 L50 14 L60 6 L70 14 L80 6 L90 14 L100 6 L110 14 L110 146 L100 154 L90 146 L80 154 L70 146 L60 154 L50 146 L40 154 L30 146 L20 154 L10 146 Z"
        fill="url(#pack-foil)" stroke="var(--px-ink)" strokeWidth="3" strokeLinejoin="round" />
      <rect x="10" y="22" width="100" height="6" fill="var(--px-ink)" opacity="0.35" />
      <rect x="10" y="132" width="100" height="6" fill="var(--px-ink)" opacity="0.35" />
      <circle cx="60" cy="78" r="30" fill="var(--pack-b)" stroke="var(--px-ink)" strokeWidth="3" />
      <path d="M60 56 L66 72 L83 72 L69 82 L74 98 L60 88 L46 98 L51 82 L37 72 L54 72 Z" fill="#ffd23f" stroke="var(--px-ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M22 40 L34 34" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

/**
 * 雑学パックの開封（フェーズ6.5）。
 * タップすると光り、光り方と音でレア度を予告してから開く。届いた雑学は図鑑に入る。
 */
export function PackOpening({ packs, data, settings, reviewedWords, onClose }: {
  packs: Pack[]
  data: FactsData
  settings: Settings
  reviewedWords: () => Promise<Set<string>>
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  const [stage, setStage] = useState<'sealed' | 'charging' | 'open'>('sealed')
  const [result, setResult] = useState<PackResult | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const pack = packs[index]
  if (!pack) return null
  const left = packs.length - index - 1
  const sourceLabel = pack.source === 'daily' ? '今日の最低ライン（5分）' : SOURCE_LABELS[pack.source] ?? '練習'

  const open = async () => {
    if (stage !== 'sealed') return
    setStage('charging')
    const r = await openPack(pack, {
      facts: data.facts, reviewedWords: await reviewedWords(),
      liked: new Set(settings.likedCategories), phase: settings.phase,
    })
    setResult(r)
    playPackGlow(r.rarity)
    const ms = reducedMotion() ? 300 : CHARGE_MS[settings.effects] + r.rarity * (settings.effects === 'low' ? 0 : 150)
    timer.current = window.setTimeout(() => { setStage('open'); playPackOpen(r.rarity) }, ms)
  }

  // 「あとで」：まだ開けていないパックは持ち物に残す（今日の画面から開けられる）
  const later = async () => {
    await db.packs.bulkUpdate(packs.slice(index).map((p) => ({ key: p.id!, changes: { notified: 1 as const } })))
    onClose()
  }

  const next = () => { setIndex(index + 1); setStage('sealed'); setResult(null) }

  const glow = result ? RARITY[result.rarity].glow : ''
  return (
    <div className="modal-back rpg-modal" role="dialog" aria-modal="true" aria-label="雑学パック">
      <div className="modal win pack-modal" data-fx={settings.effects}>
        {stage !== 'open' && (
          <>
            <p className="win-title">雑学パック</p>
            {pack.xp > 0
              ? <p className="pack-lead">依頼達成！ <strong>{sourceLabel}</strong> をやり遂げた <span className="xp-chip">+{pack.xp} XP</span></p>
              : <p className="pack-lead"><strong>{sourceLabel}</strong> を達成！ 今日の継続が決まりました。</p>}
            <button className={`pack-btn ${stage} ${glow ? `glow-${glow}` : ''}`} onClick={() => void open()} disabled={stage !== 'sealed'}
              aria-label="パックをあける">
              <PackArt />
              {stage === 'charging' && <span className="pack-rays" aria-hidden />}
            </button>
            <p className="center muted">{stage === 'sealed' ? 'タップしてあける。中身は開けるまで分かりません。' : '……！'}</p>
            {stage === 'sealed' && (
              <button className="btn secondary block" onClick={() => void later()}>あとで（持ち物に入れておく）</button>
            )}
          </>
        )}
        {stage === 'open' && result && (
          <>
            <p className="win-title">{result.revisit ? 'おさらい' : '発見！'}</p>
            <div className={`pack-reveal glow-${glow}`}>
              <Sparks seed={pack.id ?? 1} level={settings.effects} strength={result.rarity + 1} />
              <p className="rarity-label">
                {result.revisit ? 'おさらいの雑学' : result.rarity === 3 ? '★★★ レア雑学！' : result.rarity === 2 ? '★★ 連続ものの雑学' : '★ 新しい雑学'}
                <span className="xp-chip">+{result.xp} XP</span>
              </p>
            </div>
            {result.revisit && <p className="muted">今日の新しい雑学は {NEW_FACTS_PER_DAY} 個まで。前に集めた雑学をもう一度読みましょう。</p>}
            {result.fact
              ? <FactCard fact={result.fact} data={data} settings={settings} autoSpeak />
              : <p>まだ集めた雑学がありません。</p>}
            {left > 0
              ? <button className="btn block" style={{ marginTop: 12 }} onClick={next}>次のパックをあける（のこり {left}）</button>
              : <button className="btn block" style={{ marginTop: 12 }} onClick={onClose}>{result.revisit ? '閉じる' : '図鑑に入れる'}</button>}
            {left > 0 && <button className="btn secondary block" style={{ marginTop: 8 }} onClick={() => void later()}>のこりはあとで</button>}
          </>
        )}
      </div>
    </div>
  )
}
