import { useState } from 'react'
import { CLAUDE_URL, copyText } from './claudePrompts'

/**
 * Claude に貼る依頼文をコピーするボタン。コピーしたら Claude を開くボタンを出す。
 * コピーできない端末では、依頼文をそのまま表示して長押しでコピーしてもらう。
 */
export function ClaudePromptBox({ label, prompt, note, onImport }: { label: string; prompt: string; note?: string; onImport?: () => void }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [show, setShow] = useState(false)
  return (
    <div className="claude-box">
      <button className="btn secondary block" onClick={async () => setState((await copyText(prompt)) ? 'copied' : 'failed')}>
        📋 {label}
      </button>
      {note && <p className="muted">{note}</p>}
      {state === 'copied' && (
        <p className="banner ok">
          依頼文をコピーしました。Claude を開いて、入力欄に貼り付けて送ってください。
          <a className="btn block" style={{ marginTop: 8 }} href={CLAUDE_URL} target="_blank" rel="noreferrer">Claude を開く</a>
        </p>
      )}
      {state === 'failed' && <p className="banner warn">コピーできませんでした。下の依頼文を長押しして全部選び、コピーしてください。</p>}
      <button className="link-btn" onClick={() => setShow(!show)}>{show || state === 'failed' ? '依頼文を隠す' : '依頼文を見る'}</button>
      {(show || state === 'failed') && <pre className="prompt-text">{prompt}</pre>}
      {onImport && (
        <>
          <p className="muted">Claude の返事の最後に「アプリ取り込み用のまとめ」が付きます。返事を全部コピーして、ここに戻って取り込みましょう。</p>
          <button className="btn block" onClick={onImport}>📜 Claude の返事（添削）を取り込む</button>
        </>
      )}
    </div>
  )
}
