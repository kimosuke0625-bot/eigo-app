/**
 * 練習の段階表示。いまどの段階かと、その段階でやることを一言で示す。
 * 例：1 問いを見る → 2 聞く → 3 読む → 4 答える
 */
export function Steps({ steps, current, guide }: { steps: string[]; current: number; guide?: string }) {
  return (
    <div className="steps-bar">
      {steps.length > 0 && <ol className="steps-list" aria-label="練習の進み具合">
        {steps.map((s, i) => (
          <li key={s} className={i < current ? 'done' : i === current ? 'now' : ''} aria-current={i === current ? 'step' : undefined}>
            <span className="num">{i < current ? '✓' : i + 1}</span>
            <span className="label">{s}</span>
          </li>
        ))}
      </ol>}
      {guide && <p className="steps-guide">{guide}</p>}
    </div>
  )
}
