import { describe, expect, it } from 'vitest'
import { EigoDB } from './schema'
import { exportAll, importAll, parseBackup } from './backup'
import { getSettings, updateSettings } from './settings'

describe('書き出しと読み込み', () => {
  it('録音を含めて往復できる', async () => {
    const a = new EigoDB('a')
    await updateSettings({ cue: 'テスト', targetMinutes: 45 }, a)
    await a.sessions.add({ at: 1, day: '2026-10-06', kind: 'review', pillar: 'language', seconds: 300 })
    await a.recordings.add({ sessionId: 1, audio: new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'audio/webm' }) })

    const text = JSON.stringify(await exportAll(a))

    const b = new EigoDB('b')
    await b.sessions.add({ at: 9, day: '2026-01-01', kind: 'x', pillar: 'input', seconds: 1 })
    await importAll(parseBackup(text), b)

    expect((await getSettings(b)).cue).toBe('テスト')
    expect(await b.sessions.count()).toBe(1)
    const rec = (await b.recordings.toArray())[0]
    expect(rec.audio.type).toBe('audio/webm')
    expect([...new Uint8Array(await rec.audio.arrayBuffer())]).toEqual([1, 2, 3, 250])
  })

  it('別のファイルは読み込まない', () => {
    expect(() => parseBackup('not json')).toThrow()
    expect(() => parseBackup('{"format":"other"}')).toThrow('このアプリのバックアップファイルではありません')
  })
})
