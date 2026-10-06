import { useEffect, useState } from 'react'
import { isHighQualityVoice, speak, speechSupported, voiceScore } from '../speech/voices'

/**
 * 端末からアプリに見えている声の一覧（名前・識別子・言語）。
 * iPhone の Safari は追加した声を見せないことがあるため、実際に何が見えているかを確かめるために使う。
 */
export function VoiceDiagnostics() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [englishOnly, setEnglishOnly] = useState(true)
  const [copied, setCopied] = useState('')
  useEffect(() => {
    if (!speechSupported()) return
    const load = () => setVoices(speechSynthesis.getVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  const shown = voices
    .filter((v) => !englishOnly || v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name))
  const text = [
    `端末：${navigator.userAgent}`,
    `声の数：全部 ${voices.length}、英語 ${voices.filter((v) => v.lang.toLowerCase().startsWith('en')).length}`,
    ...shown.map((v) => `${v.name}\t${v.voiceURI}\t${v.lang}\t${v.localService ? '端末内' : 'ネット'}${v.default ? '\t標準' : ''}${isHighQualityVoice(v) ? '\t高品質と判定' : ''}`),
  ].join('\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied('コピーしました。メッセージに貼り付けて送ってください。')
    } catch {
      setCopied('コピーできませんでした。下の一覧を長押しして選び、コピーしてください。')
    }
  }

  if (!speechSupported()) return <p className="muted">このブラウザは読み上げに対応していません。</p>
  return (
    <details>
      <summary>端末から見えている声の一覧（{voices.length}件）</summary>
      <div className="stack" style={{ marginTop: 8 }}>
        <label className="row">
          <input type="checkbox" checked={englishOnly} onChange={(e) => setEnglishOnly(e.target.checked)} />
          英語の声だけ表示
        </label>
        <button className="btn secondary block" onClick={() => void copy()}>📋 一覧をコピーする</button>
        {copied && <p className="muted">{copied}</p>}
        {!shown.length && <p className="muted">声が1つも見えていません（アプリを開き直すと見えることがあります）。</p>}
        <ul className="voice-list">
          {shown.map((v) => (
            <li key={v.voiceURI}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{v.name}</strong>
                {isHighQualityVoice(v) && <span className="tag fit-just">高品質</span>}
                {v.default && <span className="tag">標準</span>}
                <div className="muted voice-id">{v.voiceURI}・{v.lang}・{v.localService ? '端末内' : 'ネット'}</div>
              </div>
              <button className="icon-btn" aria-label={`${v.name}で試聴`} onClick={() => speak('This is a test of my voice.', v.voiceURI)}>▶</button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
