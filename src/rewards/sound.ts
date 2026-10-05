// 効果音。前回アプリの playTimerSound（4音の上昇チャイム）と同じ作り方で、Web Audio API から合成する。
// iPhone では画面をタップした後でないと鳴らせないので、AudioContext はボタン操作の中で作り直す。

let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(on: boolean) {
  enabled = on
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

function tone(c: AudioContext, freq: number, delay: number, length = 0.55, volume = 0.28, type: OscillatorType = 'sine') {
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
