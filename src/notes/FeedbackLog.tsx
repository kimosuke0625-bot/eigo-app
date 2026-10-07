import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Feedback, type Fix, type JournalEntry, type Phrase, type Recording } from '../db/schema'
import { PlayBlobButton } from '../practice/SpeakParts'
import { FixLine } from './WeaknessScreen'
import { deleteFeedback, SOURCE_LABELS } from './store'
import { SpeakButton } from '../practice/WordParts'

/** 添削の記録：取り込んだ添削を、元の作文・録音と並べて見返す */
export function FeedbackLog({ voiceURI, onImport }: { voiceURI: string; onImport: () => void }) {
  const list = useLiveQuery(() => db.feedback.orderBy('at').reverse().toArray(), [], [] as Feedback[])
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="notes">
      <section className="card stack">
        <h2 className="win-title">添削の記録</h2>
        <p>Claude から届いた添削（師匠の手紙）の記録です。元の作文や録音と並べて見返せます。</p>
        <button className="btn block" onClick={onImport}>添削を取り込む</button>
      </section>
      {!list.length && <p className="muted">まだ記録がありません。</p>}
      {list.map((f) => (
        <section key={f.id} className="card stack">
          <button className="log-head" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id!)}>
            <span className="num">{f.day.replace(/-/g, '/')}</span>
            <span>{SOURCE_LABELS[f.source]}{f.ref ? `（${f.ref}）` : ''}</span>
            <span className="muted">{open === f.id ? '▲ 閉じる' : '▼ 見る'}</span>
          </button>
          {open === f.id && <LogDetail feedback={f} voiceURI={voiceURI} onDeleted={() => setOpen(null)} />}
        </section>
      ))}
    </div>
  )
}

function LogDetail({ feedback, voiceURI, onDeleted }: { feedback: Feedback; voiceURI: string; onDeleted: () => void }) {
  const data = useLiveQuery(async () => ({
    journal: feedback.journalId ? await db.journal.get(feedback.journalId) : undefined,
    recording: feedback.recordingId ? await db.recordings.get(feedback.recordingId) : undefined,
    fixes: await db.fixes.where('feedbackId').equals(feedback.id!).toArray(),
    phrases: await db.phrases.where('feedbackId').equals(feedback.id!).toArray(),
  }), [feedback.id], undefined as { journal?: JournalEntry; recording?: Recording; fixes: Fix[]; phrases: Phrase[] } | undefined)
  const [confirm, setConfirm] = useState(false)
  if (!data) return null
  const original = data.journal?.text || data.recording?.transcript
  return (
    <div className="stack">
      <div className="side-by-side">
        <div>
          <h3 className="block-title">元の{feedback.source === 'diary' ? '音声日記' : feedback.source === 'write' ? '作文' : '英文'}</h3>
          {data.journal?.prompt && <p className="muted">テーマ：{data.journal.prompt}</p>}
          {data.recording && <PlayBlobButton blob={data.recording.audio} label="▶ 元の録音を聞く" />}
          {original ? <pre className="prompt-text">{original}</pre> : <p className="muted">元の文はつながっていません（会話練習など）。</p>}
        </div>
        <div>
          <h3 className="block-title">直し（{data.fixes.length}）</h3>
          <ul className="fix-list">{data.fixes.map((f) => <FixLine key={f.id} fix={f} voiceURI={voiceURI} />)}</ul>
          {data.phrases.length > 0 && (
            <>
              <h3 className="block-title">新しい表現（{data.phrases.length}）</h3>
              <ul className="fix-list">
                {data.phrases.map((p) => (
                  <li key={p.id} className="fix-line">
                    <div className="row fix-after-row"><p><strong>{p.expression}</strong>{p.meaning && `：${p.meaning}`}</p><SpeakButton text={p.expression} voiceURI={voiceURI} label="表現を読み上げ" /></div>
                    {p.example && <p className="muted">{p.example}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      {confirm ? (
        <div className="row">
          <button className="btn danger" onClick={() => { void deleteFeedback(feedback.id!); onDeleted() }}>この記録を消す</button>
          <button className="btn secondary" onClick={() => setConfirm(false)}>やめる</button>
        </div>
      ) : (
        <button className="mini-btn" onClick={() => setConfirm(true)}>この記録を消す（旅の手帳の表現は残ります）</button>
      )}
    </div>
  )
}
