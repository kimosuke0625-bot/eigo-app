import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Phrase } from '../db/schema'
import { choosePhrases, topWeakTypes } from './store'
import { prepareMine } from '../speech/myAudio'

/** 弱点の研究の上位3つ（依頼文の「重点的に見てほしい点」） */
export function useWeakFocus(): string[] {
  return useLiveQuery(() => topWeakTypes(3), [], [] as string[])
}

/** 今日使ってみる表現（画面を開いたときに3つ選び、その間は変えない） */
export function useTodayPhrases(n = 3): Phrase[] | null {
  const [list, setList] = useState<Phrase[] | null>(null)
  useEffect(() => {
    void db.phrases.toArray().then((all) => {
      const chosen = choosePhrases(all, n)
      // 押した瞬間に鳴らせるよう、自分の音声（あれば）を先に用意する
      for (const p of chosen) void prepareMine(p.expression)
      setList(chosen)
    })
  }, [n])
  return list
}
