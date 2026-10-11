import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 端末の声の代わり：読み始めて ms 後に読み終える
let speakMs = 1000
vi.mock('./voices', () => ({
  setBeforeSpeak: () => {},
  speak: (_t: string, _v: string, _r: number, onEnd: () => void) => { setTimeout(onEnd, speakMs); return true },
}))

const { playSentences } = await import('./clips')

describe('文ごとの再生のくり返し', () => {
  beforeEach(() => { vi.useFakeTimers(); speakMs = 1000; const synth = { cancel: () => {} }; vi.stubGlobal('speechSynthesis', synth); vi.stubGlobal('window', { speechSynthesis: synth }) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  const run = (mode: 'none' | 'all' | 'one', from = 0) => {
    const idx: number[] = []
    const ev = { end: 0, loop: 0 }
    const stop = playSentences({ sentences: ['A.', 'B.', 'C.'], from, rate: 1, voiceURI: '', onIndex: (i) => idx.push(i), onEnd: () => ev.end++, onLoop: () => ev.loop++, repeat: () => mode })
    return { idx, ev, stop }
  }

  it('なし：最後まで1回読んで終わる', () => {
    const r = run('none')
    vi.advanceTimersByTime(10_000)
    expect(r.idx).toEqual([0, 1, 2])
    expect(r.ev.end).toBe(1)
  })

  it('1文：同じ文を止めるまでくり返す', () => {
    const r = run('one', 1)
    vi.advanceTimersByTime(5_000)
    expect(new Set(r.idx)).toEqual(new Set([1]))
    expect(r.idx.length).toBeGreaterThan(2)
    r.stop()
    const n = r.idx.length
    vi.advanceTimersByTime(5_000)
    expect(r.idx.length).toBe(n)
    expect(r.ev.end).toBe(0)
  })

  it('全体：最後の文の後は最初に戻り、1周ごとに知らせる', () => {
    const r = run('all')
    vi.advanceTimersByTime(8_000)
    expect(r.idx.slice(0, 5)).toEqual([0, 1, 2, 0, 1])
    expect(r.ev.loop).toBeGreaterThanOrEqual(1)
    expect(r.ev.end).toBe(0)
    r.stop()
  })

  it('再生できずにすぐ終わる文は、くり返さずに先へ進む（無音で回り続けない）', () => {
    speakMs = 10
    const r = run('one')
    vi.advanceTimersByTime(1_000)
    expect(r.idx).toEqual([0, 1, 2])
    expect(r.ev.end).toBe(1)
  })
})
