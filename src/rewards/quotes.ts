import { useEffect, useState } from 'react'

export interface Quote {
  emoji: string
  ja: string
  en: string
  author: string
  authorEn: string
  /** 広く伝えられているが原典を確認できていない */
  attributed?: boolean
}

export function useQuotes(): Quote[] {
  const [quotes, setQuotes] = useState<Quote[]>([])
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/quotes.json`)
      .then((r) => r.json() as Promise<{ quotes: Quote[] }>)
      .then((d) => setQuotes(d.quotes), () => {})
  }, [])
  return quotes
}

/** 日付から名言を1つ選ぶ（同じ日は同じ名言） */
export function quoteForDay(quotes: Quote[], day: string): Quote | undefined {
  if (!quotes.length) return undefined
  let h = 0
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return quotes[h % quotes.length]
}
