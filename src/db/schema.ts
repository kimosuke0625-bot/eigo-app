import Dexie, { type EntityTable } from 'dexie'

// 4つの柱（Nation）
export type Pillar = 'input' | 'output' | 'language' | 'fluency'

export type ItemKind = 'word' | 'chunk' | 'minimalPair'

export interface Example {
  en: string
  ja: string
  /** Tatoeba の文番号（このアプリで作成した例文にはない） */
  enId?: number
  jaId?: number
}

export interface Item {
  id: string
  kind: ItemKind
  english: string
  japanese?: string
  /** やさしい英語の定義（Phase 3 以降で表示） */
  definition?: string
  /** 活用形（例文中の語を強調するのに使う） */
  forms?: string[]
  examples: Example[]
  ngslRank?: number
}

/** ts-fsrs の Card を日時を数値にして保存した形 */
export interface StoredFsrs {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review?: number
}

export interface Card {
  id?: number
  itemId: string
  fsrs: StoredFsrs
  due: number
  /** 覚え始めた日時（翌朝の確認テストに使う） */
  introducedAt: number
}

export interface Review {
  id?: number
  cardId: number
  at: number
  rating: number
  /** 評価する前のカードの状態（0 新規・1 学習中・2 復習・3 再学習） */
  state: number
  answerMs: number
  /** 出題の形（単語・例文・聞き取り） */
  mode: string
}

/** 知っている語（診断テストや「もう知っている」で登録） */
export interface KnownWord {
  itemId: string
  source: 'diagnostic' | 'self'
  at: number
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
  /** diagnostic = 初回の診断テスト、periodic = 4週間ごとの測定 */
  kind: 'diagnostic' | 'periodic'
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
  /** 診断テストを受けた日時（0 = 未受験） */
  diagnosedAt: number
  /** 1日に復習するカードの上限（長く休んだ後に一度に戻さないため） */
  reviewCap: number
  /** 取り込み済みの語彙データの版 */
  contentVersion: number
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
  knownWords!: EntityTable<KnownWord, 'itemId'>

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
    // フェーズ2：復習カード。1語につきカードは1枚、知っている語の表を追加
    this.version(2).stores({
      cards: '++id, &itemId, due, introducedAt',
      reviews: '++id, cardId, at',
      knownWords: 'itemId, source',
    })
  }
}

/** 書き出しの対象。items は教材データから作り直せるので含めない */
export const TABLE_NAMES = [
  'cards', 'reviews', 'knownWords', 'materials', 'sessions',
  'recordings', 'assessments', 'facts', 'rewards', 'settings',
] as const

export const db = new EigoDB()
