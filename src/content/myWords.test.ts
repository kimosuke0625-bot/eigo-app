import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { addWords, parseWordList, planWords, removeMyWord, syncMyWordItems } from './myWords'

describe('貼り付けた単語リストの読み取り', () => {
  it('1行に1語。訳はいろいろな区切りで付けられる', () => {
    const { words } = parseWordList([
      'resilient - 立ち直りが早い',
      'leverage：活用する',
      'deadline\t締め切り',
      'stakeholder 利害関係者',
      '1. negotiate',
      '・follow up = 追って連絡する',
      'Resilient',
    ].join('\n'))
    expect(words).toEqual([
      { english: 'resilient', japanese: '立ち直りが早い' },
      { english: 'leverage', japanese: '活用する' },
      { english: 'deadline', japanese: '締め切り' },
      { english: 'stakeholder', japanese: '利害関係者' },
      { english: 'negotiate', japanese: '' },
      { english: 'follow up', japanese: '追って連絡する' },
    ])
  })

  it('訳のない行はコンマ区切りで1語ずつ。英語として読めない行は外して知らせる', () => {
    const { words, skipped } = parseWordList('apple, banana; cherry\n日本語だけ\n123\n')
    expect(words.map((w) => w.english)).toEqual(['apple', 'banana', 'cherry'])
    expect(skipped).toEqual(['日本語だけ', '123'])
  })
})

describe('単語の復習に加える', () => {
  const setup = async () => {
    const d = new EigoDB(`mywords-${Math.random()}`)
    await d.items.bulkPut([
      { id: 'n1', kind: 'word', english: 'study', japanese: '勉強する', forms: ['study', 'studies', 'studied'], examples: [], ngslRank: 100 },
      { id: 'n2', kind: 'word', english: 'deadline', japanese: '締め切り', forms: ['deadline'], examples: [], ngslRank: 2000 },
    ])
    await d.cards.add({ itemId: 'n2', fsrs: {} as never, due: 0, introducedAt: 0 })
    return d
  }

  it('単語集の語（活用形でも探す）・復習中の語・新しく作る語に分ける', async () => {
    const d = await setup()
    const rows = await planWords([{ english: 'studies', japanese: '' }, { english: 'deadline', japanese: '' }, { english: 'resilient', japanese: '立ち直りが早い' }], d)
    expect(rows.map((r) => [r.kind, r.itemId])).toEqual([['listed', 'n1'], ['reviewing', 'n2'], ['custom', 'my:resilient']])
  })

  it('加えるとカードができ、自分の語は items と一覧に残る。訳のない新しい語は加えない', async () => {
    const d = await setup()
    await d.knownWords.put({ itemId: 'n1', source: 'self', at: 0 })
    const rows = await planWords([
      { english: 'study', japanese: '学ぶ' },
      { english: 'resilient', japanese: '立ち直りが早い' },
      { english: 'synergy', japanese: '' },
      { english: 'deadline', japanese: '' },
    ], d)
    expect(await addWords(rows, 1000, d)).toBe(2)
    expect((await d.cards.toArray()).map((c) => c.itemId).sort()).toEqual(['my:resilient', 'n1', 'n2'])
    expect(await d.knownWords.get('n1')).toBeUndefined()
    expect((await d.edits.get('n1'))?.ja).toBe('学ぶ')
    expect((await d.items.get('my:resilient'))?.japanese).toBe('立ち直りが早い')
    expect((await d.myWords.toArray()).map((w) => w.itemId).sort()).toEqual(['my:resilient', 'n1', 'n2'])
  })

  it('items を消しても起動時に作り直す。外すとカードと一覧から消える', async () => {
    const d = await setup()
    await addWords(await planWords([{ english: 'resilient', japanese: '立ち直りが早い' }], d), 1000, d)
    await d.items.delete('my:resilient')
    await syncMyWordItems(d)
    expect((await d.items.get('my:resilient'))?.english).toBe('resilient')
    await removeMyWord('my:resilient', d)
    expect(await d.cards.where('itemId').equals('my:resilient').count()).toBe(0)
    expect(await d.myWords.get('my:resilient')).toBeUndefined()
  })
})
