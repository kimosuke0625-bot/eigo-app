import { BASE_MENU, PILLAR_LABELS, type PracticeKind } from '../today/menu'
import { DEV_PHASE } from '../today/devPhase'

export function PracticeHub({ onStart, dueCount }: { onStart: (k: PracticeKind) => void; dueCount: number }) {
  return (
    <div>
      {BASE_MENU.map((m) => {
        const ready = m.availableFrom <= DEV_PHASE
        return (
          <button key={m.kind} className="menu-item as-button" disabled={!ready} onClick={() => onStart(m.kind)}>
            <div className="body">
              <div className="name">
                {m.label}
                {m.kind === 'review' && dueCount > 0 && <span className="badge">{dueCount}</span>}
              </div>
              <div className="muted">{m.detail}</div>
              <div style={{ marginTop: 4 }}>
                <span className="tag">{PILLAR_LABELS[m.pillar]}</span>
                {!ready && <span className="tag soon">開発フェーズ{m.availableFrom}で追加</span>}
              </div>
            </div>
            {ready && <span className="min">▶</span>}
          </button>
        )
      })}
    </div>
  )
}
