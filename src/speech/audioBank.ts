// 音声置き場（eigo-audio）の音声を使う。
// - 見出し語・カードの例文・雑学・名言は、PC で作った高品質な音声ファイルで再生する
// - 必要になったときに読み込み、一度聞いたものは端末（Cache Storage）に保存する
// - まだ作っていない英文は、端末の声で読み上げる
import { headKey, textKey } from './audioKey'
import { playUrl } from './clips'
import { speak } from './voices'

export type BankKind = 'heads' | 'ex' | 'facts' | 'quotes'

export const BANK_BASE = 'https://kimosuke0625-bot.github.io/eigo-audio/'
const CACHE = 'eigo-audio-v1'

type Index = Record<BankKind, Set<string>>
let indexPromise: Promise<Index> | null = null

/** 作成済みの音声の一覧（アプリを開くたびに最新を読む） */
export function loadBankIndex(): Promise<Index> {
  indexPromise ??= fetch(`${BANK_BASE}index.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((j: Partial<Record<BankKind, string[]>>) => ({
      heads: new Set(j.heads ?? []), ex: new Set(j.ex ?? []), facts: new Set(j.facts ?? []), quotes: new Set(j.quotes ?? []),
    }))
  return indexPromise
}
let indexNow: Index | null = null
void loadBankIndex().then((i) => { indexNow = i })

export interface BankRef { kind: BankKind; key: string }

export const bankRef = {
  head: (lemma: string): BankRef => ({ kind: 'heads', key: headKey(lemma) }),
  example: (en: string): BankRef => ({ kind: 'ex', key: textKey(en) }),
  fact: (id: string, easy: boolean): BankRef => ({ kind: 'facts', key: `${id}-${easy ? 'e' : 's'}` }),
  quote: (en: string): BankRef => ({ kind: 'quotes', key: textKey(en) }),
}

const urlOf = (r: BankRef) => `${BANK_BASE}${r.kind}/${r.key}.mp3`
/** 端末に保存済みで、すぐ再生できる音声（blob の URL） */
const ready = new Map<string, string>()

export function hasBank(r: BankRef): boolean {
  return !!indexNow?.[r.kind].has(r.key)
}

/** 音声を端末に用意する（保存済みならそこから、なければ取得して保存）。先回りして呼んでおくと、押した瞬間に鳴る */
export async function prepare(r: BankRef): Promise<void> {
  const url = urlOf(r)
  if (ready.has(url)) return
  const index = await loadBankIndex()
  if (!index[r.kind].has(r.key)) return
  try {
    let res: Response | undefined
    const cache = 'caches' in window ? await caches.open(CACHE) : undefined
    res = await cache?.match(url)
    if (!res) {
      const fetched = await fetch(url)
      if (!fetched.ok) return
      await cache?.put(url, fetched.clone())
      res = fetched
    }
    ready.set(url, URL.createObjectURL(await res.blob()))
  } catch {
    // 通信できないときなどは、その場で端末の声を使う
  }
}

/**
 * 英文を再生する。音声置き場にあればその音声、なければ端末の声。
 * 押した瞬間に呼ぶ（iPhone はタップの中でないと再生を始められないため、ここでは待たない）。
 */
export function playText(opts: { ref?: BankRef; text: string; voiceURI: string; rate?: number; onEnd?: () => void }): () => void {
  const rate = opts.rate ?? 1
  if (opts.ref && hasBank(opts.ref)) {
    const url = urlOf(opts.ref)
    const src = ready.get(url) ?? url
    // まだ端末に保存していなければ、次から速く鳴るよう裏で保存しておく
    if (!ready.has(url)) void prepare(opts.ref)
    return playUrl(src, rate, opts.onEnd)
  }
  speak(opts.text, opts.voiceURI, rate, opts.onEnd)
  return () => { if ('speechSynthesis' in window) speechSynthesis.cancel() }
}

/** 端末に保存した音声の量（設定画面で表示） */
export async function cachedSize(): Promise<{ files: number; bytes: number }> {
  if (!('caches' in window)) return { files: 0, bytes: 0 }
  const cache = await caches.open(CACHE)
  const keys = await cache.keys()
  let bytes = 0
  for (const k of keys) {
    const r = await cache.match(k)
    const len = Number(r?.headers.get('content-length') ?? 0)
    bytes += len || (r ? (await r.clone().blob()).size : 0)
  }
  return { files: keys.length, bytes }
}

export async function clearCache() {
  if ('caches' in window) await caches.delete(CACHE)
  for (const u of ready.values()) URL.revokeObjectURL(u)
  ready.clear()
}
