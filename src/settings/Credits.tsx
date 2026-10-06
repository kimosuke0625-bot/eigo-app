import { AudioCredits } from './AudioCredits'
// アプリ内の「出典」画面。教材を追加したら必ずここにも書く

const SOURCES: { name: string; use: string; license: string; url: string; note?: string }[] = [
  {
    name: 'New General Service List 1.2（NGSL）',
    use: '語彙の柱（2,809語）、順位、活用形、やさしい英語の定義',
    license: 'CC BY-SA 4.0',
    url: 'https://www.newgeneralservicelist.com/new-general-service-list',
    note: 'Browne, C., Culligan, B., & Phillips, J.',
  },
  {
    name: 'Tatoeba',
    use: '例文と日本語訳（各例文に文番号へのリンクあり）',
    license: 'CC BY 2.0 FR',
    url: 'https://tatoeba.org/ja/downloads',
    note: 'Tatoeba の投稿者のみなさん',
  },
  {
    name: 'Simple English Wikipedia',
    use: '多読・多聴の素材11本（記事の冒頭を抜粋。各素材に元の版へのリンクあり）',
    license: 'CC BY-SA 4.0',
    url: 'https://simple.wikipedia.org/',
    note: 'Simple English Wikipedia の執筆者のみなさん',
  },
  {
    name: 'The Aesop for Children（1919年）',
    use: '多読・多聴の素材としてイソップ寓話7話',
    license: 'パブリックドメイン',
    url: 'https://www.gutenberg.org/ebooks/19994',
    note: '訳者名なし（Rand McNally 刊）。Project Gutenberg 版の本文のみを使用',
  },
  {
    name: '段階別の読み物12本と内容確認の質問',
    use: '日常・仕事の場面の読み物と、全素材の内容確認の質問',
    license: 'CC BY-SA 4.0',
    url: 'https://github.com/kimosuke0625-bot/eigo-app',
    note: 'このアプリ用に作成',
  },
  {
    name: '雑学365個',
    use: '図鑑の雑学。前回アプリの雑学を点検・修正し、英語版（やさしい版・標準版）を作成。1つずつに出典（主に英語版ウィキペディア）を付けた',
    license: '本文はこのアプリで作成',
    url: 'https://en.wikipedia.org/',
    note: '出典は各カードの下に表示',
  },
  {
    name: '名言60個',
    use: '1日完了の画面。原文の英語と日本語訳。原典を確認できないものは「伝えられる」と表示',
    license: '引用（短い名言・ことわざ）',
    url: 'https://en.wikiquote.org/',
  },
  {
    name: '日本語訳・補いの例文',
    use: 'NGSL 各語の短い日本語訳、Tatoeba に適した例文がない17語の例文',
    license: 'CC BY-SA 4.0',
    url: 'https://github.com/kimosuke0625-bot/eigo-app',
    note: 'このアプリ用に作成',
  },
]

const SOFTWARE: { name: string; license: string }[] = [
  { name: 'ts-fsrs（復習スケジューラ）', license: 'MIT' },
  { name: 'Dexie.js（データ保存）', license: 'Apache-2.0' },
  { name: 'React', license: 'MIT' },
  { name: 'Transformers.js（ブラウザ内の音声認識）', license: 'Apache-2.0' },
  { name: 'Whisper（OpenAI）／ whisper-tiny.en（ONNX 変換版：onnx-community）', license: 'MIT' },
  { name: 'Kokoro-82M（音声合成。PC で音声ファイルを作るのに使用）', license: 'Apache-2.0' },
]

export function Credits() {
  return (
    <section className="card stack">
      <h2>出典とライセンス</h2>
      <ul className="credits">
        {SOURCES.map((s) => (
          <li key={s.name}>
            <strong>{s.name}</strong>
            <span className="tag">{s.license}</span>
            <div className="muted">{s.use}</div>
            {s.note && <div className="muted">作成：{s.note}</div>}
            <a href={s.url} target="_blank" rel="noreferrer">{s.url}</a>
          </li>
        ))}
      </ul>
      <p className="muted">
        NGSL を元にした語彙データ（日本語訳を含む）は、元のライセンスにならい CC BY-SA 4.0 で公開しています。
      </p>
      <h3 style={{ fontSize: '0.9rem' }}>音声</h3>
      <AudioCredits />
      <h3 style={{ fontSize: '0.9rem' }}>使っているソフトウェア</h3>
      <ul className="credits">
        {SOFTWARE.map((s) => (
          <li key={s.name}>{s.name} <span className="tag">{s.license}</span></li>
        ))}
      </ul>
    </section>
  )
}
