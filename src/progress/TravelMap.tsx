import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Settings } from '../db/schema'
import { PixelIcon } from '../ui/PixelIcon'

/**
 * 旅の地図（フェーズ6.5）。SPEC の「2年間の道筋」と Phase に合わせた町を、語彙（知っている語＋定着した語）で進む。
 * 町で解放されるのは、Phase が上がると変わる練習（会話練習の場面、日記のテーマ、カードの形）。
 * Phase の切り替えの目安：1,000語 → Phase 2、2,000語 → Phase 3、2,700語 → Phase 4（PLAN の決定事項）。
 */
export interface Town {
  name: string
  /** 着く語彙の数 */
  at: number
  /** SPEC の道筋での目安の時期 */
  when: string
  /** この町に着くと上がる Phase */
  phase?: 2 | 3 | 4
  unlock: string
  icon: 'house' | 'castle' | 'flag'
}

export const TOWNS: Town[] = [
  { name: '始まりの村', at: 0, when: '出発', icon: 'house', unlock: '復習カード、発音・聞き分け、シャドーイング、多聴・多読' },
  { name: 'ことばの森', at: 500, when: '3か月ごろ', icon: 'house', unlock: '基本語を固める道。ゆっくりの音声が聞き取れてくる' },
  { name: '聞き耳の港', at: 1000, when: '6か月ごろ', phase: 2, icon: 'castle', unlock: 'Phase 2：例文が2〜3つに。会話練習に「電話・会議・日程調整」、日記に「問題と対処・意見」のテーマ' },
  { name: '語り部の丘', at: 1500, when: '9か月ごろ', icon: 'house', unlock: '多聴・音声日記・4/3/2スピーチで、仕事の説明に挑む' },
  { name: '商人の都', at: 2000, when: '12か月ごろ', phase: 3, icon: 'castle', unlock: 'Phase 3：カードがやさしい英語の定義に。会話練習に「苦情対応・交渉・質疑応答・面接」' },
  { name: '会議の城', at: 2700, when: '15か月ごろ', phase: 4, icon: 'castle', unlock: 'Phase 4：カードが英英のみに。自分で取り込んだ生の素材へ' },
  { name: '交渉の峠', at: 3500, when: '18か月ごろ', icon: 'house', unlock: 'ビジネス語彙を深め、会議や電話の定型表現を身につける' },
  { name: '世界の舞台', at: 4500, when: '24か月', icon: 'flag', unlock: '旅のゴール：初見の話題で意見を述べ、質問に答える' },
]

/** 地図の上の町の位置（SVG の座標）。道は左右に曲がりながら上へ進む */
const POS = [
  { x: 60, y: 430 }, { x: 250, y: 395 }, { x: 90, y: 330 }, { x: 260, y: 280 },
  { x: 80, y: 215 }, { x: 250, y: 160 }, { x: 90, y: 100 }, { x: 240, y: 40 },
]

/** いまの語彙での位置：いる町の番号と、次の町までの進み具合（0〜1） */
export function mapPosition(vocab: number): { town: number; frac: number } {
  let town = 0
  TOWNS.forEach((t, i) => { if (vocab >= t.at) town = i })
  const next = TOWNS[town + 1]
  if (!next) return { town, frac: 0 }
  return { town, frac: Math.min(1, (vocab - TOWNS[town].at) / (next.at - TOWNS[town].at)) }
}

/** 語彙（知っている語＋定着した語）。毎日の記録の最新から */
export function useVocab(): number | undefined {
  return useLiveQuery(async () => {
    const last = await db.snapshots.orderBy('day').last()
    return last ? last.known + last.mature : 0
  }, [])
}

export function TravelMap({ settings }: { settings: Settings }) {
  const vocab = useVocab()
  if (vocab === undefined) return null
  const { town, frac } = mapPosition(vocab)
  const a = POS[town]
  const b = POS[town + 1] ?? a
  const hero = { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac }
  const next = TOWNS[town + 1]
  const path = POS.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')
  const walked = [...POS.slice(0, town + 1), hero].map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')

  return (
    <section className="card travel-map">
      <h2 className="win-title">旅の地図</h2>
      <p>
        語彙 <strong className="num">{vocab.toLocaleString()}</strong> 語（知っている語＋定着した語）。
        {next ? <>次の町「{next.name}」まで あと <strong className="num">{(next.at - vocab).toLocaleString()}</strong> 語。</> : '旅のゴールに着きました！'}
      </p>
      <div className="map-wrap">
        <svg viewBox="0 0 340 470" className="map-svg" role="img" aria-label={`旅の地図。いまは${TOWNS[town].name}${next ? `から${next.name}へ向かう途中` : ''}`}>
          <rect x="4" y="4" width="332" height="462" rx="10" className="map-ground" />
          {/* 山と森の飾り */}
          {[[180, 450], [300, 340], [30, 260], [180, 230], [300, 120], [30, 150], [170, 80]].map(([x, y], i) => (
            <path key={i} d={`M${x - 12} ${y} L${x} ${y - 16} L${x + 12} ${y} Z`} className={i % 2 ? 'map-tree' : 'map-hill'} />
          ))}
          <path d={path} className="map-road" />
          <path d={walked} className="map-road walked" />
          {TOWNS.map((t, i) => {
            const p = POS[i]
            const reached = i <= town
            const left = p.x > 170
            return (
              <g key={t.name} className={reached ? 'town reached' : 'town'}>
                <circle cx={p.x} cy={p.y} r="15" className="town-base" />
                <g transform={`translate(${p.x - 11} ${p.y - 11})`}><PixelIcon name={t.icon} size={22} /></g>
                <text x={left ? p.x - 22 : p.x + 22} y={p.y - 2} textAnchor={left ? 'end' : 'start'} className="town-name">{t.name}</text>
                <text x={left ? p.x - 22 : p.x + 22} y={p.y + 13} textAnchor={left ? 'end' : 'start'} className="town-sub">
                  {t.at.toLocaleString()}語{t.phase ? `・Phase ${t.phase}` : ''}
                </text>
              </g>
            )
          })}
          <g transform={`translate(${hero.x - 14} ${hero.y - 30})`} className="map-hero"><PixelIcon name="hero" size={28} /></g>
        </svg>
      </div>
      <ul className="town-list">
        {TOWNS.map((t, i) => {
          const unlocked = t.phase ? settings.phase >= t.phase : i <= town
          return (
            <li key={t.name} className={i <= town ? 'reached' : ''}>
              <strong>{i <= town ? '✓ ' : ''}{t.name}</strong> <span className="muted">（{t.at.toLocaleString()}語・{t.when}）</span>
              <p className="muted">{t.unlock}{t.phase && !unlocked && i <= town ? '（Phase の切り替えは4週間ごとの測定の結果も見て決まります）' : ''}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
