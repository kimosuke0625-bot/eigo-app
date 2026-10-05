import { expect, it } from 'vitest'
import { needsBackupReminder } from './backupReminder'

const DAY = 86400000
it('使い始めて1週間はバックアップ案内を出さない', () => {
  expect(needsBackupReminder({ createdAt: 0, lastBackupAt: 0 }, 6 * DAY)).toBe(false)
  expect(needsBackupReminder({ createdAt: 0, lastBackupAt: 0 }, 7 * DAY)).toBe(true)
  expect(needsBackupReminder({ createdAt: 0, lastBackupAt: 5 * DAY }, 10 * DAY)).toBe(false)
})
