import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { clearMyAudio, importMyAudio } from '../speech/myAudio'

/**
 * 自分の音声（旅の手帳）：旅の手帳の表現を PC の高品質な声で作ったファイルを読み込む（フェーズ7.5）。
 * 学習データから作るので、公開の音声置き場は使わず、バックアップのファイルを経由して PC で作る。
 */
export function MyAudioSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const count = useLiveQuery(() => db.myAudio.count(), [], 0)
  const phrases = useLiveQuery(() => db.phrases.count(), [], 0)
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => { if (!confirm) return; const t = window.setTimeout(() => setConfirm(false), 6000); return () => window.clearTimeout(t) }, [confirm])

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const n = await importMyAudio(await f.text())
      setMessage({ kind: 'ok', text: `${n} 個の音声を読み込みました。旅の手帳や表現の復習で、PC の声で鳴ります。` })
    } catch (err) {
      setMessage({ kind: 'warn', text: (err as Error).message })
    }
  }

  return (
    <section className="card stack">
      <h2>自分の音声（旅の手帳）</h2>
      <p>旅の手帳の表現と例文を、PC の高品質な声で読めるようにします。いま <strong className="num">{count}</strong> 個の英文に音声があります（旅の手帳の表現 {phrases} 個）。</p>
      <ol className="steps">
        <li>この画面の下の「データを書き出す」で、バックアップを保存する。</li>
        <li>そのファイル（eigo-backup-….json）を PC のダウンロードフォルダに移す。</li>
        <li>PC で <code>scripts\run-my-audio.cmd</code> を実行する（数分かかります）。</li>
        <li>ダウンロードフォルダにできた eigo-my-audio-….json を iPhone に移し、下のボタンで読み込む。</li>
      </ol>
      <p className="muted">作った音声はこの端末と PC の中だけに置き、公開の音声置き場には置きません。音声がない表現は、これまでどおり端末の声で読みます。新しい表現を取り込んだら、同じ手順でもう一度作ると、増えた分だけ作られます。</p>
      <button className="btn secondary block" onClick={() => fileRef.current?.click()}>⬆ 自分の音声のファイルを読み込む</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onPick(e)} />
      {message && <p className={`banner ${message.kind}`}>{message.text}</p>}
      {count > 0 && (confirm
        ? <button className="btn danger block" onClick={() => { void clearMyAudio(); setConfirm(false); setMessage(null) }}>本当に消す（もう一度押す）</button>
        : <button className="link-btn" onClick={() => setConfirm(true)}>自分の音声をすべて消す</button>)}
    </section>
  )
}
