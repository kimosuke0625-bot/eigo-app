import { useEffect, useState } from 'react'
import { db, type Settings } from '../db/schema'
import { factEnglish, useFacts } from './facts'
import { buildFactQuiz, quizCandidate, type FactQuiz } from './factQuiz'
import { playCorrect, playTry } from './sound'

/** 今日の画面に出す、数日前の雑学の英語クイズ（1日1問まで） */
export function FactQuizCard({ settings }: { settings: Settings }) {
  const data = useFacts()
  const [quiz, setQuiz] = useState<FactQuiz | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  useEffect(() => {
    if (!data) return
    void (async () => {
      const states = await db.facts.toArray()
      // 今日すでに出していれば出さない
      const today = new Date().setHours(0, 0, 0, 0)
      if (states.some((f) => f.quizzedAt && f.quizzedAt >= today)) return
      const pick = quizCandidate(states)
      if (!pick) return
      const fact = data.facts.find((f) => f.id === pick.id)
      if (!fact) return
      const others = data.facts.filter((f) => f.id !== fact.id).slice(0, 60).map((f) => factEnglish(f, settings.phase))
      setQuiz(buildFactQuiz(fact.id, factEnglish(fact, settings.phase), others) ?? null)
    })()
  }, [data, settings.phase])
  if (!quiz) return null
  const answer = async (o: string) => {
    if (chosen) return
    setChosen(o)
    if (o === quiz.answer) playCorrect(1)
    else playTry()
    const cur = await db.facts.get(quiz.factId)
    if (cur) await db.facts.put({ ...cur, quizzedAt: Date.now() })
  }
  return (
    <section className="card stack">
      <h2 className="win-title">雑学クイズ</h2>
      <p className="muted">数日前に集めた雑学から。空いている所に入る語は？</p>
      <p className="fact-en">{quiz.sentence}</p>
      <div className="options">
        {quiz.options.map((o) => (
          <button key={o} className={`option ${chosen ? (o === quiz.answer ? 'right' : o === chosen ? 'wrong' : '') : ''}`}
            disabled={!!chosen} onClick={() => void answer(o)}>{o}</button>
        ))}
      </div>
      {chosen && <p>{chosen === quiz.answer ? '正解！ 覚えていましたね。' : `正解は「${quiz.answer}」。図鑑でもう一度読んでみましょう。`}</p>}
    </section>
  )
}
