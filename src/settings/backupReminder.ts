import type { Settings } from '../db/schema'

const WEEK = 7 * 24 * 60 * 60 * 1000

/** 使い始めて1週間たち、最後のバックアップから1週間以上あいていれば案内する */
export function needsBackupReminder(s: Pick<Settings, 'createdAt' | 'lastBackupAt'>, now = Date.now()) {
  if (now - s.createdAt < WEEK) return false
  return now - s.lastBackupAt >= WEEK
}
