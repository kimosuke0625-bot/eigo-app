# 英語マスター 2年計画

2年でビジネス英会話をめざす、個人用の英語学習アプリ（PWA）です。
練習はすべてアプリの中で完結し、学習データと録音は端末の外に送りません。

公開URL：https://kimosuke0625-bot.github.io/eigo-app/

## 開発

```sh
npm install
npm run dev      # 開発用サーバー
npm test         # 自動テスト
npm run deploy   # テスト → ビルド → GitHub Pages（gh-pages ブランチ）に公開
```

## 語彙データの作り方

`public/data/ngsl.json` は次の手順で作ります。元データ（`scripts/raw/`）はリポジトリに含めていません。

```sh
node scripts/fetch-raw.mjs   # NGSL と Tatoeba の公式配布データを取得
node scripts/build-ngsl.mjs  # 例文の選定と日本語訳の結合
```

- `scripts/ja-gloss.tsv`：NGSL 2,809語の短い日本語訳（このアプリ用に作成）
- `scripts/own-examples.tsv`：Tatoeba に適した例文がない語のための例文（このアプリ用に作成）

## 出典とライセンス

| 素材 | ライセンス |
| --- | --- |
| [New General Service List 1.2](https://www.newgeneralservicelist.com/new-general-service-list)（Browne, C., Culligan, B., & Phillips, J.） | CC BY-SA 4.0 |
| [Tatoeba](https://tatoeba.org/)の英日対訳文（各例文に文番号を記録） | CC BY 2.0 FR |
| 日本語訳・補いの例文（このアプリ用に作成） | CC BY-SA 4.0 |

`public/data/ngsl.json`、`scripts/ja-gloss.tsv`、`scripts/own-examples.tsv` は、NGSL のライセンスにならい CC BY-SA 4.0 で公開します。
