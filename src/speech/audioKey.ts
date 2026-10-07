// 英文から音声ファイルの名前を決める。PC の作成スクリプトとアプリで同じ計算をする。
// （ファイル名の一覧を持たなくても、英文さえ分かればファイルの場所が決まる）

/** 比べやすいように空白をそろえる */
export function normalizeText(text: string): string {
  return text.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
}

/** 53ビットのハッシュ（cyrb53）。約1万文で重なる心配はほぼない */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** 英文の音声ファイルの鍵 */
export function textKey(text: string): string {
  return cyrb53(normalizeText(text)).toString(36)
}

/** 見出し語のファイル名に使える形（英字以外を _ にする） */
export function headKey(lemma: string): string {
  return lemma.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

/** 声は6種類。英文ごとに決まった声を割り当て、全体で声がまんべんなく出るようにする */
export function voiceIndex(key: string, voices: number): number {
  const n = parseInt(key.slice(-4), 36)
  if (Number.isFinite(n) && n >= 0) return n % voices
  // 連続ものの雑学（s01-1-e など）は末尾に「-」が入って負の数になるので、英数字だけで計算する
  return (parseInt(key.replace(/[^0-9a-z]/gi, '').slice(-4), 36) || 0) % voices
}
