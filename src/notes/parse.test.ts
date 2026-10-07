import { describe, expect, it } from 'vitest'
import { parseFeedback } from './parse'
import { normalizeType } from './errorTypes'

const STANDARD = `よかった点：週末の出来事が順序よく伝わっています。

\`\`\`
【アプリ取り込み用のまとめ】
種類：音声日記

■直し 1
元の文：I go to Kyoto with my friend yesterday.
直した文：I went to Kyoto with my friend yesterday.
間違いの種類：時制
解説：yesterday なので過去形 went にします。

■直し 2
元の文：It was very enjoy.
直した文：It was a lot of fun.
間違いの種類：語の形（品詞）
解説：enjoy は動詞。
「楽しかった」は fun を使います。

■新しい表現 1
表現：It was a lot of fun.
意味：とても楽しかった
例文：The trip was a lot of fun.
使う場面：出来事の感想を言うとき

【まとめ ここまで】
\`\`\`
ほかに質問があればどうぞ。`

describe('添削の読み取り', () => {
  it('決まった形式を読み取る（解説が2行でもつなげる）', () => {
    const r = parseFeedback(STANDARD)
    expect(r.found).toBe(true)
    expect(r.source).toBe('diary')
    expect(r.fixes).toHaveLength(2)
    expect(r.fixes[0]).toEqual({
      original: 'I go to Kyoto with my friend yesterday.',
      corrected: 'I went to Kyoto with my friend yesterday.',
      type: '時制',
      note: 'yesterday なので過去形 went にします。',
    })
    expect(r.fixes[1].type).toBe('語の形（品詞）')
    expect(r.fixes[1].note).toBe('enjoy は動詞。 「楽しかった」は fun を使います。')
    expect(r.phrases).toEqual([{ expression: 'It was a lot of fun.', meaning: 'とても楽しかった', example: 'The trip was a lot of fun.', scene: '出来事の感想を言うとき' }])
    expect(r.leftovers).toEqual([])
  })

  it('形式が崩れていても読める所は読む（見出しなし、太字、箇条書き、半角の「:」）', () => {
    const r = parseFeedback(`**アプリ取り込み用のまとめ**
- **元の文**: She have a car.
- **直した文**: She has a car.
- **間違いの種類**: 主語と動詞の一致です
- 元の文: I like cat.
- 直した文: I like cats.
- 間違いの種類: Plural
* 表現: look forward to ~ing
* 意味: 〜を楽しみにする

これは読めない行`)
    expect(r.fixes.map((f) => [f.original, f.corrected, f.type])).toEqual([
      ['She have a car.', 'She has a car.', '主語と動詞の一致'],
      ['I like cat.', 'I like cats.', '単数・複数'],
    ])
    expect(r.phrases[0]).toMatchObject({ expression: 'look forward to ~ing', meaning: '〜を楽しみにする', example: '' })
    expect(r.leftovers).toEqual(['これは読めない行'])
  })

  it('まとめがなくても「→」の行や表から直しを拾う', () => {
    const r = parseFeedback(`大事な直し：
1. I am agree → I agree → agree は動詞なので am は不要
| 元の表現 | 直した表現 | 理由 |
|---|---|---|
| discuss about | discuss | discuss の後に about は付けない |`)
    expect(r.found).toBe(false)
    expect(r.fixes).toEqual([
      { original: 'I am agree', corrected: 'I agree', type: 'その他', note: 'agree は動詞なので am は不要' },
      { original: 'discuss about', corrected: 'discuss', type: 'その他', note: 'discuss の後に about は付けない' },
    ])
  })

  it('間違いの種類の書き方の揺れをそろえる', () => {
    expect(normalizeType('時制の誤り')).toBe('時制')
    expect(normalizeType('Article')).toBe('冠詞')
    expect(normalizeType('音声認識の誤り')).toBe('聞き取りの誤り')
    expect(normalizeType('語の形（品詞）')).toBe('語の形（品詞）')
    expect(normalizeType('なんとなく')).toBe('その他')
  })
})
