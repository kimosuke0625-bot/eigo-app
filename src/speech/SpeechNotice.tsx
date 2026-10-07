import { useEffect, useRef, useState } from 'react'
import { isAppleMobile, SPEECH_STATUS_EVENT, type SpeechStatus } from './voices'

/**
 * 端末の声で読み上げたときの小さなお知らせ（どの画面でも共通）。
 * - 鳴らせなかったときは、黙ったままにせず理由を出す
 * - iPhone では、読み上げ中に「端末の声で読んでいる」ことと、消音スイッチで聞こえない場合があることを出す
 *   （消音で聞こえないことはアプリからは分からないため）
 */
export function SpeechNotice() {
  const [notice, setNotice] = useState<{ kind: 'info' | 'fail'; text: string } | null>(null)
  const timer = useRef(0)
  useEffect(() => {
    const show = (kind: 'info' | 'fail', text: string, ms: number) => {
      window.clearTimeout(timer.current)
      setNotice({ kind, text })
      timer.current = window.setTimeout(() => setNotice(null), ms)
    }
    const on = (e: Event) => {
      const s = (e as CustomEvent<SpeechStatus>).detail
      if (s.state === 'fail') show('fail', s.reason ?? '読み上げられませんでした。', 7000)
      else if (s.state === 'start' && isAppleMobile()) show('info', '端末の声で読んでいます。聞こえないときは、iPhone の消音（マナーモード）を切って、音量を上げてください。', 4000)
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
