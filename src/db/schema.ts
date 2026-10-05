import Dexie, { type EntityTable } from 'dexie'

// 4つの柱（Nation）
export type Pillar = 'input' | 'output' | 'language' | 'fluency'

export type ItemKind = 'word' | 'chunk' | 'minimalPair'

export interface Item {
  id: string
  kind: ItemKind
  english: string
  japanese?: string
  examples: string[]
  ngslRank?: number
}

export interface Card {
  id?: number
  itemId: string
  /** ts-fsrs の Card 状態をそのまま保存する（フェーズ2で使用） */
  fsrs: Record<string, unknown>
  due: number
  phaseFormat: 1 | 2 | 3 | 4
}

export interface Review {
  id?: number
  cardId: number
  at: number
  rating: number
  answerMs: number
}

export interface Material {
  id: string
  title: string
  body: string
  hasAudio: boolean
  wordCount: number
  knownRatio?: number
  source: string
  license: string
}

export interface Session {
  id?: number
  at: number
  /** 日付キー（YYYY-MM-DD、端末の現地時間） */
  day: string
  kind: string
  pillar: Pillar
  seconds: number
  result?: Record<string, number>
}

export interface Recording {
  id?: number
  sessionId: number
  audio: Blob
  transcript?: string
}

export interface Assessment {
  id?: number
  at: number
  vocabSize?: number
  dictation?: number
  readingWpm?: number
  readingAccuracy?: number
  speakingWpm?: number
  writingWords?: number
  writingTypes?: number
}

export interface Fact {
  id: string
  category: string
  englishEasy: string
  englishStandard: string
  japanese: string
  source: string
  rarity: 'common' | 'rare'
  series?: string
  acquiredAt?: number
}

export interface Reward {
  id?: number
  kind: 'title' | 'theme' | 'soundSet'
  key: string
  acquiredAt: number
}

export type EffectsLevel = 'low' | 'medium' | 'high'
export type ThemeMode = 'system' | 'light' | 'dark'
export type BlockId = 'morning' | 'noon' | 'night'

export interface Settings {
  key: 'main'
  onboarded: boolean
  targetMinutes: number
  /** FSRS の目標定着率（0.85〜0.95） */
  retention: number
  /** if-then プランの一文 */
  cue: string
  phase: 1 | 2 | 3 | 4
  phaseAuto: boolean
  effects: EffectsLevel
  sound: boolean
  theme: ThemeMode
  voiceURI: string
  blockOrder: BlockId[]
  /** 朝ブロックが終わる時刻（時） */
  morningEnd: number
  /** 昼ブロックが終わる時刻（時） */
  noonEnd: number
  /** お休み券を使った日付キー */
  restDays: string[]
  lastBackupAt: number
  createdAt: number
}

export class EigoDB extends Dexie {
  items!: EntityTable<Item, 'id'>
  cards!: EntityTable<Card, 'id'>
  reviews!: EntityTable<Review, 'id'>
  materials!: EntityTable<Material, 'id'>
  sessions!: EntityTable<Session, 'id'>
  recordings!: EntityTable<Recording, 'id'>
  assessments!: EntityTable<Assessment, 'id'>
  facts!: EntityTable<Fact, 'id'>
  rewards!: EntityTable<Reward, 'id'>
  settings!: EntityTable<Settings, 'key'>

  constructor(name = 'eigo') {
    super(name)
    this.version(1).stores({
      items: 'id, kind, ngslRank',
      cards: '++id, itemId, due',
      reviews: '++id, cardId, at',
      materials: 'id',
      sessions: '++id, at, day, kind, pillar',
      recordings: '++id, sessionId',
      assessments: '++id, at',
      facts: 'id, category, acquiredAt',
      rewards: '++id, kind, key',
      settings: 'key',
    })
  }
}

export const TABLE_NAMES = [
  'items', 'cards', 'reviews', 'materials', 'sessions',
  'recordings', 'assessments', 'facts', 'rewards', 'settings',
] as const

export const db = new EigoDB()
