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
      <h3 style={{ fontSize: '0.9rem' }}>使っているソフトウェア</h3>
      <ul className="credits">
        {SOFTWARE.map((s) => (
          <li key={s.name}>{s.name} <span className="tag">{s.license}</span></li>
        ))}
      </ul>
    </section>
  )
}
