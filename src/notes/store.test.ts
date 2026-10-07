import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { getSettings } from '../db/settings'
import { exportAll, importAll } from '../db/backup'
import { choosePhrases, countTypes, deletePhrase, IMPORT_XP, markPhrasesUsed, phraseItemId, recordRetell, retellQueue, saveFeedback, syncPhraseItems, topWeakTypes, usedPhrase } from './store'

const draft = {
  source: 'diary' as const,
  raw: '...',
  fixes: [
    { original: 'I go there yesterday.', corrected: 'I went there yesterday.', type: '時制', note: '過去形' },
    { original: 'I eat a breakfast.', corrected: 'I ate breakfast.', type: '冠詞', note: '' },
    { original: 'He go.', corrected: 'He goes.', type: '時制', note: '' },
    { original: 'I red it.', corrected: 'I read it.', type: '聞き取りの誤り', note: '認識の誤り' },
  ],
  phrases: [{ expression: 'catch up on ~', meaning: '〜の遅れを取り戻す', example: 'I need to catch up on my emails.', scene: '仕事' }],
}

describe('添削の保存と活用', () => {
  it('保存すると直し・表現・復習カードができ、経験値が入る。バックアップから戻しても表現のカードが使える', async () => {
    const database = new EigoDB('notes-1')
    const { feedbackId, phraseIds } = await saveFeedback(draft, database, new Date(2026, 9, 8, 9).getTime())
    expect(await database.fixes.where('feedbackId').equals(feedbackId).count()).toBe(4)
    const itemId = phraseItemId(phraseIds[0])
    expect(await database.items.get(itemId)).toMatchObject({ english: 'catch up on ~', japanese: '〜の遅れを取り戻す', kind: 'chunk' })
    expect(await database.cards.where('itemId').equals(itemId).count()).toBe(1)
    expect((await getSettings(database)).xpTotal).toBe(IMPORT_XP)

    const file = await exportAll(database)
    expect(file.tables.feedback).toHaveLength(1)
    expect(file.tables.fixes).toHaveLength(4)
    expect(file.tables.phrases).toHaveLength(1)
    const other = new EigoDB('notes-1b')
    await importAll(file, other)
    await syncPhraseItems(other)
    expect(await other.items.get(itemId)).toBeTruthy()
    expect(await other.cards.where('itemId').equals(itemId).count()).toBe(1)

    await deletePhrase(phraseIds[0], database)
    expect(await database.cards.where('itemId').equals(itemId).count()).toBe(0)
  })

  it('弱点：種類ごとに多い順、聞き取りの誤りは除く、今週と先週を分けて数える', async () => {
    const today = '2026-10-08' // 木曜（週は10/5から）
    const rows = [
      { type: '時制', day: '2026-10-06' }, { type: '時制', day: '2026-09-30' }, { type: '時制', day: '2026-09-01' },
      { type: '冠詞', day: '2026-10-07' }, { type: '冠詞', day: '2026-10-08' },
      { type: '聞き取りの誤り', day: '2026-10-08' },
    ]
    expect(countTypes(rows, today)).toEqual([
      { type: '時制', total: 3, thisWeek: 1, lastWeek: 1 },
      { type: '冠詞', total: 2, thisWeek: 2, lastWeek: 0 },
    ])
    const database = new EigoDB('notes-2')
    await saveFeedback(draft, database)
    expect(await topWeakTypes(3, database)).toEqual(['時制', '冠詞'])
  })

  it('今日使ってみる表現の選び方と、使えたかの判定', async () => {
    const p = (id: number, used: number, lastUsedAt?: number) => ({ id, at: id, day: '', expression: '', meaning: '', example: '', scene: '', source: 'write' as const, used, lastUsedAt })
    expect(choosePhrases([p(1, 2), p(2, 0), p(3, 1, 5), p(4, 1, 1), p(5, 0)]).map((x) => x.id)).toEqual([2, 5, 4])

    expect(usedPhrase('I have to catch up on my work tonight.', 'catch up on ~')).toBe(true)
    expect(usedPhrase('I am looking forward to seeing you.', 'look forward to ~ing')).toBe(true)
    expect(usedPhrase('It was a lot of fun!', 'It was a lot of fun.')).toBe(true)
    expect(usedPhrase('We are making a decision.', 'make a decision')).toBe(true)
    expect(usedPhrase('I caught a cold.', 'catch up on ~')).toBe(false)
    expect(usedPhrase('a lot of people had fun', 'It was a lot of fun.')).toBe(false)

    const database = new EigoDB('notes-3')
    const { phraseIds } = await saveFeedback(draft, database)
    expect(await markPhrasesUsed(phraseIds, database)).toBe(30)
    expect((await database.phrases.get(phraseIds[0]))?.used).toBe(1)
  })

  it('言い直しの練習：聞き取りの誤りは出さず、言えなかったものを先に出す', async () => {
    const database = new EigoDB('notes-4')
    await saveFeedback(draft, database)
    let q = await retellQueue(10, database)
    expect(q).toHaveLength(3)
    await recordRetell(q[0], 2, database)
    await recordRetell(q[1], 0, database)
    q = await retellQueue(10, database)
    expect(q.map((f) => f.lastResult)).toEqual([undefined, 0, 2])
  })
})
