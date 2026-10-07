import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { newFsrsCard } from '../srs/fsrs'
import { promptForDay, todaysTargets, usedTargets, wordStats } from './output'
import { conversationPrompt, correctionPrompt, SCENES } from './claudePrompts'

describe('今日の語と作文の判定', () => {
  it('今日覚え始めた語と今日復習した語を集める', async () => {
    const database = new EigoDB('output-1')
    const now = new Date(2026, 9, 7, 21).getTime()
    await database.items.bulkPut([
      { id: 'a', kind: 'word', english: 'decide', forms: ['decide', 'decided'], examples: [], japanese: '決める' },
      { id: 'b', kind: 'word', english: 'meeting', forms: ['meeting'], examples: [] },
      { id: 'c', kind: 'word', english: 'old', forms: ['old'], examples: [] },
    ])
    await database.cards.add({ itemId: 'a', fsrs: newFsrsCard(now), due: now, introducedAt: now - 1000 })
    const b = await database.cards.add({ itemId: 'b', fsrs: newFsrsCard(0), due: 0, introducedAt: 0 })
    await database.cards.add({ itemId: 'c', fsrs: newFsrsCard(0), due: 0, introducedAt: 0 })
    await database.reviews.add({ cardId: b!, at: now - 500, rating: 3, state: 2, answerMs: 1, mode: 'word' })
    const t = await todaysTargets(now, database)
    expect(t.map((x) => x.lemma)).toEqual(['decide', 'meeting'])
  })

  it('活用形も「使った」と数える', () => {
    const targets = [{ lemma: 'decide', forms: ['decide', 'decided'] }, { lemma: 'meeting', forms: ['meeting', 'meetings'] }, { lemma: 'plan', forms: ['plan'] }]
    expect(usedTargets('We decided to have two meetings.', targets)).toEqual(['decide', 'meeting'])
  })

  it('語数と語の種類の数', () => {
    expect(wordStats('I like tea. I like coffee too.')).toEqual({ words: 7, types: 5 })
  })

  it('テーマは日によって変わり、Phase に合ったものだけ', () => {
    const a = promptForDay(1, '2026-10-07')
    expect(a.minPhase).toBe(1)
    const days = new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((d) => promptForDay(3, d).en))
    expect(days.size).toBeGreaterThan(1)
  })
})

describe('Claude への依頼文', () => {
  it('レベル・英文・今日の語を含める', () => {
    const p = correctionPrompt({ level: { phase: 2, vocab: 1500 }, text: 'I decide to go.', kind: 'write', targets: ['decide'] })
    expect(p).toContain('1,500語')
    expect(p).toContain('I decide to go.')
    expect(p).toContain('decide')
  })
  it('取り込み用のまとめの形式と、弱点の上位を含める。返事の例は読み取りで空になる', async () => {
    const { parseFeedback } = await import('../notes/parse')
    const p = correctionPrompt({ level: { phase: 2, vocab: 1500 }, text: 'I decide to go.', kind: 'diary', focus: ['時制', '冠詞'] })
    expect(p).toContain('【アプリ取り込み用のまとめ】')
    expect(p).toContain('種類：音声日記')
    expect(p).toContain('「時制」「冠詞」')
    const c = conversationPrompt({ level: { phase: 3, vocab: 2500 }, scene: SCENES[0], focus: ['前置詞'] })
    expect(c).toContain('種類：会話練習')
    expect(c).toContain('ふり返りのいちばん最後に')
    // 依頼文の中の形式の例そのものは、項目が「（…）」なので読み取っても中身のない直しになる
    expect(parseFeedback(p)).toMatchObject({ source: 'diary', fixes: [], phrases: [] })
  })
  it('会話練習の場面と目的を含める', () => {
    const p = conversationPrompt({ level: { phase: 3, vocab: 2500 }, scene: SCENES.find((s) => s.id === 'phone')! })
    expect(p).toContain('電話の受け答え')
    expect(p).toContain('伝言')
  })
})
