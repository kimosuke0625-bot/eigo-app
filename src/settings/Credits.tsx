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
    name: 'Business Service List 1.20（BSL）',
    use: 'ビジネス語彙（1,744語）、順位、活用形',
    license: 'CC BY-SA 4.0',
    url: 'https://www.newgeneralservicelist.com/business-service-list',
    note: 'Browne, C., & Culligan, B.',
  },
  {
    name: 'Tatoeba',
    use: '例文と日本語訳（各例文に文番号へのリンクあり）。熟語では、実在の文を読んで意味を選ぶ根拠と、話し言葉の頻度にも使用',
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
    name: 'LibriVox「The Aesop for Children」の朗読',
    use: '人の朗読つきの素材6本（1本 = 寓話4話）。朗読者：Bob Neufeld、Halle Kill、Katalina Watt、Jill Engle、Lee Smalley、lewildesen',
    license: 'パブリックドメイン',
    url: 'https://librivox.org/the-aesop-for-children-by-aesop/',
    note: 'LibriVox のボランティア朗読者のみなさん（LibriVox の録音はすべてパブリックドメイン：https://librivox.org/pages/public-domain/ ）。本文は The Aesop for Children（1919年）',
  },
  {
    name: 'ビジネスの読み物36本・ビジネス場面の対話36本',
    use: '多聴・多読、シャドーイング、対話の役割練習の素材と、内容確認の質問',
    license: 'CC BY-SA 4.0',
    url: 'https://github.com/kimosuke0625-bot/eigo-app',
    note: 'このアプリ用に作成',
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
    name: 'Wiktionary（英語版）',
    use: '熟語・表現の見出し、意味、用法のラベル。機械可読版（kaikki.org）を使用。熟語の日本語の意味はこのアプリで作成',
    license: 'CC BY-SA 4.0',
    url: 'https://en.wiktionary.org/',
    note: 'Wiktionary の執筆者のみなさん。機械可読版：Tatu Ylonen, Wiktextract（https://kaikki.org/）',
  },
  {
    name: 'OpenSubtitles（OPUS 版の英語の字幕）',
    use: '熟語の頻度（話し言葉）を数えるためだけに利用。字幕の文はアプリにも公開の場所にも入れていません。元データは作成に使った PC の中だけにあります',
    license: '明示のライセンスなし（出典の表示と論文の引用の依頼に従って記載）',
    url: 'https://www.opensubtitles.org/',
    note: 'P. Lison and J. Tiedemann (2016) OpenSubtitles2016: Extracting Large Parallel Corpora from Movie and TV Subtitles. LREC 2016。OPUS：https://opus.nlpl.eu/',
  },
  {
    name: 'Wikipedia 英語版（本文の一部）',
    use: '熟語の使う場面の札（書き言葉向き・会話向き）の参考。記事の本文の一部（約5.7億語）で回数を数えるためだけに利用し、文はアプリに入れていません。取得したデータは数えたあと消しました',
    license: 'CC BY-SA 4.0',
    url: 'https://dumps.wikimedia.org/enwiki/',
    note: 'Wikipedia の執筆者のみなさん',
  },
  {
    name: 'Google Books Ngram の上位一覧',
    use: '熟語の使う場面の札（書き言葉向き・会話向き）の参考。2010〜2019年の英語の本で数えた上位の語の組',
    license: 'CC BY 3.0',
    url: 'https://github.com/orgtre/google-books-ngram-frequency',
    note: 'orgtre（元データ：Google Books Ngram Corpus 第3版、Google、CC BY 3.0）',
  },
  {
    name: '日本語訳・補いの例文',
    use: 'NGSL・BSL 各語の短い日本語訳、Tatoeba に適した例文がない語の例文（NGSL 17語、BSL 330語）',
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
        NGSL・BSL を元にした語彙データ（日本語訳を含む）と、Wiktionary を元にした熟語のデータは、元のライセンスにならい CC BY-SA 4.0 で公開しています。
      </p>
      <h3 style={{ fontSize: '0.9rem' }}>音声</h3>
      <AudioCredits />
      <h3 style={{ fontSize: '0.9rem' }}>書体（フォント）</h3>
      <ul className="credits">
        <li>
          <strong>DotGothic16</strong>
          <span className="tag">SIL Open Font License 1.1</span>
          <div className="muted">見出しと数字（レベル、経験値など）のゲーム風の書体。英文・日本語訳・説明文には使っていません。</div>
          <div className="muted">作成：Fontworks Inc.（The DotGothic16 Project Authors）。@fontsource/dotgothic16 経由でアプリに同梱</div>
          <a href="https://github.com/fontworks-fonts/DotGothic16" target="_blank" rel="noreferrer">https://github.com/fontworks-fonts/DotGothic16</a>
        </li>
      </ul>
      <p className="muted">アイコン、枠、背景、雑学パックの絵は、このアプリ用に CSS と SVG で作ったものです。</p>
      <h3 style={{ fontSize: '0.9rem' }}>使っているソフトウェア</h3>
      <ul className="credits">
        {SOFTWARE.map((s) => (
          <li key={s.name}>{s.name} <span className="tag">{s.license}</span></li>
        ))}
      </ul>
    </section>
  )
}
