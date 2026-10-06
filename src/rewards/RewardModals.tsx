import type { Settings } from '../db/schema'
import { bankRef, playText } from '../speech/audioBank'
import { Confetti } from './Confetti'
import { FactCard } from './FactCard'
import type { FactContent, FactsData } from './facts'
import type { Quote } from './quotes'

/** 最低ラインを終えたときに届く、今日の雑学 */
export function FactArrived({ fact, data, settings, onClose }: {
  fact: FactContent
  data: FactsData
  settings: Settings
  onClose: () => void
}) {
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="今日の雑学">
      <Confetti level={fact.rare && settings.effects !== 'low' ? 'high' : settings.effects === 'high' ? 'medium' : 'low'} seed={fact.id.length * 97} />
      <div className="modal">
        <p className="modal-kicker">{fact.rare ? '✨ レア雑学が届きました！' : '🎁 今日の雑学が届きました'}</p>
        <p className="muted">最低ライン（5分）達成。今日の継続が決まりました。</p>
        <FactCard fact={fact} data={data} settings={settings} autoSpeak />
        <button className="btn block" style={{ marginTop: 12 }} onClick={onClose}>図鑑に入れる</button>
      </div>
    </div>
  )
}

/** 1日の目標時間を達成したときのトロフィー画面（前回アプリから引き継ぎ） */
export function DailyComplete({ quote, settings, streak, minutes, onClose }: {
  quote: Quote | undefined
  settings: Settings
  streak: number
  minutes: number
  onClose: () => void
}) {
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="今日のメニュー完了">
      <Confetti level={settings.effects} seed={minutes + streak * 13} />
      <div className="modal trophy">
        <div className="trophy-icon" aria-hidden>🏆</div>
        <h2>今日のメニュー完了！</h2>
        <p>{minutes}分練習しました。連続 <strong>{streak}日</strong></p>
        {quote && (
          <blockquote className="quote">
            <p className="quote-en">{quote.emoji} {quote.en}</p>
            <p className="quote-ja">{quote.ja}</p>
            <footer>— {quote.author}{quote.attributed && <span className="muted">（の言葉と伝えられる）</span>}</footer>
            <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
              <button className="btn secondary" onClick={() => playText({ ref: bankRef.quote(quote.en), text: quote.en, voiceURI: settings.voiceURI })}>🔊 英語で聞く</button>
              <button className="btn secondary" onClick={() => playText({ ref: bankRef.quote(quote.en), text: quote.en, voiceURI: settings.voiceURI, rate: 0.8 })}>🐢 ゆっくり</button>
            </div>
          </blockquote>
        )}
        <button className="btn block" onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}
