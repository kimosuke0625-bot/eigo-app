import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isAccepted, normalizeAnswer, shuffledTokens, type GrammarData } from './grammar'
import { deckOf } from '../srs/deck'
import { BASE_MENU, BASE_TOTAL } from '../today/menu'

describe('文法の答え合わせ', () => {
  it('大文字小文字・記号・アポストロフィの種類は問わない', () => {
    expect(normalizeAnswer("  He’s  busy. ")).toBe("he's busy")
    expect(isAccepted('where does he live', ['Where does he live?'])).toBe(true)
    expect(isAccepted('WE’RE FROM JAPAN', ['We are from Japan.', "We're from Japan."])).toBe(true)
  })

  it('用意していない答えは正解にしない（語や短縮形の違いは区別する）', () => {
    expect(isAccepted("He's busy.", ['He is busy.'])).toBe(false)
    expect(isAccepted('Where he lives?', ['Where does he live?'])).toBe(false)
    expect(isAccepted('', ['a'])).toBe(false)
  })

  it('並べ替えの語は毎回同じ順に混ぜ、答えの順のままにしない', () => {
    const t = ['Where', 'do', 'you', 'work']
    expect(shuffledTokens('gram-g05-4', t)).toEqual(shuffledTokens('gram-g05-4', t))
    expect(shuffledTokens('gram-g05-4', t).join(' ')).not.toBe(t.join(' '))
    expect([...shuffledTokens('gram-g05-4', t)].sort()).toEqual([...t].sort())
  })
})

describe('文法のデータ（public/data/grammar.json）', () => {
  const data = JSON.parse(readFileSync('public/data/grammar.json', 'utf8')) as GrammarData

  it('中学レベルの45項目（g01〜g45）、高校の19項目（h01〜h19）、CEFR-J の項目（c01〜）の順。どの項目も4種類の問題があり、最後は口頭で即答、自分のことを1文の課題がある', () => {
    const ids = data.items.map((x) => x.id)
    expect(ids.slice(0, 45)).toEqual(Array.from({ length: 45 }, (_, i) => `g${String(i + 1).padStart(2, '0')}`))
    expect(ids.slice(45, 64)).toEqual(Array.from({ length: 19 }, (_, i) => `h${String(i + 1).padStart(2, '0')}`))
    expect(ids.slice(64)).toEqual(Array.from({ length: ids.length - 64 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`))
    expect(data.items.map((x) => x.no)).toEqual(ids.map((_, i) => i + 1))
    for (const it of data.items) {
      expect(new Set(it.exercises.map((x) => x.type))).toEqual(new Set(['fill', 'order', 'rewrite', 'oral']))
      expect(it.exercises.at(-1)?.type).toBe('oral')
      expect(it.myself.task).not.toBe('')
      expect(it.sources.length).toBeGreaterThan(0)
    }
  })

  it('問題の id は文法の束に入り、重ならない', () => {
    const ids = data.items.flatMap((it) => it.exercises.map((x) => x.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => deckOf(id) === 'gram')).toBe(true)
  })

  it('並べ替えの認める答えは、示す語をちょうど使う。穴埋めの答えは選択肢にある', () => {
    const words = (s: string) => normalizeAnswer(s).split(' ').sort().join(' ')
    for (const it of data.items) for (const x of it.exercises) {
      if (x.type === 'order') for (const a of x.answers) expect(words(a)).toBe(words(x.tokens.join(' ')))
      if (x.type === 'fill') for (const a of x.answers) expect(x.choices).toContain(a)
    }
  })

  it('✕ には解説と辞書の確かめた記録があり、△（正式な場面では避ける・意味が違う）と分けてある', () => {
    for (const it of data.items) for (const m of it.mistakes) {
      if (m.kind === 'error') {
        expect(m.proof.kaisetsu).toMatch(/学習指導要領.*解説 .*p\.\d+「.+」/)
        expect(m.proof.dictionary).toMatch(/^Wiktionary/)
      } else if (m.kind === 'informal') {
        expect(m.proof.dictionary).toMatch(/^Wiktionary/)
        expect(m.proof.spoken).toMatch(/^映画字幕/)
      } else {
        expect(m.kind).toBe('meaning')
        expect(m.intended).not.toBe('')
      }
    }
  })

  it('例文は Tatoeba の実在の文（番号つき）', () => {
    for (const it of data.items) for (const e of it.examples) if (e.source === 'tatoeba') expect(e.enId).toBeGreaterThan(0)
  })
})

describe('1日のメニュー（文法の修行を加えた後）', () => {
  it('合計60分のまま、言語の学習は20分（単語の復習7・文法の修行5・発音5・新しいカード3）', () => {
    expect(BASE_TOTAL).toBe(60)
    const lang = BASE_MENU.filter((m) => m.pillar === 'language')
    expect(lang.reduce((s, m) => s + m.baseMinutes, 0)).toBe(20)
    expect(Object.fromEntries(lang.map((m) => [m.kind, m.baseMinutes]))).toEqual({ review: 7, grammar: 5, pronunciation: 5, addCards: 3 })
  })
})
