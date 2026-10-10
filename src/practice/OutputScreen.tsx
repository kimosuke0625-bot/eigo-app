import { useEffect, useMemo, useState } from 'react'
import { db, type Settings } from '../db/schema'
import { dayKey } from '../today/menu'
import { Steps } from '../ui/Steps'
import { HelpButton } from './PracticeHelp'
import { ClaudePromptBox } from './ClaudePromptBox'
import { correctionPrompt, type Level } from './claudePrompts'
import { currentLevel, OUTPUT_PROMPTS, promptForDay, todaysTargets, usedTargets, wordStats, type Target } from './output'
import { MicGate, PlayBlobButton, RecordButton, useTranscriber } from './SpeakParts'
import { useSessionTimer } from './useSessionTimer'
import { playText, bankRef } from '../speech/audioBank'
import type { Phrase } from '../db/schema'
import { useTodayPhrases, useWeakFocus } from '../notes/hooks'
import { markPhrasesUsed, PHRASE_USE_XP, usedPhrase } from '../notes/store'
import type { FeedbackLink } from '../notes/ImportScreen'
import { PixelIcon } from '../ui/PixelIcon'

type Mode = 'write' | 'diary'
const STEPS = ['テーマと今日の語', '書く・話す', 'ふり返り']

/** 音声日記・短い作文（アウトプット）。今日覚えた語を3つ以上使う */
export function OutputScreen({ settings, onExit, onImport }: { settings: Settings; onExit: () => void; onImport: (link: FeedbackLink) => void }) {
  const today = dayKey()
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [level, setLevel] = useState<Level | null>(null)
  const [prompt, setPrompt] = useState(() => promptForDay(settings.phase, today))
  const [mode, setMode] = useState<Mode | null>(null)
  const [mic, setMic] = useState<boolean | null>(null)
  const phrases = useTodayPhrases()
  const focus = useWeakFocus()

  useEffect(() => {
    void todaysTargets().then(setTargets)
    void currentLevel(settings.phase).then(setLevel)
  }, [settings.phase])

  if (!targets || !level || !phrases) return <p className="muted">準備中…</p>
  const need = Math.min(3, targets.length)
  const prompts = OUTPUT_PROMPTS.filter((p) => p.minPhase <= settings.phase)

  return (
    <div>
      <div className="practice-top"><HelpButton k="output" settings={settings} /></div>
      {!mode && (
        <>
          <Steps steps={STEPS} current={0}
            guide={need ? `テーマについて、今日の語を${need}つ以上使って書くか話しましょう。` : 'テーマについて、自由に書くか話しましょう。'} />
          <section className="card stack">
            <p className="topic-en">{prompt.en}</p>
            <p className="muted">{prompt.ja}</p>
            <button className="link-btn" onClick={() => setPrompt(prompts[(prompts.indexOf(prompt) + 1) % prompts.length])}>別のテーマにする</button>
            <h3 className="block-title">今日の語（{need}つ以上使う）</h3>
            {targets.length ? (
              <div className="chips">
                {targets.map((t) => (
                  <button key={t.lemma} className="chip" onClick={() => playText({ ref: bankRef.head(t.lemma), text: t.lemma, voiceURI: settings.voiceURI })}>
                    {t.lemma}{t.ja && <span className="muted">：{t.ja.split('、')[0]}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">今日はまだ覚えた語・復習した語がありません。先に復習カードをすると、その語を使って練習できます。</p>
            )}
            {phrases.length > 0 && (
              <div className="today-phrases">
                <h3 className="block-title"><PixelIcon name="book" size={16} /> 今日使ってみる表現（旅の手帳から）</h3>
                <ul>
                  {phrases.map((p) => (
                    <li key={p.id}>
                      <button className="chip" onClick={() => playText({ text: p.expression, voiceURI: settings.voiceURI })}>{p.expression}</button>
                      <span className="muted">{p.meaning}</span>
                    </li>
                  ))}
                </ul>
                <p className="muted">使えたら1つにつき <span className="xp-chip">+{PHRASE_USE_XP} XP</span></p>
              </div>
            )}
            <div className="row">
              <button className="btn" style={{ flex: 1 }} onClick={() => setMode('write')}>✍️ 短い作文</button>
              <button className="btn" style={{ flex: 1 }} onClick={() => setMode('diary')}>🎙 音声日記</button>
            </div>
            <p className="muted">作文は5〜10文が目安。音声日記は1〜3分話します。</p>
          </section>
          <button className="btn secondary block" onClick={onExit}>戻る</button>
        </>
      )}
      {mode === 'write' && <Writing level={level} prompt={prompt.en} targets={targets} need={need} phrases={phrases} focus={focus} onImport={onImport} onExit={onExit} />}
      {mode === 'diary' && mic === null && (
        <>
          <MicGate title="音声日記" lead="テーマについて1〜3分、英語で話して録音します。" onReady={setMic} />
          <button className="btn secondary block" onClick={() => setMode(null)}>戻る</button>
        </>
      )}
      {mode === 'diary' && mic !== null && (
        <Diary settings={settings} level={level} prompt={prompt.en} targets={targets} need={need} mic={mic} phrases={phrases} focus={focus} onImport={onImport} onExit={onExit} />
      )}
    </div>
  )
}

function TargetChecklist({ targets, used }: { targets: Target[]; used: string[] }) {
  if (!targets.length) return null
  return (
    <div className="chips">
      {targets.map((t) => (
        <span key={t.lemma} className={`chip ${used.includes(t.lemma) ? 'used' : ''}`}>
          {used.includes(t.lemma) ? '✓ ' : ''}{t.lemma}
        </span>
      ))}
    </div>
  )
}

async function saveEntry(kind: Mode, text: string, prompt: string, targets: Target[], used: string[], phrases: { targets: Phrase[]; used: number[] }, recordingId?: number): Promise<number> {
  const { words, types } = wordStats(text)
  return await db.journal.add({
    at: Date.now(), day: dayKey(), kind, text, prompt, targets: targets.map((t) => t.lemma), used, words, types, recordingId,
    phraseTargets: phrases.targets.map((p) => p.id!), phrasesUsed: phrases.used,
  }) as number
}

/** 今日使ってみる表現のチェック表（使えたものに ✓） */
function PhraseChecklist({ phrases, used, onToggle }: { phrases: Phrase[]; used: number[]; onToggle?: (id: number) => void }) {
  if (!phrases.length) return null
  return (
    <div>
      <p className="muted">今日使ってみる表現{onToggle ? '（使えたものをタップ）' : ''}：</p>
      <div className="chips">
        {phrases.map((p) => {
          const on = used.includes(p.id!)
          return onToggle
            ? <button key={p.id} className={`chip phrase-chip ${on ? 'used' : ''}`} onClick={() => onToggle(p.id!)}>{on ? '✓ ' : ''}{p.expression}</button>
            : <span key={p.id} className={`chip phrase-chip ${on ? 'used' : ''}`}>{on ? '✓ ' : ''}{p.expression}</span>
        })}
      </div>
    </div>
  )
}

function PhraseResult({ xp }: { xp: number }) {
  if (!xp) return null
  return <p className="banner ok phrase-win">旅の手帳の表現を {xp / PHRASE_USE_XP}つ使えました！ <span className="xp-chip">+{xp} XP</span></p>
}

function Writing({ level, prompt, targets, need, phrases, focus, onImport, onExit }: {
  level: Level
  prompt: string
  targets: Target[]
  need: number
  phrases: Phrase[]
  focus: string[]
  onImport: (link: FeedbackLink) => void
  onExit: () => void
}) {
  const result = useSessionTimer('output', 'output', undefined, 'write')
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const used = useMemo(() => usedTargets(text, targets), [text, targets])
  const usedP = useMemo(() => phrases.filter((p) => usedPhrase(text, p.expression)).map((p) => p.id!), [text, phrases])
  const [entryId, setEntryId] = useState<number>()
  const [phraseXp, setPhraseXp] = useState(0)
  const stats = wordStats(text)

  const finish = async () => {
    setEntryId(await saveEntry('write', text, prompt, targets, used, { targets: phrases, used: usedP }))
    setPhraseXp(await markPhrasesUsed(usedP))
    result.current.writingWords = stats.words
    result.current.writingTypes = stats.types
    result.current.targetsUsed = used.length
    setDone(true)
    window.scrollTo({ top: 0 })
  }

  return (
    <div>
      <Steps steps={STEPS} current={done ? 2 : 1}
        guide={done ? 'Claude に添削を頼むと、直し方と理由が分かります。' : `英語で書きましょう。今日の語を${need}つ以上（いま ${used.length}つ）。`} />
      <section className="card stack">
        <p className="topic-en">{prompt}</p>
        {!done ? (
          <>
            <textarea className="paste-area" rows={9} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Today I ..." autoCapitalize="sentences" spellCheck={false} />
            <p className="muted">{stats.words}語・{stats.types}種類の語</p>
            <TargetChecklist targets={targets} used={used} />
            <PhraseChecklist phrases={phrases} used={usedP} />
            <button className="btn block" disabled={stats.words < 5} onClick={() => void finish()}>書き終えた</button>
          </>
        ) : (
          <>
            <p className="banner ok">{stats.words}語・{stats.types}種類。今日の語を {used.length} / {targets.length} 使いました{used.length >= need ? '。目標達成！' : '。'}</p>
            <PhraseResult xp={phraseXp} />
            <pre className="prompt-text">{text}</pre>
            <ClaudePromptBox label="Claude に添削を頼む（依頼文をコピー）"
              prompt={correctionPrompt({ level, text, kind: 'write', topic: prompt, targets: targets.map((t) => t.lemma), phrases: phrases.map((p) => p.expression), focus })}
              onImport={() => onImport({ source: 'write', journalId: entryId })} />
            <button className="btn block" onClick={onExit}>今日の画面に戻る</button>
          </>
        )}
      </section>
      {!done && <button className="btn secondary block" onClick={onExit}>やめる（書いた文は保存しません）</button>}
    </div>
  )
}

function Diary({ settings, level, prompt, targets, need, mic, phrases, focus, onImport, onExit }: {
  settings: Settings
  level: Level
  prompt: string
  targets: Target[]
  need: number
  mic: boolean
  phrases: Phrase[]
  focus: string[]
  onImport: (link: FeedbackLink) => void
  onExit: () => void
}) {
  const result = useSessionTimer('output', 'output', undefined, 'diary')
  const transcriber = useTranscriber(settings)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error' | 'off'>('idle')
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [checkedP, setCheckedP] = useState<number[]>([])
  const [entryId, setEntryId] = useState<number>()
  const [phraseXp, setPhraseXp] = useState(0)

  const onRecorded = async (b: Blob, s: number) => {
    setBlob(b)
    setSeconds(s)
    if (!transcriber.enabled) { setStatus('off'); return }
    setStatus('running')
    const r = await transcriber.run(b)
    if (r?.ok) { setText(r.text); setStatus('done') }
    else { setStatus('error'); setError(r && !r.ok ? r.reason : '') }
  }

  const used = status === 'done' ? usedTargets(text, targets) : checked
  // 文字にできたときは自動で判定し、できなかったときは自分でチェックする
  const usedP = status === 'done' ? phrases.filter((p) => usedPhrase(text, p.expression)).map((p) => p.id!) : checkedP
  const finish = async () => {
    const recordingId = blob && blob.size
      ? await db.recordings.add({ sessionId: 0, audio: blob, at: Date.now(), kind: 'diary', ref: prompt, text: prompt, transcript: text || undefined, seconds })
      : undefined
    setEntryId(await saveEntry('diary', text, prompt, targets, used, { targets: phrases, used: usedP }, recordingId))
    setPhraseXp(await markPhrasesUsed(usedP))
    result.current.diarySeconds = Math.round(seconds)
    result.current.targetsUsed = used.length
    if (text) {
      const s = wordStats(text)
      result.current.speakingWpm = Math.round((s.words / Math.max(seconds, 1)) * 60)
    }
    setSaved(true)
  }

  return (
    <div>
      <Steps steps={STEPS} current={saved ? 2 : 1}
        guide={saved ? 'Claude に添削を頼むと、直し方と理由が分かります。' : blob ? '話した内容を確かめて、保存しましょう。' : `テーマについて話しましょう。今日の語を${need}つ以上。止まっても日本語に逃げず、知っている英語で言い換えましょう。`} />
      <section className="card stack">
        <p className="topic-en">{prompt}</p>
        <TargetChecklist targets={targets} used={used} />
        <PhraseChecklist phrases={phrases} used={usedP}
          onToggle={status === 'done' || saved ? undefined : (id) => setCheckedP(checkedP.includes(id) ? checkedP.filter((x) => x !== id) : [...checkedP, id])} />
        {!blob && (mic
          ? <RecordButton maxSeconds={180} label="🎙 話し始める（最大3分）" onDone={(b, s) => void onRecorded(b, s)} />
          : <p className="muted">録音を使えない状態です。声に出して話してから、使った語にチェックを付けて保存しましょう。</p>)}
        {blob && blob.size > 0 && <PlayBlobButton blob={blob} />}
        {status === 'running' && <p className="banner info">計算中：録音を文字にしています…</p>}
        {status === 'error' && <p className="banner warn">文字にできませんでした：{error}</p>}
        {(status === 'done' || status === 'error') && (
          <label className="field">
            <span>話した内容（音声認識の結果。間違いを直してもかまいません）</span>
            <textarea className="paste-area" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        {(status === 'off' || status === 'error' || !mic) && targets.length > 0 && !saved && (
          <div>
            <p>使った語にチェック：</p>
            <div className="chips">
              {targets.map((t) => (
                <button key={t.lemma} className={`chip ${checked.includes(t.lemma) ? 'used' : ''}`}
                  onClick={() => setChecked(checked.includes(t.lemma) ? checked.filter((x) => x !== t.lemma) : [...checked, t.lemma])}>
                  {checked.includes(t.lemma) ? '✓ ' : ''}{t.lemma}
                </button>
              ))}
            </div>
          </div>
        )}
        {!saved && (blob || !mic) && status !== 'running' && (
          <button className="btn block" onClick={() => void finish()}>保存する</button>
        )}
        {saved && (
          <>
            <p className="banner ok">{Math.round(seconds)}秒話しました。今日の語を {used.length} / {targets.length} 使いました{used.length >= need ? '。目標達成！' : '。'}</p>
            <PhraseResult xp={phraseXp} />
            {text && (
              <ClaudePromptBox label="Claude に添削を頼む（依頼文をコピー）"
                prompt={correctionPrompt({ level, text, kind: 'diary', topic: prompt, targets: targets.map((t) => t.lemma), phrases: phrases.map((p) => p.expression), focus })}
                onImport={() => onImport({ source: 'diary', journalId: entryId })} />
            )}
            <button className="btn block" onClick={onExit}>今日の画面に戻る</button>
          </>
        )}
      </section>
      {!saved && <button className="btn secondary block" onClick={onExit}>やめる</button>}
    </div>
  )
}
