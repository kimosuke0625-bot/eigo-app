import { describe, expect, it } from 'vitest'
import { micProblemOf } from './recorder'

describe('マイクが使えなかった理由の分け方', () => {
  it('許可されていない・見つからない・使用中・その他を分ける', () => {
    expect(micProblemOf({ name: 'NotAllowedError' })).toBe('denied')
    expect(micProblemOf({ name: 'SecurityError' })).toBe('denied')
    expect(micProblemOf({ name: 'NotFoundError' })).toBe('notfound')
    expect(micProblemOf({ name: 'NotReadableError' })).toBe('busy')
    expect(micProblemOf({ name: 'TypeError' })).toBe('other')
    expect(micProblemOf(null)).toBe('other')
  })
})
