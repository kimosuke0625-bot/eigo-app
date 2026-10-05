import { useMemo, useState } from 'react'
import { db } from '../db/schema'
import { getSettings, updateSettings } from '../db/settings'
import { useNgsl } from '../content/ngsl'
import { markKnown } from '../srs/store'
import { BANDS, TOP_KNOWN, buildDiagnostic, scoreDiagnostic, type DiagnosticAnswer, type DiagnosticResult } from './diagnostic'

/** 初回の診断テスト：60語について「意味が言える／言えない」を答え、開始レベルを決める */
export function DiagnosticScreen({ onDone }: { onDone: () => void }) {
  const { data, error } = useNgsl()
  const questions = useMemo(() => (data ? buildDiagnostic(data.words) : []), [data])
  const [started, setStarted] = useState(false)
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([])
  const [result, setResult] = useState<DiagnosticResult | null>(null)

  if (error) return <div className="banner warn">{error}</div>
  if (!data) return <p className="muted">語彙データを読み込み中…</p>

  const finish = async (all: DiagnosticAnswer[]) => {
    const r = scoreDiagnostic(all)
    const now = Date.now()
    // ほぼ知っている帯（開始位置より上）の語と、最上位100語（the, be, have など中学で習う機能語）は
    // 「知っている語」にする。ただしテストで「知らない」と答えた語は除く
    const unknown = new Set(all.filter((a) => a.itemId && !a.known).map((a) => a.itemId))
    const knownIds = data.words
      .filter((w) => (w.rank < r.startRank || w.rank <= TOP_KNOWN) && !unknown.has(w.id))
      .map((w) => w.id)
    await markKnown(knownIds, 'diagnostic', now)
    await db.assessments.add({ at: now, kind: 'diagnostic', vocabSize: r.vocabSize })
    const s = await getSettings()
    await updateSettings({ diagnosedAt: now, ...(s.phaseAuto ? { phase: r.phase } : {}) })
    setResult(r)
  }

  const skip = async () => {
    await markKnown(data.words.filter((w) => w.rank <= TOP_KNOWN).map((w) => w.id), 'diagnostic')
    // diagnosedAt = -1：受けずに進んだ（今日の画面の案内は出し続ける）
    await updateSettings({ diagnosedAt: -1 })
    onDone()
  }

  const answer = (known: boolean) => {
    const q = questions[answers.length]
    const next = [...answers, { ...q, known }]
    setAnswers(next)
    if (next.length === questions.length) void finish(next)
  }

  if (result) {
    return (
      <section className="card stack">
        <h2>診断の結果</h2>
        <p style={{ fontSize: '1.4rem', fontWeight: 700 }}>推定語彙数：約 {result.vocabSize.toLocaleString()} 語</p>
        <p className="muted">（NGSL 2,809語のうち。偽の単語への「知っている」で補正しています）</p>
        <table className="bands">
          <tbody>
            {BANDS.map(([lo, hi], i) => (
              <tr key={lo}>
                <td>{lo}〜{hi}位</td>
                <td style={{ width: '50%' }}><div className="progress"><div style={{ width: `${result.bandRates[i] * 100}%` }} /></div></td>
                <td>{Math.round(result.bandRates[i] * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>開始レベル：<strong>Phase {result.phase}</strong>。新しいカードは NGSL の <strong>{Math.max(result.startRank, TOP_KNOWN + 1)}位</strong>から始めます（上位{TOP_KNOWN}語は中学で習う基本語なので省きます）。</p>
        {result.falseAlarmRate > 0.2 && (
          <div className="banner warn">実在しない単語にも「知っている」と答えていたため、推定を低めに補正しました。</div>
        )}
        <button className="btn block" onClick={onDone}>今日の画面へ</button>
      </section>
    )
  }

  if (!started) {
    return (
      <section className="card stack">
        <h2>診断テスト（約4分）</h2>
        <p>英単語が{questions.length}個出ます。<strong>日本語で意味が言えるなら「知っている」</strong>、あやふやなら「知らない」を押してください。</p>
        <p className="muted">実在しない単語もいくつか混ざっています。正直に答えるほど、ちょうどよい難しさから始められます。</p>
        <button className="btn block" onClick={() => setStarted(true)}>はじめる</button>
        <button className="btn secondary block" onClick={() => void skip()}>
          あとで受ける（{TOP_KNOWN + 1}位のやさしい語から始める）
        </button>
      </section>
    )
  }

  const q = questions[answers.length]
  if (!q) return <p className="muted">集計中…</p>
  return (
    <section className="card stack" style={{ textAlign: 'center' }}>
      <p className="muted">{answers.length + 1} / {questions.length}</p>
      <div className="progress"><div style={{ width: `${(answers.length / questions.length) * 100}%` }} /></div>
      <p className="headword" style={{ margin: '32px 0' }}>{q.word}</p>
      <div className="row">
        <button className="btn secondary" style={{ flex: 1 }} onClick={() => answer(false)}>知らない</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => answer(true)}>知っている</button>
      </div>
      {answers.length > 0 && (
        <button className="link-btn" onClick={() => setAnswers(answers.slice(0, -1))}>ひとつ戻る</button>
      )}
    </section>
  )
}
