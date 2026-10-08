import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { EigoDB } from '../db/schema'
import { hiddenIdiomIds, hideIdiom, idiomVisible, unhideIdiom, type Idiom, type IdiomData } from './idioms'

const base: Idiom = {
  id: 'idiom-set-up', rank: 1, en: 'set up', ja: '設立する', type: '句動詞', sense: 1, senseCount: 2, typeRank: 1, basic: false,
  gloss: '', wiktionary: '', read: 15, matched: 10, perMillion: 10, stars: 3, scenes: ['どちらでも'], ex: [], needsCheck: false, checkReasons: [],
}
const opts = { hidden: new Set<string>(), showUnverified: false, focus: 'all' as const }

describe('熟語の出題の絞り込み', () => {
  it('「もう知っている」で外したものと要確認のものは出さない', () => {
    expect(idiomVisible(base, opts)).toBe(true)
    expect(idiomVisible(base, { ...opts, hidden: new Set([base.id]) })).toBe(false)
    expect(idiomVisible({ ...base, needsCheck: true }, opts)).toBe(false)
    expect(idiomVisible({ ...base, needsCheck: true }, { ...opts, showUnverified: true })).toBe(true)
  })

  it('「ビジネス向きだけ」ではビジネス向きの札のものだけ出す', () => {
    expect(idiomVisible(base, { ...opts, focus: 'business' })).toBe(false)
    expect(idiomVisible({ ...base, scenes: ['会話向き', 'ビジネス向き'] }, { ...opts, focus: 'business' })).toBe(true)
  })

  it('外したものは後から戻せる', async () => {
    const database = new EigoDB('idioms-hidden')
    await hideIdiom('idiom-set-up', database)
    expect([...(await hiddenIdiomIds(database))]).toEqual(['idiom-set-up'])
    await unhideIdiom('idiom-set-up', database)
    expect((await hiddenIdiomIds(database)).size).toBe(0)
  })
})

describe('熟語のデータ（public/data/idioms.json）', () => {
  const data = JSON.parse(readFileSync('public/data/idioms.json', 'utf8')) as IdiomData

  it('句動詞・熟語・決まり文句を100個ずつ、意味は1見出し3つまで', () => {
    const heads = new Map<string, Set<number>>()
    for (const d of data.items) {
      const k = `${d.type}|${d.en}`
      heads.set(k, (heads.get(k) ?? new Set()).add(d.sense))
    }
    const byType = new Map<string, number>()
    for (const k of heads.keys()) byType.set(k.split('|')[0], (byType.get(k.split('|')[0]) ?? 0) + 1)
    expect([...byType.values()]).toEqual([100, 100, 100])
    for (const s of heads.values()) expect(s.size).toBeLessThanOrEqual(3)
  })

  it('どのカードにも札と根拠（何文中何文）がある', () => {
    for (const d of data.items) {
      expect(d.scenes.length).toBeGreaterThan(0)
      expect(d.matched).toBeGreaterThan(0)
      expect(d.matched).toBeLessThanOrEqual(d.read)
    }
    expect(new Set(data.items.map((d) => d.id)).size).toBe(data.items.length)
  })

  it('「ビジネス向き」と「仕事では避ける」が同じカードに付かない', () => {
    for (const d of data.items) expect(d.scenes.includes('ビジネス向き') && d.scenes.includes('仕事では避ける')).toBe(false)
  })
})
