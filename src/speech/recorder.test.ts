import { afterEach, describe, expect, it, vi } from 'vitest'
import { micProblemOf, startRecording } from './recorder'

describe('マイクが使えなかった理由の分け方', () => {
  it('許可されていない・見つからない・使用中・時間切れ・その他を分ける', () => {
    expect(micProblemOf({ name: 'NotAllowedError' })).toBe('denied')
    expect(micProblemOf({ name: 'SecurityError' })).toBe('denied')
    expect(micProblemOf({ name: 'NotFoundError' })).toBe('notfound')
    expect(micProblemOf({ name: 'NotReadableError' })).toBe('busy')
    expect(micProblemOf({ name: 'TimeoutError' })).toBe('stuck')
    expect(micProblemOf({ name: 'TypeError' })).toBe('other')
    expect(micProblemOf(null)).toBe('other')
  })
})

describe('録音の開始', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('マイクが返事をしないままでも、8秒で時間切れの失敗にする（ボタンが無反応のままにならない）', async () => {
    vi.useFakeTimers()
    let lateResolve: (s: MediaStream) => void = () => {}
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((r) => { lateResolve = r }))
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
    const p = startRecording()
    const caught = p.catch((e: { name?: string }) => e)
    await vi.advanceTimersByTimeAsync(8000)
    expect((await caught as { name?: string }).name).toBe('TimeoutError')
    // 遅れて開いたマイクは、すぐ閉じる（開いたままだと次から「使用中」になる）
    const stop = vi.fn()
    lateResolve({ getTracks: () => [{ stop }] } as unknown as MediaStream)
    await vi.advanceTimersByTimeAsync(0)
    expect(stop).toHaveBeenCalled()
  })

  it('録音機を作れなかったときは、開いたマイクを閉じる', async () => {
    const stop = vi.fn()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) } })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
    vi.stubGlobal('MediaRecorder', Object.assign(function () { throw Object.assign(new Error('x'), { name: 'NotSupportedError' }) }, { isTypeSupported: () => false }))
    await expect(startRecording()).rejects.toMatchObject({ name: 'NotSupportedError' })
    expect(stop).toHaveBeenCalled()
  })
})
