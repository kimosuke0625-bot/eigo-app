import { describe, expect, it } from 'vitest'
import { EigoDB, type Item } from '../db/schema'
import { exportAll, importAll, parseBackup } from '../db/backup'
import { applyEdit, exampleKey, hideExample, restoreExamples, saveGloss } from './edits'

const item: Item = {
  id: 'ngsl:learn', kind: 'word', english: 'learn', japanese: '学ぶ', examples: [
    { en: 'A', ja: 'あ', enId: 1 }, { en: 'B', ja: 'い', enId: 2 }, { en: 'C', ja: 'う', enId: 3 }, { en: 'D', ja: 'え' },
  ],
}

describe('日本語訳の書き直しと例文の差し替え', () => {
  it('書き直した訳を表示し、空にすると元に戻る', async () => {
    const database = new EigoDB('edits-1')
    await saveGloss(item.id, ' 習得する ', database)
    expect(applyEdit(item, await database.edits.get(item.id)).japanese).toBe('習得する')
    await saveGloss(item.id, '', database)
    expect(applyEdit(item, await database.edits.get(item.id)).japanese).toBe('学ぶ')
  })

  it('外した例文の代わりに控えが繰り上がり、元にも戻せる', async () => {
    const database = new EigoDB('edits-2')
    await hideExample(item.id, item.examples[0], database)
    await hideExample(item.id, item.examples[3], database)
    const edited = applyEdit(item, await database.edits.get(item.id))
    expect(edited.examples.map((e) => e.en)).toEqual(['B', 'C'])
    expect(exampleKey(item.examples[3])).toBe('o:D')
    await restoreExamples(item.id, database)
    expect(applyEdit(item, await database.edits.get(item.id)).examples).toHaveLength(4)
  })

  it('修正は書き出しファイルに含まれ、読み込むと戻る', async () => {
    const a = new EigoDB('edits-3')
    await saveGloss(item.id, '身につける', a)
    await hideExample(item.id, item.examples[1], a)
    const b = new EigoDB('edits-4')
    await importAll(parseBackup(JSON.stringify(await exportAll(a))), b)
    const edited = applyEdit(item, await b.edits.get(item.id))
    expect(edited.japanese).toBe('身につける')
    expect(edited.examples.map((e) => e.en)).toEqual(['A', 'C', 'D'])
  })
})
