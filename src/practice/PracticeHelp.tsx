import { useEffect, useState } from 'react'
import type { Settings } from '../db/schema'
import { updateSettings } from '../db/settings'
import { HELP, type HelpKey } from './help'

/** 「この練習について」の説明。目的・やり方・意識すること・よくある間違い */
export function HelpModal({ k, onClose }: { k: HelpKey; onClose: () => void }) {
  const h = HELP[k]
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label={`この練習について：${h.title}`} onClick={onClose}>
      <div className="modal help" onClick={(e) => e.stopPropagation()}>
        <p className="modal-kicker">この練習について：{h.title}</p>
        <h3>🎯 目的</h3>
        <p>{h.purpose}</p>
        <h3>📝 やり方</h3>
        <ol>{h.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <h3>💡 意識すること</h3>
        <ul>{h.focus.map((s) => <li key={s}>{s}</li>)}</ul>
        <h3>⚠️ よくある間違い</h3>
        <ul>{h.mistakes.map((s) => <li key={s}>{s}</li>)}</ul>
        <button className="btn block" style={{ marginTop: 12 }} onClick={onClose}>わかった、始める</button>
      </div>
    </div>
  )
}

/**
 * 練習画面の上に置く「？」ボタン。その練習を初めて開いたときは自動で説明を出し、
 * 見たことを設定に記録する（2回目以降は「？」から見られる）。
 */
export function HelpButton({ k, settings }: { k: HelpKey; settings: Settings }) {
  const seen = settings.helpSeen.includes(k)
  const [open, setOpen] = useState(!seen)
  useEffect(() => {
    if (!seen) void updateSettings({ helpSeen: [...settings.helpSeen, k] })
    // 初回の表示は開いた時点の状態で決める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <>
      <button className="help-btn" aria-label="この練習について" onClick={() => setOpen(true)}>？ この練習について</button>
      {open && <HelpModal k={k} onClose={() => setOpen(false)} />}
    </>
  )
}
