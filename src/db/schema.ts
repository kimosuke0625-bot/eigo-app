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

/** 利用者による語の修正（日本語訳の書き直し、意訳として外した例文） */
export interface ItemEdit {
  itemId: string
  /** 書き直した日本語訳（なければ元の訳） */
  ja?: string
  /** 外した例文のキー（content/edits.ts の exampleKey） */
  hiddenExamples: string[]
  at: number
}

/** 知っている語（診断テストや「もう知っている」で登録） */
/** 書いた作文・話した音声日記（4週間ごとの測定の作文もここに残す） */
export interface JournalEntry {
  id?: number
  at: number
  day: string
  /** write：短い作文、diary：音声日記、assessment：測定の5分間作文 */
  kind: 'write' | 'diary' | 'assessment'
  /** 書いた英文、または音声日記を文字にしたもの */
  text: string
  /** 使うよう示した今日の語 */
  targets: string[]
  /** そのうち実際に使った語 */
  used: string[]
  words: number
  /** 使った語の種類の数 */
  types: number
  /** 音声日記の録音（recordings の id） */
  recordingId?: number
  prompt: string
}

export interface KnownWord {
  itemId: string
  source: 'diagnostic' | 'self'
  at: number
}

/** 利用者が貼り付けて取り込んだ素材（内蔵素材は public/data/materials.json） */
export interface Material {
  id: string
  title: string
  body: string
  hasAudio: boolean
  wordCount: number
  knownRatio?: number
  source: string
  license: string
  createdAt?: number
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
  /** 使った素材の id など */
  ref?: string
}

export interface Recording {
  id?: number
  /** 録音したときの練習の記録（sessions）の id。わからなければ 0 */
  sessionId: number
  audio: Blob
  /** Whisper で文字にした結果 */
  transcript?: string
  at: number
  /** shadowing（シャドーイング）・speech（4/3/2スピーチ）・pronunciation（発音） */
  kind: string
  /** 素材の id や話題など */
  ref: string
  /** 手本の英文（シャドーイング・発音） */
  text?: string
  /** 自己評価（0〜1） */
  self?: number
  /** 手本との一致率（0〜1、認識できたときだけ） */
  match?: number
  /** 録音の長さ（秒） */
  seconds?: number
  /** 4/3/2スピーチの回（1〜3） */
  round?: number
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

/**
 * 雑学の利用者ごとの状態。雑学の本文は public/data/facts.json にあり、ここには保存しない。
 * id は facts.json の id。
 */
export interface Fact {
  id: string
  category: string
  /** 図鑑に入った日時（未取得なら undefined） */
  acquiredAt?: number
  /** 取得した日の日付キー */
  acquiredDay?: string
  /** 「雑学の確認」で外したもの */
  excluded?: boolean
}

/** 毎日の語彙の記録（進捗グラフ用） */
export interface Snapshot {
  day: string
  /** FSRS の安定度が21日以上のカード数（定着した語彙） */
  mature: number
  /** カードの総数 */
  cards: number
  /** 知っている語として登録した数 */
  known: number
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
  /** 「もっと知りたい」を押した雑学の分野 */
  likedCategories: string[]
  /** 1日完了のトロフィー画面を出した日 */
  lastTrophyDay: string
  /** 自動で上がった Phase のお知らせ（0 = なし） */
  phaseNotice: number
  /** 多聴・多読で、内容確認の問いを聞く前に見る（true）か、後で見る（false） */
  questionsFirst: boolean
  /** 音声認識（Whisper）を使う。モデルの取得に同意したら true */
  asrEnabled: boolean
  /** 「この練習について」を一度見た練習 */
  helpSeen: string[]
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
  edits!: EntityTable<ItemEdit, 'itemId'>
  snapshots!: EntityTable<Snapshot, 'day'>
  journal!: EntityTable<JournalEntry, 'id'>

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
    // フェーズ2の追加：日本語訳の書き直しと例文の差し替え
    this.version(3).stores({
      edits: 'itemId',
    })
    // フェーズ3：毎日の語彙の記録、雑学の取得日
    this.version(4).stores({
      snapshots: 'day',
      facts: 'id, category, acquiredAt, acquiredDay',
    })
    // フェーズ5：録音を種類・素材ごとに引けるようにする
    this.version(5).stores({
      recordings: '++id, sessionId, kind, ref, at',
    })
    // フェーズ6：作文と音声日記
    this.version(6).stores({
      journal: '++id, at, day, kind',
    })
  }
}

/** 書き出しの対象。items は教材データから作り直せるので含めない */
export const TABLE_NAMES = [
  'cards', 'reviews', 'knownWords', 'edits', 'snapshots', 'journal', 'materials', 'sessions',
  'recordings', 'assessments', 'facts', 'rewards', 'settings',
] as const

export const db = new EigoDB()
