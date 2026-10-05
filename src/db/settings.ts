import { useLiveQuery } from 'dexie-react-hooks'
import { db, type EigoDB, type Settings } from './schema'

export function defaultSettings(now = Date.now()): Settings {
  return {
    key: 'main',
    onboarded: false,
    targetMinutes: 60,
    retention: 0.9,
    cue: '',
    phase: 1,
    phaseAuto: true,
    effects: 'medium',
    sound: true,
    theme: 'system',
    voiceURI: '',
    blockOrder: ['morning', 'noon', 'night'],
    morningEnd: 11,
    noonEnd: 17,
    restDays: [],
    lastBackupAt: 0,
    createdAt: now,
    diagnosedAt: 0,
    reviewCap: 150,
    contentVersion: 0,
    likedCategories: [],
    lastTrophyDay: '',
    phaseNotice: 0,
    questionsFirst: true,
    asrEnabled: false,
  }
}

export async function getSettings(database: EigoDB = db): Promise<Settings> {
  const saved = await database.settings.get('main')
  // 後から項目が増えても古いデータで壊れないよう既定値と合成する
  return { ...defaultSettings(), ...saved }
}

export async function updateSettings(patch: Partial<Settings>, database: EigoDB = db) {
  const current = await getSettings(database)
  await database.settings.put({ ...current, ...patch, key: 'main' })
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => getSettings())
}
