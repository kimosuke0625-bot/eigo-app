import { db, TABLE_NAMES, type EigoDB } from './schema'

export const BACKUP_FORMAT = 'eigo-backup'
export const BACKUP_VERSION = 1

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: number
  tables: Record<string, unknown[]>
}

interface EncodedBlob {
  __blob: string
  type: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// 録音（Blob）を JSON に入れられる形に変換する
async function encode(value: unknown): Promise<unknown> {
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer())
    return { __blob: bytesToBase64(bytes), type: value.type } satisfies EncodedBlob
  }
  if (Array.isArray(value)) return Promise.all(value.map(encode))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = await encode(v)
    return out
  }
  return value
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.__blob === 'string' && typeof obj.type === 'string') {
      return new Blob([base64ToBytes(obj.__blob)], { type: obj.type })
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) out[k] = decode(v)
    return out
  }
  return value
}

export async function exportAll(database: EigoDB = db): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {}
  for (const name of TABLE_NAMES) {
    const rows = await database.table(name).toArray()
    tables[name] = (await encode(rows)) as unknown[]
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: Date.now(), tables }
}

export function parseBackup(text: string): BackupFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('ファイルを読み取れませんでした（JSON形式ではありません）')
  }
  const file = data as Partial<BackupFile>
  if (file.format !== BACKUP_FORMAT || typeof file.tables !== 'object' || !file.tables) {
    throw new Error('このアプリのバックアップファイルではありません')
  }
  if ((file.version ?? 0) > BACKUP_VERSION) {
    throw new Error('新しい版のアプリで作られたファイルです。アプリを更新してください')
  }
  return file as BackupFile
}

/** 端末内のデータをすべてバックアップの内容に置き換える */
export async function importAll(file: BackupFile, database: EigoDB = db) {
  const tables = TABLE_NAMES.map((n) => database.table(n))
  await database.transaction('rw', tables, async () => {
    for (const name of TABLE_NAMES) {
      const table = database.table(name)
      await table.clear()
      const rows = file.tables[name]
      if (Array.isArray(rows) && rows.length) await table.bulkPut(decode(rows) as object[])
    }
  })
}

export function backupFileName(date = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `eigo-backup-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}.json`
}
