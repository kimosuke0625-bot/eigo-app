import { Steps } from '../ui/Steps'
import { useEffect, useRef, useState } from 'react'
import { db, type Settings } from '../db/schema'
import { applyEdit } from '../content/edits'
import { loadBuiltinMaterials, useMaterials, type Mat } from '../content/materials'
import { countWords, splitSentences } from '../speech/sentences'
import { speechSupported } from '../speech/voices'
import { bankRef, playText, prepare, type BankRef } from '../speech/audioBank'
import { loadMaterialAudio, materialClips, playFile } from '../speech/clips'
import { diffWords, type DiffToken } from './dictationScore'
import { useSessionTimer } from './useSessionTimer'
import { playCorrect, playTry } from '../rewards/sound'

const usable = (s: string) => { const n = countWords(s); return n >= 4 && n <= 16 }

function sample<T>(xs: T[], n: number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

/** 出題する文を選ぶ：素材が決まっていればその素材から3文、なければ覚えたカードの例文から5文 */
async function pickSentences(material?: Mat): Promise<{ text: string; source: string; file?: string; ref?: BankRef }[]> {
  if (material) {
    const all = splitSentences(material.body).filter(usable)
    const picked = sample(all.map((s, i) => ({ s, i })), 3).sort((a, b) => a.i - b.i)
    // 内蔵素材は、PC で作った高品質な音声ファイルを使う
    const clips = (await materialClips(material.id))?.clips ?? {}
    return picked.map(({ s }) => ({ text: s, source: material.title, file: clips[s] }))
  }
  const cards = await db.cards.toArray()
  const reviewed = cards.filter((c) => c.fsrs.reps > 0)
  const items = (await db.items.bulkGet(sample(reviewed.length >= 5 ? reviewed : cards, 30).map((c) => c.itemId)))
    .filter((i) => i !== undefined)
  const out: { text: string; source: string; file?: string; ref?: BankRef }[] = []
  for (const raw of items) {
    const item = applyEdit(raw, await db.edits.get(raw.id))
    const ex = item.examples.find((e) => usable(e.en))
    if (ex && !out.some((o) => o.text === ex.en)) out.push({ text: ex.en, source: `「${item.english}」の例文`, ref: bankRef.example(ex.en) })
    if (out.length === 5) break
  }
  if (out.length < 5) {
    // カードが少ないうちは内蔵の読み物から補う
    const graded = (await loadBuiltinMaterials()).filter((m) => m.kind === 'graded')
    const audio = await loadMaterialAudio()
    for (const s of sample(graded.flatMap((m) => splitSentences(m.body).filter(usable).map((t) => ({ text: t, source: m.title, file: audio[m.id]?.clips[t] }))), 5 - out.length)) out.push(s)
  }
  return out
}

/** ディクテーション：音声を聞いて書き取り、語ごとに自動採点して差分を色で示す */
export function DictationScreen({ settings, materialId, onExit }: { settings: Settings; materialId?: string; onExit: () => void }) {
  const materials = useMaterials()
  if (materialId && !materials) return <p className="muted">問題を準備中…</p>
  return <Dictation settings={settings} material={materials?.find((m) => m.id === materialId)} onExit={onExit} />
}

function Dictation({ settings, material, onExit }: { settings: Settings; material?: Mat; onExit: () => void }) {
  const result = useSessionTimer('dictation', 'language', undefined, material?.id)
  const [items, setItems] = useState<{ text: string; source: string; file?: string; ref?: BankRef }[] | null>(null)
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [checked, setChecked] = useState<{ tokens: DiffToken[]; score: number } | null>(null)
  const [scores, setScores] = useState<number[]>([])
  const [plays, setPlays] = useState(0)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void pickSentences(material).then((list) => {
      setItems(list)
      for (const x of list) if (x.ref) void prepare(x.ref)
    })
  }, [material])

  // 再生できる音（内蔵の音声ファイルか、端末の読み上げ）がなければ練習できない
  if (items && !items.some((x) => x.file) && !speechSupported()) {
    return (
      <section className="card stack">
        <h2>ディクテーション</h2>
        <p>この端末のブラウザは読み上げに対応していないため、例文を再生できません。</p>
        <button className="btn secondary block" onClick={onExit}>戻る</button>
      </section>
    )
  }
  if (!items) return <p className="muted">問題を準備中…</p>
  const item = items[index]

  if (!item) {
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
    return (
      <section className="card stack" style={{ textAlign: 'center' }}>
        <h2>ディクテーション終了</h2>
        <p style={{ fontSize: '1.6rem', fontWeight: 800 }}>一致率 {Math.round(avg * 100)}%</p>
        <p className="muted">{scores.length}文。進捗の「聞き取り」に記録しました。</p>
        <button className="btn block" onClick={onExit}>戻る</button>
      </section>
    )
  }

  const listen = (rate: number) => {
    if (item.file) playFile(item.file, rate)
    else playText({ ref: item.ref, text: item.text, voiceURI: settings.voiceURI, rate })
    setPlays((p) => p + 1)
  }
  const check = () => {
    const r = diffWords(item.text, answer)
    setChecked(r)
    const next = [...scores, r.score]
    setScores(next)
    result.current.dictation = next.reduce((a, b) => a + b, 0) / next.length
    result.current.sentences = next.length
    if (r.score >= 0.999) playCorrect(next.filter((s) => s >= 0.999).length)
    else playTry()
  }
  const next = () => {
    setIndex(index + 1)
    setAnswer('')
    setChecked(null)
    setPlays(0)
    setTimeout(() => input.current?.focus(), 50)
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="muted">{index + 1} / {items.length}</span>
        <span className="tag">{item.source}</span>
      </div>
      <Steps steps={['聞く', '書く', '答え合わせ']} current={checked ? 2 : plays > 0 ? 1 : 0}
        guide={checked ? '赤い語が聞き取れなかった所です。正解をもう一度聞いて確かめましょう。' : plays > 0 ? '聞こえた英文を下に書きましょう。何度聞き直してもOK。' : 'まず🔊で英文を聞きましょう。'} />
      <section className="card stack">
        <div className="row">
          <button className="btn" style={{ flex: 1 }} onClick={() => listen(1)}>🔊 {plays ? 'もう一度' : '聞く'}</button>
          <button className="btn secondary" onClick={() => listen(0.7)}>🐢 ゆっくり</button>
        </div>
        <textarea ref={input} className="dictation-input" rows={3} value={answer} disabled={!!checked}
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder="ここに書く（大文字・句読点は気にしなくてOK）"
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!checked && answer.trim()) check(); else if (checked) next() } }} />
        {!checked ? (
          <button className="btn block" disabled={!answer.trim()} onClick={check}>答え合わせ</button>
        ) : (
          <>
            <div className="diff" aria-label="採点結果">
              {checked.tokens.map((t, i) => <span key={i} className={`d-${t.kind}`}>{t.text}</span>)}
            </div>
            <p className="muted">
              <span className="d-ok">緑</span>＝合っている　<span className="d-missing">赤</span>＝聞き取れなかった語　<span className="d-extra">灰の取り消し線</span>＝余分な語
            </p>
            <p><strong>一致率 {Math.round(checked.score * 100)}%</strong></p>
            <p className="muted">正解：{item.text}</p>
            <button className="btn block" onClick={next}>{index + 1 < items.length ? '次の文へ' : '結果を見る'}</button>
          </>
        )}
      </section>
      <button className="btn secondary block" onClick={onExit}>ここでやめる</button>
    </div>
  )
}
