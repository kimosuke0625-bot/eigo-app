import { useEffect, useState } from 'react'
import { db, type Settings } from '../db/schema'
import { dayKey } from '../today/menu'
import { Steps } from '../ui/Steps'
import { HelpButton } from './PracticeHelp'
import { ClaudePromptBox } from './ClaudePromptBox'
import { conversationPrompt, SCENES, type Level, type Scene } from './claudePrompts'
import { currentLevel } from './output'

/**
 * Claude との会話練習。場面とレベルを書き込んだ依頼文をコピーして、Claude に貼って会話する。
 * 会話はアプリの外で行うので、終わったら練習した時間を記録する。
 */
export function ConversationScreen({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  const [level, setLevel] = useState<Level | null>(null)
  const [scene, setScene] = useState<Scene | null>(null)
  const [logged, setLogged] = useState<number | null>(null)
  useEffect(() => { void currentLevel(settings.phase).then(setLevel) }, [settings.phase])
  if (!level) return <p className="muted">準備中…</p>
  const scenes = SCENES.filter((s) => s.minPhase <= settings.phase)

  const log = async (minutes: number) => {
    await db.sessions.add({ at: Date.now(), day: dayKey(), kind: 'conversation', pillar: 'output', seconds: minutes * 60, ref: scene?.id })
    setLogged(minutes)
  }

  return (
    <div>
      <div className="practice-top"><HelpButton k="conversation" settings={settings} /></div>
      <Steps steps={['場面を選ぶ', 'Claude と会話', '時間を記録']} current={logged !== null ? 3 : scene ? 1 : 0}
        guide={!scene ? '練習したい場面を選びましょう。' : logged === null ? '依頼文をコピーして Claude に貼り、英語で会話しましょう。終わったら戻ってきて時間を記録します。' : 'おつかれさまでした。'} />
      {!scene && (
        <div>
          {scenes.map((s) => (
            <button key={s.id} className="menu-item as-button" onClick={() => setScene(s)}>
              <div className="body">
                <div className="name">{s.label}</div>
                <div className="muted">目的：{s.goal}</div>
              </div>
              <span className="min">▶</span>
            </button>
          ))}
          {SCENES.length > scenes.length && <p className="muted">ほかの場面（交渉・苦情対応・面接など）は Phase 3 から選べます。</p>}
          <button className="btn secondary block" onClick={onExit}>戻る</button>
        </div>
      )}
      {scene && (
        <section className="card stack">
          <h2>{scene.label}</h2>
          <p>目的：{scene.goal}</p>
          <ClaudePromptBox label="会話練習の依頼文をコピー" prompt={conversationPrompt({ level, scene })}
            note="Claude が英語で話しかけてきます。6〜8往復したら、ふり返りを日本語でしてくれます。" />
          {logged === null ? (
            <>
              <p>会話が終わったら、練習した時間を記録しましょう（学習時間の「アウトプット」に入ります）：</p>
              <div className="seg">
                {[5, 10, 15, 20].map((m) => <button key={m} onClick={() => void log(m)}>{m}分</button>)}
              </div>
            </>
          ) : (
            <p className="banner ok">{logged}分の会話練習を記録しました。</p>
          )}
          <button className="btn secondary block" onClick={() => (logged === null ? setScene(null) : onExit())}>
            {logged === null ? '場面を選び直す' : '今日の画面に戻る'}
          </button>
        </section>
      )}
    </div>
  )
}
