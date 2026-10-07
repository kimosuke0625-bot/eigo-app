import type { Recording, Settings } from '../db/schema'
import { PlayBlobButton } from '../practice/SpeakParts'
import { SOUND_SETS, THEMES, type TitleDef } from './titles'
import type { WeekSummary } from './weekly'
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

/** 新しい称号（と解放）のお知らせ。節目では、4週間以上前の録音と今の録音を聞き比べられる */
export function TitlesArrived({ titles, settings, compare, onClose }: {
  titles: TitleDef[]
  settings: Settings
  compare?: { old: Recording; recent: Recording }
  onClose: () => void
}) {
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="新しい称号">
      <Confetti level={settings.effects} seed={titles.length * 31} />
      <div className="modal trophy">
        <div className="trophy-icon" aria-hidden>🎖️</div>
        <h2>新しい称号</h2>
        <ul className="title-list">
          {titles.map((t) => (
            <li key={t.key}>
              <strong>{t.name}</strong>
              <div className="muted">{t.desc}</div>
              {t.unlock && (
                <div className="tag fit-just">
                  {t.unlock.kind === 'theme' ? `配色テーマ「${THEMES[t.unlock.key]?.name}」` : `効果音「${SOUND_SETS[t.unlock.key]}」`}を解放（設定で選べます）
                </div>
              )}
            </li>
          ))}
        </ul>
        {compare && (
          <div className="quote">
            <p><strong>節目の聞き比べ：</strong>{Math.round((compare.recent.at - compare.old.at) / 86_400_000)}日前の自分の声と、最近の声</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <PlayBlobButton blob={compare.old.audio} label="▶ 前の声" />
              <PlayBlobButton blob={compare.recent.audio} label="▶ 今の声" />
            </div>
          </div>
        )}
        <button className="btn block" onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}

/** 週のまとめ（月曜日の最初に、先週の分を出す） */
export function WeeklySummaryModal({ summary, titleNames, onClose }: { summary: WeekSummary; titleNames: string[]; onClose: () => void }) {
  const diff = summary.minutes - summary.prevMinutes
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="週のまとめ">
      <div className="modal">
        <p className="modal-kicker">📅 先週のまとめ（{summary.week.slice(5).replace('-', '/')}〜）</p>
        <div className="stat-row" style={{ marginTop: 8 }}>
          <div className="stat-tile"><div className="muted">学習時間</div><div className="stat-value">{summary.minutes}分</div>
            <div className="muted stat-sub">{summary.prevMinutes ? `前の週より ${diff >= 0 ? '+' : ''}${diff}分` : ''}</div></div>
          <div className="stat-tile"><div className="muted">練習した日</div><div className="stat-value">{summary.days}日</div></div>
          <div className="stat-tile"><div className="muted">思い出そうとした</div><div className="stat-value">{summary.attempts}回</div></div>
        </div>
        <ul className="steps" style={{ marginTop: 10 }}>
          <li>新しく覚え始めた語：{summary.newCards}語</li>
          {summary.bestWord && <li>一番よく思い出せた語：<strong>{summary.bestWord}</strong></li>}
          <li>集めた雑学：{summary.facts}個</li>
          {titleNames.length > 0 && <li>手に入れた称号：{titleNames.join('、')}</li>}
        </ul>
        <p className="muted">比べるのは、過去の自分とだけ。今週も少しずつ続けましょう。</p>
        <button className="btn block" onClick={onClose}>今週も始める</button>
      </div>
    </div>
  )
}
