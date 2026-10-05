import { diffWords } from './dictationScore'

/**
 * フィードバックを減らす（SPEC 3.3）：慣れるまでは毎回、慣れたら3回に1回だけ一致率を見せる。
 * 先に自己評価を入力させ、自分の耳で判断する力を育てる。
 * @param previous これまでに同じ種類の練習で録音した回数
 */
export function shouldShowScore(previous: number): boolean {
  if (previous < 5) return true
  return (previous - 5) % 3 === 2
}

/** 手本の英文と、認識した文字の一致率（0〜1） */
export function matchScore(model: string, transcript: string): number {
  return diffWords(model, transcript).score
}

/** 1分あたりの語数 */
export function wordsPerMinute(transcript: string, seconds: number): number {
  const words = (transcript.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g) ?? []).length
  return seconds > 0 ? Math.round((words / seconds) * 60) : 0
}

export const SELF_RATINGS = [
  { label: 'ほぼできた', value: 1 },
  { label: '大体できた', value: 0.67 },
  { label: 'ところどころ', value: 0.33 },
  { label: 'ほとんど無理', value: 0 },
]

// ---- 聞き分けドリル：日本語話者が区別しにくい音のペア ----

export interface PairGroup {
  key: string
  label: string
  hint: string
  pairs: [string, string][]
}

export const PAIR_GROUPS: PairGroup[] = [
  { key: 'r-l', label: 'R と L', hint: 'R は舌をどこにもつけずに丸める。L は舌先を上の歯の裏につける。',
    pairs: [['right', 'light'], ['rice', 'lice'], ['read', 'lead'], ['road', 'load'], ['grass', 'glass'], ['pray', 'play'], ['correct', 'collect'], ['fry', 'fly'], ['wrong', 'long'], ['arrive', 'alive']] },
  { key: 'b-v', label: 'B と V', hint: 'V は上の歯を下くちびるに軽く当てて、息を出しながら声を出す。',
    pairs: [['berry', 'very'], ['best', 'vest'], ['boat', 'vote'], ['ban', 'van'], ['curb', 'curve']] },
  { key: 's-th', label: 'S と TH', hint: 'TH は舌先を上の歯に軽く当てて息を出す。',
    pairs: [['sink', 'think'], ['sick', 'thick'], ['mouse', 'mouth'], ['pass', 'path'], ['sum', 'thumb']] },
  { key: 'z-dh', label: 'Z と TH（濁る音）', hint: '濁る TH も舌先を歯に当てたまま声を出す。',
    pairs: [['breeze', 'breathe'], ['closing', 'clothing'], ['zen', 'then']] },
  { key: 'f-h', label: 'F と H', hint: 'F は上の歯を下くちびるに当てる。日本語の「フ」とは違う。',
    pairs: [['fall', 'hall'], ['fire', 'hire'], ['food', 'hood'], ['feet', 'heat']] },
  { key: 's-sh', label: 'S と SH（シ）', hint: 'see は「シー」ではなく「スィー」。SH は唇を丸めて前に出す。',
    pairs: [['see', 'she'], ['sip', 'ship'], ['seat', 'sheet'], ['save', 'shave'], ['sell', 'shell']] },
  { key: 'i-ee', label: '短い I と長い EE', hint: 'ship は短く力を抜いた「イ」、sheep は口を横に引いた長い「イー」。',
    pairs: [['ship', 'sheep'], ['live', 'leave'], ['fill', 'feel'], ['sit', 'seat'], ['bit', 'beat']] },
  { key: 'a-u', label: 'A（æ）と U（ʌ）', hint: 'cat は口を横に大きく開けた「ア」、cut は口をあまり開けない短い「ア」。',
    pairs: [['cat', 'cut'], ['bag', 'bug'], ['cap', 'cup'], ['ran', 'run'], ['match', 'much']] },
  { key: 'er-ar', label: 'ER と AR', hint: 'bird の ER は口をあまり開けずに舌を丸める。AR は口を大きく開ける。',
    pairs: [['heard', 'hard'], ['firm', 'farm'], ['bird', 'bard'], ['hurt', 'heart']] },
  { key: 'o-aw', label: 'OU と AW', hint: 'coat は「オウ」と動く。caught は口を縦に開けた伸ばす「オー」。',
    pairs: [['coat', 'caught'], ['low', 'law'], ['boat', 'bought'], ['so', 'saw']] },
  { key: 'n-ng', label: 'N と NG', hint: 'NG は舌の奥を上あごにつけて鼻に抜く。最後に「グ」は言わない。',
    pairs: [['sin', 'sing'], ['win', 'wing'], ['ran', 'rang'], ['thin', 'thing']] },
]

export interface Trial {
  group: string
  pair: [string, string]
  /** 0 か 1：ペアのどちらを聞かせるか */
  answer: 0 | 1
  /** 読み上げの速さ（変動練習） */
  rate: number
}

/**
 * 出題の順番（SPEC 3.3：最初の数回だけ同じ音を続け、その後は複数の音を混ぜる）。
 * 苦手なグループ（focus）から blocked 回出題し、残りは全グループから混ぜる。
 */
export function buildTrials(focus: string, total: number, rand: () => number = Math.random, blocked = 4): Trial[] {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const rates = [0.8, 1, 1.2]
  const trialFrom = (g: PairGroup): Trial => ({ group: g.key, pair: pick(g.pairs), answer: rand() < 0.5 ? 0 : 1, rate: pick(rates) })
  const first = PAIR_GROUPS.find((g) => g.key === focus) ?? PAIR_GROUPS[0]
  const out: Trial[] = []
  for (let i = 0; i < Math.min(blocked, total); i++) out.push(trialFrom(first))
  while (out.length < total) {
    const g = pick(PAIR_GROUPS)
    // 同じグループが3回続かないようにする
    if (out.length >= 2 && out.at(-1)!.group === g.key && out.at(-2)!.group === g.key) continue
    out.push(trialFrom(g))
  }
  return out
}

/** これまでの結果（グループごとの正答率）から、いちばん苦手なグループを選ぶ。記録がなければ R と L */
export function weakestGroup(stats: Map<string, { ok: number; all: number }>): string {
  let best = 'r-l'
  let worst = Infinity
  for (const g of PAIR_GROUPS) {
    const s = stats.get(g.key)
    // 記録のないグループは正答率 0.5 とみなして、早めに出す
    const rate = s && s.all >= 3 ? s.ok / s.all : 0.5
    if (rate < worst) { worst = rate; best = g.key }
  }
  return best
}

// ---- 4/3/2スピーチの話題 ----

export interface Topic {
  id: string
  en: string
  ja: string
  /** この Phase 以上で出す */
  minPhase: number
}

export const TOPICS: Topic[] = [
  { id: 't01', en: 'Talk about your job or your studies. What do you do every day?', ja: '仕事や勉強について。毎日何をしている？', minPhase: 1 },
  { id: 't02', en: 'Describe your hometown to someone who has never been there.', ja: '行ったことのない人に、出身地を紹介する', minPhase: 1 },
  { id: 't03', en: 'Tell the story of a trip you remember well.', ja: 'よく覚えている旅行の話', minPhase: 1 },
  { id: 't04', en: 'Talk about your favorite food and how to make it.', ja: '好きな食べ物と、その作り方', minPhase: 1 },
  { id: 't05', en: 'How do you usually spend your weekends?', ja: 'ふだんの週末の過ごし方', minPhase: 1 },
  { id: 't06', en: 'Talk about something you want to learn this year, and why.', ja: '今年学びたいことと、その理由', minPhase: 1 },
  { id: 't07', en: 'Describe a person who has influenced you.', ja: '影響を受けた人について', minPhase: 1 },
  { id: 't08', en: 'Talk about an app or product you use every day. Why do you like it?', ja: '毎日使うアプリや製品と、気に入っている理由', minPhase: 1 },
  { id: 't09', en: 'Explain a Japanese custom to a visitor from another country.', ja: '日本の習慣を外国から来た人に説明する', minPhase: 2 },
  { id: 't10', en: 'Talk about a problem you solved recently. What did you do?', ja: '最近解決した問題と、何をしたか', minPhase: 2 },
  { id: 't11', en: 'What are the good and bad points of working from home?', ja: '在宅勤務のよい点と悪い点', minPhase: 2 },
  { id: 't12', en: 'Introduce your company or school to a new member.', ja: '新しく入った人に、会社や学校を紹介する', minPhase: 2 },
  { id: 't13', en: 'Talk about your plan for the next five years.', ja: 'これから5年の計画', minPhase: 2 },
  { id: 't14', en: 'Talk about a goal you achieved and how you did it.', ja: '達成した目標と、どうやって達成したか', minPhase: 2 },
  { id: 't15', en: 'Propose one improvement for your workplace or school. Explain why it is needed.', ja: '職場や学校の改善案を1つ提案し、必要な理由を説明する', minPhase: 3 },
  { id: 't16', en: 'A customer is unhappy with a late delivery. Explain how you would handle it.', ja: '配達の遅れに不満な顧客への対応を説明する', minPhase: 3 },
  { id: 't17', en: 'Compare two options for a business trip and recommend one.', ja: '出張の2つの案を比べて、1つを勧める', minPhase: 3 },
  { id: 't18', en: 'Summarize a recent news story and give your opinion.', ja: '最近のニュースを要約して、自分の意見を述べる', minPhase: 3 },
]

export const SPEECH_ROUNDS = [240, 180, 120]
