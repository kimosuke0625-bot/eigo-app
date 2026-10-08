import { useEffect, useRef, useState } from 'react'
import { SPEECH_STATUS_EVENT, type SpeechStatus } from './voices'

/**
 * 端末の声で読み上げたときの小さなお知らせ（どの画面でも共通）。
 * - 鳴らせなかったときは、黙ったままにせず理由を出す
 */
export function SpeechNotice() {
  const [notice, setNotice] = useState<{ kind: 'fail'; text: string } | null>(null)
  const timer = useRef(0)
  useEffect(() => {
    const show = (kind: 'fail', text: string, ms: number) => {
      window.clearTimeout(timer.current)
      setNotice({ kind, text })
      timer.current = window.setTimeout(() => setNotice(null), ms)
    }
    const on = (e: Event) => {
      const s = (e as CustomEvent<SpeechStatus>).detail
      if (s.state === 'fail') show('fail', s.reason ?? '読み上げられませんでした。', 7000)
      // 読み上げが始まったら、前の失敗のお知らせは消す（読み上げ中の案内は出さない：消音でも聞こえると利用者が確認 2026-10-08）
      else if (s.state === 'start') { window.clearTimeout(timer.current); setNotice(null) }
    }
    window.addEventListener(SPEECH_STATUS_EVENT, on)
    return () => { window.removeEventListener(SPEECH_STATUS_EVENT, on); window.clearTimeout(timer.current) }
  }, [])
  if (!notice) return null
  return (
    <div className={`toast speech-notice ${notice.kind}`} role={notice.kind === 'fail' ? 'alert' : 'status'}>
      <span>{notice.kind === 'fail' ? '🔇 ' : '🔈 '}{notice.text}</span>
      <button className="icon-btn" aria-label="閉じる" onClick={() => setNotice(null)}>✕</button>
    </div>
  )
}
