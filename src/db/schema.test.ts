import { describe, expect, it } from 'vitest'
import { EigoDB } from './schema'

describe('データベースの索引', () => {
  it('アプリで where() に使う項目には索引がある', async () => {
    const database = new EigoDB('index-check')
    await database.open()
    // where() で引いている表と項目（増やしたらここにも足す）
    const used: [string, string][] = [
      ['assessments', 'kind'], ['recordings', 'kind'], ['sessions', 'day'], ['sessions', 'kind'],
      ['cards', 'due'], ['cards', 'itemId'], ['cards', 'introducedAt'], ['reviews', 'at'],
      ['facts', 'acquiredDay'], ['journal', 'day'], ['items', 'ngslRank'], ['sessions', 'at'], ['rewards', 'kind'],
    ]
    for (const [table, field] of used) {
      const schema = database.table(table).schema
      const indexed = schema.primKey.name === field || schema.indexes.some((i) => i.name === field)
      expect(indexed, `${table}.${field}`).toBe(true)
    }
  })
})
