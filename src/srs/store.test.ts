import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { getSettings, updateSettings } from '../db/settings'
import { rankLabel, syncBsl, syncItems, type NgslWord } from '../content/ngsl'
import { introduce, markKnown, nextNewItems, recordReview, todaysQueue } from './store'
import { Rating } from './fsrs'

const words: NgslWord[] = Array.from({ length: 30 }, (_, i) => ({
  id: `ngsl:w${i + 1}`, rank: i + 1, lemma: `w${i + 1}`, forms: [`w${i + 1}`], ja: '訳', def: 'def',
  ex: [{ en: `I like w${i + 1}.`, ja: '例' }],
}))

let n = 0
async function freshDb() {
  const database = new EigoDB(`store-${n++}`)
  await syncItems({ version: 1, words }, database)
  return database
}

describe('カードの保存と出題', () => {
  it('知っている語とカードにした語を飛ばして、順位の高い順に新しい語を出す', async () => {
    const database = await freshDb()
    await markKnown(['ngsl:w1', 'ngsl:w2'], 'diagnostic', 0, database)
    await introduce('ngsl:w3', 0, database)
    const next = await nextNewItems(3, database)
    expect(next.map((i) => i.id)).toEqual(['ngsl:w4', 'ngsl:w5', 'ngsl:w6'])
  })

  it('ビジネス語彙は初期設定では基本語のあと、「混ぜる」では3枚に1枚', async () => {
    const database = await freshDb()
    const biz: NgslWord[] = Array.from({ length: 5 }, (_, i) => ({ ...words[0], id: `bsl:b${i + 1}`, rank: i + 1, lemma: `b${i + 1}` }))
    await syncBsl({ version: 1, words: biz }, database)
    expect((await nextNewItems(32, database)).slice(28).map((i) => i.id)).toEqual(['ngsl:w29', 'ngsl:w30', 'bsl:b1', 'bsl:b2'])
    await updateSettings({ bslMode: 'mix' }, database)
    expect((await nextNewItems(6, database)).map((i) => i.id)).toEqual(['ngsl:w1', 'ngsl:w2', 'bsl:b1', 'ngsl:w3', 'ngsl:w4', 'bsl:b2'])
    expect(rankLabel((await database.items.get('bsl:b2'))!)).toBe('ビジネス 2位')
  })

  it('同じ語のカードは二重に作らない', async () => {
    const database = await freshDb()
    await introduce('ngsl:w1', 0, database)
    await introduce('ngsl:w1', 0, database)
    expect(await database.cards.count()).toBe(1)
  })

  it('評価すると期日が進み、記録が残る', async () => {
    const database = await freshDb()
    const now = Date.now()
    await introduce('ngsl:w1', now, database)
    const [c] = await todaysQueue('word', now, database)
    const updated = await recordReview(c, Rating.Good, { answerMs: 1200, mode: 'word', now }, database)
    expect(updated.due).toBeGreaterThan(now)
    const [r] = await database.reviews.toArray()
    expect(r).toMatchObject({ cardId: c.id, rating: Rating.Good, state: 0, answerMs: 1200, mode: 'word' })
  })

  it('語彙データは版が変わったときだけ入れ直す', async () => {
    const database = await freshDb()
    expect(await database.items.count()).toBe(30)
    expect((await getSettings(database)).contentVersion).toBe(1)
  })
})

describe('データベースの更新（フェーズ1 → 2）', () => {
  it('フェーズ1の設定と記録を保ったまま新しい表を追加する', async () => {
    const name = 'upgrade-test'
    const v1 = new Dexie(name)
    v1.version(1).stores({
      items: 'id, kind, ngslRank', cards: '++id, itemId, due', reviews: '++id, cardId, at', materials: 'id',
      sessions: '++id, at, day, kind, pillar', recordings: '++id, sessionId', assessments: '++id, at',
      facts: 'id, category, acquiredAt', rewards: '++id, kind, key', settings: 'key',
    })
    await v1.table('settings').put({ key: 'main', cue: 'フェーズ1の一文', onboarded: true })
    await v1.table('sessions').add({ at: 1, day: '2026-10-06', kind: 'x', pillar: 'input', seconds: 60 })
    v1.close()

    const v2 = new EigoDB(name)
    const s = await getSettings(v2)
    expect(s.cue).toBe('フェーズ1の一文')
    expect(s.reviewCap).toBe(150)
    expect(s.diagnosedAt).toBe(0)
    expect(await v2.sessions.count()).toBe(1)
    await updateSettings({ diagnosedAt: 5 }, v2)
    await v2.knownWords.put({ itemId: 'a', source: 'self', at: 0 })
    expect(await v2.knownWords.count()).toBe(1)
  })
})
