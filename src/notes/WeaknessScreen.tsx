import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Fix } from '../db/schema'
import { dayKey } from '../today/menu'
import { PixelIcon } from '../ui/PixelIcon'
import { ASR_TYPE } from './errorTypes'
import { countTypes } from './store'
import { SpeakButton } from '../practice/WordParts'

/** 先週と比べた増減の言葉（減るのがよいことだが、増えても責めない） */
function trend(thisWeek: number, lastWeek: number): string {
  if (!thisWeek && !lastWeek) return '今週・先週ともになし'
  if (thisWeek === lastWeek) return `今週 ${thisWeek}・先週 ${lastWeek}（同じ）`
  return thisWeek < lastWeek
    ? `今週 ${thisWeek}・先週 ${lastWeek}（${lastWeek - thisWeek} 減った）`
    : `今週 ${thisWeek}・先週 ${lastWeek}（${thisWeek - lastWeek} 増えた）`
}

/** 弱点の研究（苦手ノート）：間違いを種類ごとに数え、多い順に並べる。週ごとの増減も見せる */
export function WeaknessScreen({ voiceURI, onRetell, onImport }: { voiceURI: string; onRetell: () => void; onImport: () => void }) {
  const fixes = useLiveQuery(() => db.fixes.toArray(), [], [] as Fix[])
  const [open, setOpen] = useState<string | null>(null)
  const counts = countTypes(fixes, dayKey())
  const max = Math.max(1, ...counts.map((c) => c.total))
  const asr = fixes.filter((f) => f.type === ASR_TYPE).length

  return (
    <div className="notes">
      <section className="card stack">
        <h2 className="win-title">弱点の研究</h2>
        <p>添削で直された間違いを、種類ごとに数えた研究の記録です。多い種類の上位3つは、次に Claude へ頼むときの依頼文に「重点的に見てほしい点」として自動で入ります。</p>
        {counts.length > 0 && <button className="btn block" onClick={onRetell}>⚔ 過去の自分の文を言い直す</button>}
      </section>
      {!counts.length && (
        <section className="card stack">
          <p>まだ記録がありません。添削を取り込むと、間違いの種類がここに集まります。</p>
          <button className="btn block" onClick={onImport}>添削を取り込む</button>
        </section>
      )}
      {counts.length > 0 && (
        <section className="card">
          <h2 className="win-title">間違いの種類（多い順）</h2>
          <ul className="weak-list">
            {counts.map((c, i) => (
              <li key={c.type}>
                <button className="weak-row" aria-expanded={open === c.type} onClick={() => setOpen(open === c.type ? null : c.type)}>
                  <span className="weak-rank num">{i + 1}</span>
                  <span className="weak-name">{c.type}{i < 3 && <span className="tag focus-tag">重点</span>}</span>
                  <span className="weak-count num">{c.total}</span>
                  <span className="weak-bar" aria-hidden><span style={{ width: `${(c.total / max) * 100}%` }} /></span>
                  <span className="weak-trend muted">{trend(c.thisWeek, c.lastWeek)}</span>
                </button>
                {open === c.type && (
                  <ul className="fix-list">
                    {fixes.filter((f) => f.type === c.type).sort((a, b) => b.at - a.at).map((f) => <FixLine key={f.id} fix={f} voiceURI={voiceURI} />)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {asr > 0 && <p className="muted" style={{ marginTop: 8 }}>聞き取りの誤り（音声認識の誤り）{asr}件は、自分の間違いではないので数えていません。</p>}
        </section>
      )}
      {counts.length > 0 && (
        <p className="muted"><PixelIcon name="star" size={14} /> 数が多いのは、それだけたくさん書いて話したしるしです。減らすことより、気づいて言い直すことを大事にしましょう。</p>
      )}
    </div>
  )
}

export function FixLine({ fix, voiceURI }: { fix: Fix; voiceURI: string }) {
  return (
    <li className="fix-line">
      <p className="fix-before"><span className="fix-label">元</span>{fix.original}</p>
      <div className="row fix-after-row">
        <p className="fix-after"><span className="fix-label">直</span>{fix.corrected}</p>
        {fix.corrected && <SpeakButton text={fix.corrected} voiceURI={voiceURI} label="直した文を読み上げ" />}
      </div>
      {fix.note && <p className="muted">{fix.note}</p>}
      <p className="muted fix-meta">{fix.day.replace(/-/g, '/')}・{fix.type}{fix.practiced > 0 && `・言い直し ${fix.practiced}回`}</p>
    </li>
  )
}
