import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Settings } from '../db/schema'
import { useMaterials, type Mat } from '../content/materials'
import { splitSentences } from '../speech/sentences'
import { playSentences } from '../speech/clips'
import { MicGate, PlayBlobButton, RecordButton, SelfRating } from './SpeakParts'
import { useSessionTimer } from './useSessionTimer'
import { Steps } from '../ui/Steps'
import { HelpButton } from './PracticeHelp'
import { useMaterialAudio, VoiceNote, type MaterialAudio } from './AudioParts'

/** 対話の役割練習：ビジネス場面の対話の片方の役を担当して、せりふを声に出す */
export function RoleplayScreen({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  const materials = useMaterials()
  const dialogues = useMemo(() => materials?.filter((m) => m.kind === 'dialogue' && m.lines) ?? [], [materials])
  // 一度練習した対話（ref = 対話id）
  const done = useLiveQuery(async () => {
    const list = await db.sessions.where('kind').equals('roleplay').toArray().catch(() => [])
    return new Set(list.filter((s) => s.seconds > 0 && s.ref).map((s) => s.ref!))
  }, [], new Set<string>())
  const [picked, setPicked] = useState<Mat | null>(null)
  const [mic, setMic] = useState<boolean | null>(null)

  if (!materials) return <p className="muted">素材を準備中…</p>
  if (!picked) {
    return (
      <div>
        <div className="practice-top"><HelpButton k="roleplay" settings={settings} /></div>
        <Steps steps={[]} current={0} guide="練習する対話を選びましょう。✓ は一度練習した対話です。" />
        {dialogues.map((d) => (
          <button key={d.id} className="menu-item as-button" onClick={() => setPicked(d)}>
            <div className="body">
              <div className="name">{done.has(d.id) ? '✓ ' : ''}{d.scene}</div>
              <div className="muted">{d.title}（{Object.keys(d.speakers ?? {}).join('・')}）</div>
            </div>
            <span className="min">▶</span>
          </button>
        ))}
        <button className="btn secondary block" style={{ marginTop: 12 }} onClick={onExit}>戻る</button>
      </div>
    )
  }
  if (mic === null) {
    return (
      <div>
        <div className="practice-top"><HelpButton k="roleplay" settings={settings} /></div>
        <MicGate title="対話の役割練習" lead={`「${picked.scene}」の対話を使います。`} onReady={setMic} />
        <button className="btn secondary block" onClick={() => setPicked(null)}>対話を選び直す</button>
      </div>
    )
  }
  return <RoleplaySession key={picked.id} material={picked} settings={settings} mic={mic}
    onOther={() => setPicked(null)} onExit={onExit} />
}

const STAGES = ['全体を聞く', '役を選ぶ', 'せりふを言う', '振り返る']

function RoleplaySession({ material, settings, mic, onOther, onExit }: {
  material: Mat; settings: Settings; mic: boolean; onOther: () => void; onExit: () => void
}) {
  const lines = material.lines ?? []
  const speakers = Object.keys(material.speakers ?? {})
  const audio = useMaterialAudio(material.id)
  const [stage, setStage] = useState(0)
  const [role, setRole] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  const [hideInit, setHideInit] = useState(false)
  const result = useSessionTimer('roleplay', 'output', undefined, material.id)

  return (
    <div>
      <div className="practice-top"><HelpButton k="roleplay" settings={settings} /></div>
      <Steps steps={STAGES} current={stage} guide={[
        'まず対話全体を聞いて、場面と流れをつかみましょう。',
        '自分が担当する役を選びましょう。慣れたら、もう一方の役もやってみましょう。',
        '相手のせりふを聞いたら、自分のせりふを声に出して言いましょう。',
        'おつかれさまでした。言えたかどうかを振り返りましょう。',
      ][stage]} />
      <h2 style={{ fontSize: '1.05rem' }}>{material.scene}</h2>
      <p className="muted">{material.title}</p>
      <VoiceNote audio={audio} />
      {stage === 0 && <ListenAll material={material} audio={audio} settings={settings} onNext={() => setStage(1)} />}
      {stage === 1 && (
        <section className="card stack">
          <p><strong>どちらの役をしますか？</strong></p>
          {speakers.map((s) => (
            <button key={s} className="btn block" onClick={() => { setRole(s); setStage(2) }}>{s} の役</button>
          ))}
        </section>
      )}
      {stage === 2 && role && (
        <PlayRole key={`${role}-${round}`} lines={lines} role={role} audio={audio} hideInit={hideInit}
          settings={settings} mic={mic} onDone={() => setStage(3)} />
      )}
      {stage === 3 && role && (
        <Finish role={role} speakers={speakers}
          onRate={(v) => { result.current = { ...result.current, [`self:${role}`]: v } }}
          onAgain={(r, hide) => { setRole(r); setHideInit(hide); setRound((n) => n + 1); setStage(2) }} onOther={onOther} onExit={onExit} />
      )}
      {stage < 3 && <button className="btn secondary block" style={{ marginTop: 12 }} onClick={onOther}>ほかの対話を選ぶ</button>}
    </div>
  )
}

function ListenAll({ material, audio, settings, onNext }: {
  material: Mat; audio: MaterialAudio | null | undefined; settings: Settings; onNext: () => void
}) {
  const sentences = useMemo(() => splitSentences(material.body), [material.body])
  const paraOf = useMemo(() => {
    // 文の番号 → せりふの番号（読んでいるせりふを強調する）
    const out: number[] = []
    material.body.split(/\n\s*\n/).forEach((p, i) => splitSentences(p).forEach(() => out.push(i)))
    return out
  }, [material.body])
  const [current, setCurrent] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [showText, setShowText] = useState(false)
  const stop = useRef<() => void>(() => {})
  useEffect(() => () => stop.current(), [])

  const play = () => {
    stop.current()
    setPlaying(true)
    stop.current = playSentences({
      clips: audio?.clips, sentences, from: 0, rate: 1, voiceURI: settings.voiceURI,
      onIndex: (i) => setCurrent(paraOf[i] ?? -1),
      onEnd: () => { setPlaying(false); setCurrent(-1) },
    })
  }

  return (
    <section className="card stack">
      <div className="row">
        {playing
          ? <button className="btn secondary" style={{ flex: 1 }} onClick={() => { stop.current(); setPlaying(false); setCurrent(-1) }}>■ 止める</button>
          : <button className="btn" style={{ flex: 1 }} onClick={play}>▶ 対話を聞く</button>}
        <button className="btn secondary" style={{ flex: 1 }} onClick={() => setShowText((v) => !v)}>{showText ? '文字を隠す' : '文字を見る'}</button>
      </div>
      {showText ? <Script lines={material.lines ?? []} current={current} /> : <p className="muted">まずは文字を見ずに聞いてみましょう。わからなければ「文字を見る」を押してください。</p>}
      <button className="btn block" onClick={() => { stop.current(); onNext() }}>聞けたので次へ</button>
    </section>
  )
}

function Script({ lines, current, role, hideRole }: { lines: [string, string][]; current: number; role?: string; hideRole?: boolean }) {
  return (
    <div className="dialogue">
      {lines.map(([who, text], i) => (
        <p key={i} className={`dialogue-line${i === current ? ' current' : ''}${who === role ? ' mine' : ''}`}>
          <strong>{who}:</strong> {hideRole && who === role ? '……' : text}
        </p>
      ))}
    </div>
  )
}

function PlayRole({ lines, role, audio, hideInit, settings, mic, onDone }: {
  lines: [string, string][]; role: string; audio: MaterialAudio | null | undefined; hideInit: boolean
  settings: Settings; mic: boolean; onDone: () => void
}) {
  const [index, setIndex] = useState(0)
  const [hide, setHide] = useState(hideInit)
  const [playing, setPlaying] = useState(false)
  const [blob, setBlob] = useState<Blob | null>(null)
  const stop = useRef<() => void>(() => {})
  useEffect(() => () => stop.current(), [])

  const [who, text] = lines[index] ?? ['', '']
  const mine = who === role
  const sentences = useMemo(() => splitSentences(`${who}: ${text}`), [who, text])

  const play = (onEnd?: () => void) => {
    stop.current()
    setPlaying(true)
    stop.current = playSentences({
      clips: audio?.clips, sentences, from: 0, rate: 1, voiceURI: settings.voiceURI,
      onIndex: () => {},
      onEnd: () => { setPlaying(false); onEnd?.() },
    })
  }
  // 相手のせりふは自動で流す
  useEffect(() => {
    setBlob(null)
    if (!mine) play()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  const next = () => {
    stop.current()
    if (index + 1 >= lines.length) onDone()
    else setIndex(index + 1)
  }

  return (
    <section className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{index + 1} / {lines.length}</span>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
          <span>自分のせりふを隠す</span>
        </label>
      </div>
      <Script lines={lines.slice(0, index + 1)} current={index} role={role} hideRole={hide} />
      {mine ? (
        <>
          <p><strong>あなたの番です。</strong>{hide ? '思い出して、' : ''}声に出して言いましょう。</p>
          {mic ? (
            <RecordButton label="🎙 録音して言う" maxSeconds={30} onStart={() => stop.current()} onDone={(b) => setBlob(b)} />
          ) : (
            <p className="muted">マイクを使わない設定です。声に出して言ってから、手本を聞きましょう。</p>
          )}
          <div className="row">
            <button className="btn secondary" style={{ flex: 1 }} onClick={() => play()} disabled={playing}>🔊 手本を聞く</button>
            {blob && <div style={{ flex: 1 }}><PlayBlobButton blob={blob} /></div>}
          </div>
          {hide && <p className="muted">手本：{text}</p>}
          <button className="btn block" onClick={next}>{index + 1 >= lines.length ? '終わる' : '次のせりふへ'}</button>
        </>
      ) : (
        <>
          <div className="row">
            <button className="btn secondary" style={{ flex: 1 }} onClick={() => play()} disabled={playing}>🔊 もう一度聞く</button>
            <button className="btn" style={{ flex: 2 }} onClick={next}>{index + 1 >= lines.length ? '終わる' : '次へ'}</button>
          </div>
        </>
      )}
    </section>
  )
}

function Finish({ role, speakers, onRate, onAgain, onOther, onExit }: {
  role: string; speakers: string[]; onRate: (v: number) => void
  onAgain: (role: string, hide: boolean) => void; onOther: () => void; onExit: () => void
}) {
  const [rated, setRated] = useState(false)
  const other = speakers.find((s) => s !== role) ?? role
  return (
    <section className="card stack">
      {!rated ? (
        <SelfRating question={`${role} のせりふを、手本に近い言い方で言えましたか？`} onRate={(v) => { onRate(v); setRated(true) }} />
      ) : (
        <p>記録しました。定番の言い回しを、自分の仕事の場面に置き換えて言ってみると、さらに身につきます。</p>
      )}
      <button className="btn block" onClick={() => onAgain(other, false)}>{other} の役でもう一度</button>
      <button className="btn secondary block" onClick={() => onAgain(role, true)}>同じ役で、せりふを隠して挑戦</button>
      <button className="btn secondary block" onClick={onOther}>ほかの対話を選ぶ</button>
      <button className="btn secondary block" onClick={onExit}>練習を終える</button>
    </section>
  )
}
