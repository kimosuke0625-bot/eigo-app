import { describe, expect, it } from 'vitest'
import { buildFactQuiz, quizCandidate } from './factQuiz'

function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

describe('雑学クイズ', () => {
  it('内容語に穴をあけ、ほかの雑学の語を選択肢に混ぜる', () => {
    const q = buildFactQuiz('f1', 'Honey almost never goes bad, even after many years.', ['Elephants cannot jump at all.', 'Light travels very quickly through space.'], seeded(5))!
    expect(q.sentence).toContain('____')
    expect(q.sentence).not.toContain(q.answer)
    expect(q.options).toHaveLength(3)
    expect(q.options).toContain(q.answer)
    expect(new Set(q.options).size).toBe(3)
  })

  it('3〜14日前に手に入れて、まだ出していない雑学から古い順に出す', () => {
    const day = 86_400_000
    const now = 100 * day
    const states = [
      { id: 'a', category: 'x', acquiredAt: now - 1 * day },
      { id: 'b', category: 'x', acquiredAt: now - 5 * day },
      { id: 'c', category: 'x', acquiredAt: now - 9 * day, quizzedAt: now - day },
      { id: 'd', category: 'x', acquiredAt: now - 12 * day },
      { id: 'e', category: 'x', acquiredAt: now - 30 * day },
    ]
    expect(quizCandidate(states, now)?.id).toBe('d')
  })
})
