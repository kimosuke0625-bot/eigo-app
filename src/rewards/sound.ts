// 効果音。前回アプリの playTimerSound（4音の上昇チャイム）と同じ作り方で、Web Audio API から合成する。
// iPhone では画面をタップした後でないと鳴らせないので、AudioContext はボタン操作の中で作り直す。

let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(on: boolean) {
  enabled = on
}

/**
 * 効果音セット（称号で解放）。同じ音の高さで、音色（波形）と長さだけを変える。
 * classic：前回アプリのチャイム、bells：ベル、marimba：マリンバ、arcade：ゲーム風
 */
const SETS: Record<string, { type: OscillatorType; length: number; volume: number }> = {
  classic: { type: 'sine', length: 1, volume: 1 },
  bells: { type: 'triangle', length: 1.6, volume: 0.9 },
  marimba: { type: 'sine', length: 0.45, volume: 1.1 },
  arcade: { type: 'square', length: 0.6, volume: 0.35 },
}
let set = SETS.classic

export function setSoundSet(key: string) {
  set = SETS[key] ?? SETS.classic
}

function audio(): AudioContext | null {
  if (!enabled) return null
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(c: AudioContext, freq: number, delay: number, length = 0.55, volume = 0.28, type?: OscillatorType) {
  // 音色を指定していない音は、選んだ効果音セットの音色にする
  if (!type) { type = set.type; length *= set.length; volume *= set.volume }
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = type
  osc.frequency.value = freq
  const t = c.currentTime + delay
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(volume, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, t + length)
  osc.start(t)
  osc.stop(t + length + 0.05)
}

/** 前回アプリのタイマー終了音（ド・ミ・ソ・ド） */
export function playChime() {
  const c = audio()
  if (!c) return
  ;[[523.25, 0], [659.25, 0.18], [783.99, 0.36], [1046.5, 0.54]].forEach(([f, d]) => tone(c, f, d))
}

// 長音階（ド〜高いド）。コンボが続くほど高い音になる
const SCALE = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5, 1174.66, 1318.51]

/** 思い出せたときの音。combo（連続回数）が増えるほど高くなる */
export function playCorrect(combo = 1) {
  const c = audio()
  if (!c) return
  const base = SCALE[Math.min(combo - 1, SCALE.length - 2)]
  const next = SCALE[Math.min(combo, SCALE.length - 1)]
  tone(c, base, 0, 0.25, 0.2)
  tone(c, next, 0.08, 0.3, 0.18)
}

/** 思い出そうとしたが忘れていたときの、やわらかい音（責める音にしない） */
export function playTry() {
  const c = audio()
  if (!c) return
  tone(c, 392, 0, 0.25, 0.12, 'triangle')
}

/** 1日のメニュー完了。チャイムに和音を重ねる */
export function playComplete() {
  const c = audio()
  if (!c) return
  playChime()
  ;[523.25, 659.25, 783.99].forEach((f) => tone(c, f, 0.8, 1.2, 0.12))
}

/** 雑学カードが届いたときの音 */
export function playFact(rare = false) {
  const c = audio()
  if (!c) return
  const notes = rare ? [783.99, 987.77, 1174.66, 1567.98] : [659.25, 880]
  notes.forEach((f, i) => tone(c, f, i * 0.1, 0.4, 0.16))
}

/** コンボの段階が上がったとき（段階 1〜4）。段階が高いほど音の数が増え、高くなる */
export function playComboStage(stage: number) {
  const c = audio()
  if (!c || stage < 1) return
  const notes = [783.99, 987.77, 1174.66, 1567.98, 1975.53].slice(0, stage + 1)
  notes.forEach((f, i) => tone(c, f, 0.12 + i * 0.06, 0.22, 0.12))
  if (stage >= 3) tone(c, notes.at(-1)! * 2, 0.12 + notes.length * 0.06, 0.35, 0.06, 'triangle')
}

/** 会心の一撃。短く鋭い2音と、きらめき */
export function playCrit() {
  const c = audio()
  if (!c) return
  tone(c, 1318.51, 0, 0.12, 0.16, 'square')
  tone(c, 1760, 0.07, 0.25, 0.14, 'square')
  ;[2093, 2637, 3136].forEach((f, i) => tone(c, f, 0.18 + i * 0.05, 0.3, 0.05, 'sine'))
}

/** レベルアップ。ファンファーレ風の上昇音 */
export function playLevelUp() {
  const c = audio()
  if (!c) return
  ;[[523.25, 0], [659.25, 0.1], [783.99, 0.2], [1046.5, 0.3]].forEach(([f, d]) => tone(c, f, d, 0.3, 0.16))
  ;[1046.5, 1318.51, 1567.98].forEach((f) => tone(c, f, 0.42, 0.7, 0.08))
}

/**
 * パックを開けるときの予告音（rarity 0〜3）。レア度が高いほど長く、高く、きらめく。
 * 鳴り終わるまで約 0.5〜1.1 秒。
 */
export function playPackGlow(rarity: number) {
  const c = audio()
  if (!c) return
  const steps = [3, 4, 6, 9][rarity] ?? 3
  for (let i = 0; i < steps; i++) tone(c, 440 * Math.pow(2, (i * 2) / 12), i * 0.11, 0.18, 0.1, 'triangle')
  if (rarity >= 2) tone(c, 1760, steps * 0.11, 0.5, 0.08, 'sine')
}

/** パックが開いた瞬間 */
export function playPackOpen(rarity: number) {
  const c = audio()
  if (!c) return
  const chord = rarity >= 3 ? [1046.5, 1318.51, 1567.98, 2093] : rarity >= 2 ? [880, 1108.73, 1318.51] : [783.99, 987.77]
  chord.forEach((f, i) => tone(c, f, i * 0.04, 0.6, 0.12))
}
