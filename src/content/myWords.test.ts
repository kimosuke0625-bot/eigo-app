import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { addWords, idiomKey, parseWordList, planWords, removeMyWord, switchDeck, syncMyWordItems } from './myWords'

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

  it('熟語の「〜」の印や（ ）の書き方も読み取る', () => {
    const { words, skipped } = parseWordList('look forward to ~ - 楽しみにする\ntake care of 〜\nget used to (doing)')
    expect(words.map((w) => w.english)).toEqual(['look forward to', 'take care of', 'get used to (doing)'])
    expect(skipped).toEqual([])
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
    expect(await addWords(rows, 1000, d)).toEqual({ word: 2, expr: 0 })
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

describe('熟語・表現を見分けて分ける', () => {
  const setup = async () => {
    const d = new EigoDB(`mywords-idiom-${Math.random()}`)
    await d.items.bulkPut([
      { id: 'n1', kind: 'word', english: 'deadline', japanese: '締め切り', forms: ['deadline'], examples: [], ngslRank: 2000 },
      { id: 'idiom-look-forward-to', kind: 'chunk', english: 'look forward to', japanese: '楽しみにする', forms: ['look forward to'], examples: [] },
      { id: 'idiom-change-ones-mind', kind: 'chunk', english: "change one's mind", japanese: '気が変わる', forms: [], examples: [] },
      { id: 'idiom-all-right', kind: 'chunk', english: 'all right', japanese: '大丈夫', forms: [], examples: [] },
      { id: 'idiom-all-right--2', kind: 'chunk', english: 'all right', japanese: '申し分ない', forms: [], examples: [] },
    ])
    return d
  }

  it('熟語の見出しは ~ や（ ）・sb・my などの書き方の違いを問わずに比べる', () => {
    expect(idiomKey('Look forward to ~')).toBe('look forward to')
    expect(idiomKey('look forward to (doing)')).toBe('look forward to')
    expect(idiomKey('change my mind')).toBe("change one's mind")
    expect(idiomKey('take care of sb')).toBe('take care of')
  })

  it('熟語集・単語集・2語以上の新しい表現・1語の新しい単語に分ける', async () => {
    const d = await setup()
    const rows = await planWords([
      { english: 'look forward to ~', japanese: '' },
      { english: 'change my mind', japanese: '' },
      { english: 'all right', japanese: '' },
      { english: 'deadline', japanese: '' },
      { english: 'touch base', japanese: '連絡を取る' },
      { english: 'synergy', japanese: '相乗効果' },
    ], d)
    expect(rows.map((r) => [r.kind, r.deck, r.itemId])).toEqual([
      ['idiom', 'expr', 'idiom-look-forward-to'],
      ['idiom', 'expr', 'idiom-change-ones-mind'],
      ['idiom', 'expr', 'idiom-all-right'],
      ['listed', 'word', 'n1'],
      ['phrase', 'expr', ''],
      ['custom', 'word', 'my:synergy'],
    ])
    // 新しく作るものは、単語と表現を入れ替えられる
    expect(switchDeck(rows[5]).deck).toBe('expr')
    expect(switchDeck(rows[4])).toMatchObject({ kind: 'custom', deck: 'word', itemId: 'my:touch base' })
    expect(switchDeck(rows[0])).toBe(rows[0])
  })

  it('熟語はそのカードを、新しい表現は旅の手帳に入れてカードを作る。「もう知っている」にした熟語も戻す', async () => {
    const d = await setup()
    await d.hiddenItems.put({ itemId: 'idiom-look-forward-to', reason: 'known', at: 0 })
    const rows = await planWords([{ english: 'look forward to', japanese: '' }, { english: 'touch base', japanese: '連絡を取る' }, { english: 'circle back', japanese: '' }], d)
    expect(await addWords(rows, 1000, d)).toEqual({ word: 0, expr: 2 })
    expect(await d.hiddenItems.get('idiom-look-forward-to')).toBeUndefined()
    const p = (await d.phrases.toArray())[0]
    expect(p).toMatchObject({ expression: 'touch base', meaning: '連絡を取る', scene: '自分のリスト' })
    const ids = (await d.cards.toArray()).map((c) => c.itemId).sort()
    expect(ids).toEqual(['idiom-look-forward-to', `phrase-${p.id}`])
    // 外すと、このリストから入れた表現は旅の手帳からも消える
    await removeMyWord(`phrase-${p.id}`, d)
    expect(await d.phrases.count()).toBe(0)
  })
})
