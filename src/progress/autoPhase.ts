import { db, type EigoDB } from '../db/schema'
import { getSettings, updateSettings } from '../db/settings'
import { addDays } from '../habit/streak'
import { dayKey } from '../today/menu'
import { PHASE_LISTENING_KEY, suggestPhase, writeSnapshot } from './stats'

/**
 * 起動時に今日の語彙を記録し、Phase の自動切り替えを判断する（自動切り替えが有効なときだけ）。
 * 上がったときは phaseNotice に新しい Phase を入れ、今日の画面でお知らせする。
 */
export async function checkPhase(database: EigoDB = db, today = dayKey()) {
  const snap = await writeSnapshot(database, today)
  const s = await getSettings(database)
  if (!s.phaseAuto) return
  const since = addDays(today, -28)
  const values = (await database.sessions.where('day').aboveOrEqual(since).toArray())
    .map((x) => x.result?.[PHASE_LISTENING_KEY])
    .filter((v): v is number => typeof v === 'number')
  const listening = values.length >= 3 ? values.reduce((a, b) => a + b, 0) / values.length : null
  const next = suggestPhase({ vocab: snap.known + snap.mature, listening, current: s.phase })
  if (next !== s.phase) await updateSettings({ phase: next, phaseNotice: next }, database)
}
