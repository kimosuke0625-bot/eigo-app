// Claude に貼り付ける依頼文を作る。有料の API は使わず、利用者がコピーして Claude（claude.ai）に貼る。
// 利用者のレベル（Phase と語彙数）を書き込み、レベルに合った英語で返してもらう。

export interface Level {
  phase: number
  /** 知っている語＋定着した語の数 */
  vocab: number
}

const LEVEL_TEXT: Record<number, string> = {
  1: '初級（基本の1,000語ほど。短く簡単な文なら分かる）',
  2: '初中級（基本の2,000語ほど。日常の話題なら短い文章が分かる）',
  3: '中級（基本の2,800語ほど。仕事の説明ができるようになりたい）',
  4: '中上級（基本語は身についている。初見の話題で意見を述べたい）',
}

function levelLine(l: Level) {
  return `私の英語のレベル：${LEVEL_TEXT[l.phase] ?? LEVEL_TEXT[2]}。知っている英単語はおよそ${l.vocab.toLocaleString()}語です。目標は2年以内にビジネス英会話ができるようになることです。`
}

/** 作文・音声日記の添削 */
export function correctionPrompt(o: { level: Level; text: string; kind: 'write' | 'diary' | 'speech'; topic?: string; targets?: string[] }): string {
  const what = o.kind === 'write' ? '短い英作文' : o.kind === 'diary' ? '音声日記（話した英語を音声認識で文字にしたもの。認識の誤りが含まれることがあります）' : 'スピーチ（話した英語を音声認識で文字にしたもの。認識の誤りが含まれることがあります）'
  return [
    `あなたは日本人学習者のための、やさしく的確な英語の先生です。次の${what}を添削してください。`,
    levelLine(o.level),
    o.topic ? `テーマ：${o.topic}` : '',
    o.targets?.length ? `今日覚えた語（使うように意識した語）：${o.targets.join(', ')}` : '',
    '',
    '【お願い】',
    '1. まず、全体のよかった点を日本語で1〜2文',
    '2. 直した英文の全文（私のレベルで自然な英語に。言いたいことは変えない）',
    '3. 大事な直しを最大5つまで、表で：「元の表現 → 直した表現 → 理由（日本語で短く）」',
    '4. 今日覚えた語の使い方が正しいか、ひとこと',
    '5. 次に使えるとよい表現を2つ（例文つき）',
    '細かい誤りを全部直すより、意味が伝わるかどうかと、よくある間違いを優先してください。',
    '',
    '【英文】',
    o.text.trim(),
  ].filter((x) => x !== '').join('\n')
}

export interface Scene {
  id: string
  label: string
  /** Claude に演じてもらう相手と状況 */
  setup: string
  /** 私の目的 */
  goal: string
  minPhase: number
}

export const SCENES: Scene[] = [
  { id: 'smalltalk', label: '雑談（自己紹介・週末の話）', setup: 'あなたは海外の取引先の社員で、オンライン会議の前に私と雑談をします。', goal: '自己紹介をして、週末の話などで5往復ほど会話を続ける', minPhase: 1 },
  { id: 'cafe', label: 'お店で注文する', setup: 'あなたは海外のカフェの店員です。', goal: '飲み物と食べ物を注文し、質問に答えて支払いまで終える', minPhase: 1 },
  { id: 'directions', label: '道を聞く・教える', setup: 'あなたは駅で道に迷っている旅行者です。', goal: '相手の行きたい場所を聞き取り、道順を英語で説明する', minPhase: 1 },
  { id: 'phone', label: '電話の受け答え', setup: 'あなたは取引先の担当者で、私の会社に電話をかけてきました。私の上司は不在です。', goal: '用件を聞き取り、伝言を受けて、折り返しの約束をする', minPhase: 2 },
  { id: 'meeting', label: '会議で意見を言う', setup: 'あなたは社内の会議の司会です。新しいサービスの案について、私に意見を求めます。', goal: '自分の意見と理由を述べ、質問に答える', minPhase: 2 },
  { id: 'schedule', label: '日程を調整する', setup: 'あなたは海外の取引先の担当者で、来週の打ち合わせの日程を決めたいと思っています。', goal: '候補日を出し合い、日時と方法（対面かオンラインか）を決める', minPhase: 2 },
  { id: 'complaint', label: '顧客の苦情に対応する', setup: 'あなたは商品の配達が遅れて怒っている顧客です。', goal: 'おわびをし、状況を説明して、解決策を提案する', minPhase: 3 },
  { id: 'negotiation', label: '価格を交渉する', setup: 'あなたは仕入れ先の営業担当で、値上げを提案してきます。', goal: '理由を聞き、条件を出して、お互いが納得できる案にまとめる', minPhase: 3 },
  { id: 'presentation', label: '発表の質疑応答', setup: 'あなたは私の発表を聞いた参加者です。内容について質問をします。', goal: '質問を聞き返したり確認したりしながら、分かりやすく答える', minPhase: 3 },
  { id: 'interview', label: '英語の面接', setup: 'あなたは外資系企業の面接官です。', goal: '経歴・強み・志望理由を伝え、質問に答える', minPhase: 3 },
]

/** Claude との会話練習（役割練習） */
export function conversationPrompt(o: { level: Level; scene: Scene }): string {
  return [
    'あなたと英語の会話練習（ロールプレイ）をしたいです。',
    levelLine(o.level),
    '',
    `【場面】${o.scene.label}`,
    `【あなたの役】${o.scene.setup}`,
    `【私の目的】${o.scene.goal}`,
    '',
    '【進め方】',
    '- あなたから英語で話しかけて始めてください。1回の発言は1〜3文、私のレベルに合った語彙で。',
    '- 私が英語で返事をしたら、会話を自然に続けてください。私が日本語を使ったら、英語での言い方を1つ教えてから続けてください。',
    '- 会話の途中では誤りを直さず、会話を続けることを優先してください。',
    '- 6〜8往復したら、または私が「おわり」と書いたら、会話を終えて日本語でふり返りをしてください：',
    '  1) よかった点　2) 直すと自然になる表現を3つ（元の表現 → よりよい表現）　3) この場面で使える定番の表現を3つ',
    '',
    'では、始めてください。',
  ].join('\n')
}

/** 読んだ・聞いた素材の要約の確認 */
export function summaryPrompt(o: { level: Level; title: string; body: string; summary: string }): string {
  return [
    '英文を読んで（聞いて）、自分で要約を書きました。理解が合っているか確認してください。',
    levelLine(o.level),
    '',
    '【お願い】',
    '1. 私の要約が本文の内容と合っているか（合っている点・抜けている大事な点・誤解している点）を日本語で',
    '2. 私の要約の英語を、私のレベルで自然な英語に直したもの',
    '3. 本文の中で、私のレベルで覚えておくとよい表現を3つ（意味と例文）',
    '',
    `【本文の題名】${o.title}`,
    '【本文】',
    o.body.trim(),
    '',
    '【私の要約】',
    o.summary.trim(),
  ].join('\n')
}

/** クリップボードにコピーする。失敗したら false（画面に文を出して長押しでコピーしてもらう） */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export const CLAUDE_URL = 'https://claude.ai/new'
