import { describe, expect, it } from 'vitest'
import { EigoDB } from '../db/schema'
import { exportAll } from '../db/backup'
import { textKey } from './audioKey'
import { importMyAudio, mineUrl, prepareMine } from './myAudio'

describe('自分の音声（旅の手帳）', () => {
  it('PC で作ったファイルを読み込み、英文から音声を引ける。バックアップには入れない', async () => {
    const database = new EigoDB('my-audio-1')
    const text = 'grab a bite'
    const file = JSON.stringify({ format: 'eigo-my-audio', version: 1, createdAt: 0, clips: [{ key: textKey(text), text, mp3: btoa('ID3fake') }] })
    expect(await importMyAudio(file, database)).toBe(1)
    expect(await database.myAudio.count()).toBe(1)
    await prepareMine('Grab  a bite', database)
    expect(mineUrl('grab a bite')).toBeUndefined() // 大文字と小文字は区別する（鍵は英文そのもの）
    await prepareMine(text, database)
    expect(mineUrl(text)).toMatch(/^blob:/)
    const backup = await exportAll(database)
    expect(backup.tables.myAudio).toBeUndefined()
  })

  it('違うファイルは読み込まない', async () => {
    const database = new EigoDB('my-audio-2')
    await expect(importMyAudio('{"format":"eigo-backup"}', database)).rejects.toThrow('自分の音声')
    await expect(importMyAudio('not json', database)).rejects.toThrow('JSON')
  })
})
