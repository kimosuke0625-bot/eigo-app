# 英語アプリ（英語マスター 2年計画）再開の手引き

（この文書の写しと、会話の記録は PC の C:\Users\81801\eigo-archive にある。会話の記録は公開していない）

保存日：2026-10-10　版：v1.0.0（当初の計画フェーズ1〜11がすべて完了した状態）

## いまの状態
- アプリ：https://kimosuke0625-bot.github.io/eigo-app/ （iPhone のホーム画面に追加して使う）
- 2026-10-10 から約2週間、実際に使って気づいた点をまとめる期間。この間は新しい機能を作らない。
- 今後の候補は PLAN.md の最後「保留中」：熟語の追加、PC とスマホの自動同期、貼り付けた文章の PC 音声、✕ にできなかった文法の項目。

## 再開のしかた（Claude Code で）
いちばん簡単なのは、新しい会話でこう伝えること：

> 英語アプリ（C:\Users\81801\eigo-app）の続きです。v1.0.0 の後、2週間使って気づいた点を伝えます。

Claude のメモリ（C:\Users\81801\.claude\projects\C--Users-81801\memory\project_eigo_app.md）に経過が残っているので、自動で思い出す。
細かい経過は、下の「会話の記録」と、リポジトリの PLAN.md・SPEC.md にある。

前の会話そのものに戻りたいとき：
- ターミナルで `claude --resume` を実行し、一覧から選ぶ。
  - 開発の会話（2026-10-06〜10-09）：cf198221-e1bd-4ace-885f-f308db63987a
  - 仕上げの会話（2026-10-09〜10-10）：32749731-29e2-489a-a698-5c50edadcbbe
- 会話の記録が自動で消えないよう、Claude Code の設定（C:\Users\81801\.claude\settings.json）の保存期間を 3650日にしてある（初期設定は30日）。

## 保存してあるもの（この eigo-archive フォルダ。公開していない）
- conversations/01_開発の会話_2026-10-06〜10-09.md：発言だけを抜き出した読みやすい版
- conversations/02_仕上げの会話_2026-10-09〜10-10.md：同上
- conversations/raw/：会話の記録そのもの（.jsonl。Claude Code が読む形。claude --resume で使う元のファイルの写し）
  - 元の場所 C:\Users\81801\.claude\projects\C--Users-81801\ から消えたときは、ここから同じ場所へ戻せば再開できる。

## 大事な場所
| もの | 場所 |
| --- | --- |
| アプリの本体（ソース） | C:\Users\81801\eigo-app（GitHub：kimosuke0625-bot/eigo-app、公開） |
| 設計図・開発計画 | eigo-app の SPEC.md・PLAN.md（Downloads\SPEC.md も同じ最終版） |
| 内蔵の音声 | C:\Users\81801\eigo-audio（GitHub：kimosuke0625-bot/eigo-audio、公開） |
| 辞書・コーパス・解説の本文（作業用。公開しない） | C:\Users\81801\eigo-data（約数GB。PC の中だけ） |
| 学習の記録 | iPhone の中（アプリの設定から書き出し・読み込み） |

eigo-data はこの PC にしかない。文法・熟語を作り直したり増やしたりするときに使う（できあがったデータはリポジトリに入っているので、アプリを動かすだけなら要らない）。PC を替えるときは外付けの記憶装置などに写しておく。

## よく使う手順（eigo-app で）
- 公開：`npm run deploy`（テスト → ビルド → 公開）
- テスト：`npm test`
- 文法のデータを作り直す：`node scripts/grammar/build.mjs`（Tatoeba・LanguageTool・Wiktionary・学習指導要領解説・CEFR-J と照合し、1つでも通らなければ書き出さない）
- 内蔵の英文の音声を作る：`node scripts/build-audio-bank.mjs`（作った分を eigo-audio に公開）
- 旅の手帳の音声：scripts/run-my-audio.cmd（バックアップから PC で作り、ファイルで取り込む）
- v1.0.0 に戻す：PLAN.md の「版」を参照（git switch --detach v1.0.0 → npm ci → npm run deploy）

## これまでに決めた大事なこと（詳しくは PLAN.md・SPEC.md）
- 有料 API・外部への送信はしない。全練習をアプリ内で完結（Claude との会話・添削は依頼文を貼る方式）。
- 1日60分（言語20・インプット15・流暢さ15・アウトプット10）。最低ラインはどの練習でも5分。
- 熟語・文法は信憑性を最優先：辞書に見出しがあるもの、実在の文、公開データで回数を数える。
- 文法の ✕：学習指導要領の範囲は解説＋辞書、その先は CEFR-J の項目の定義＋辞書。くだけた言い方・意味の違いは △。英米差・判断が分かれる文は載せない。
- 報告・手順・質問はすべて日本語。
