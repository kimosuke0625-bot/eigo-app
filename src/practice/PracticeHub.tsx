import { BASE_MENU, PILLAR_LABELS, type PracticeKind } from '../today/menu'
import { DEV_PHASE } from '../today/devPhase'
import { PixelIcon } from '../ui/PixelIcon'
import { isBossDay } from '../rewards/boss'
import type { Pillar } from '../db/schema'

type Extra = { kind: PracticeKind; name: string; detail: string; pillar: Pillar; icon: string }

const EXTRAS: Extra[] = [
  { kind: 'roleplay', name: '対話の役割練習', detail: 'ビジネス場面の対話（36本）で片方の役を担当し、せりふを声に出して録音・聞き比べ', pillar: 'output', icon: 'scroll' },
  { kind: 'conversation', name: 'Claude と会話練習', detail: '場面（電話・会議・交渉など）とレベルを書き込んだ依頼文をコピーして、Claude と英語で話す', pillar: 'output', icon: 'scroll' },
  { kind: 'dictation', name: 'ディクテーション', detail: '覚えたカードの例文を聞いて書き取る。自動で採点し、違う所を色で示す', pillar: 'language', icon: 'scroll' },
  { kind: 'retell', name: '言い直しの練習', detail: '添削で直された過去の自分の文を、正しく言い直す', pillar: 'language', icon: 'sword' },
]

/** 練習の一覧（依頼の掲示板）。1日のメニューの練習と、追加の練習 */
export function PracticeHub({ onStart, dueCount }: { onStart: (k: PracticeKind) => void; dueCount: number }) {
  const boss = isBossDay()
  return (
    <div>
      <h2 className="quest-board-title"><PixelIcon name="scroll" size={22} /> 1日のメニューの依頼</h2>
      {BASE_MENU.map((m) => {
        const ready = m.availableFrom <= DEV_PHASE
        return (
          <button key={m.kind} className="menu-item as-button" disabled={!ready} onClick={() => onStart(m.kind)}>
            <PixelIcon name={m.kind === 'review' ? 'sword' : 'scroll'} size={28} className="quest-icon" />
            <div className="body">
              <div className="name">
                {m.label}
                {m.kind === 'review' && dueCount > 0 && <span className="badge">{dueCount}</span>}
              </div>
              <div className="muted">{m.detail}</div>
              <div style={{ marginTop: 4 }}>
                <span className="tag">{PILLAR_LABELS[m.pillar]}</span>
                {!ready && <span className="tag soon">開発フェーズ{m.availableFrom}で追加</span>}
              </div>
            </div>
            {ready && <span className="min">▶</span>}
          </button>
        )
      })}

      <h2 className="quest-board-title"><PixelIcon name="dragon" size={22} /> 週のボス</h2>
      <button className={`menu-item as-button${boss ? ' boss-ready' : ''}`} onClick={() => onStart('boss')}>
        <PixelIcon name="dragon" size={28} className="quest-icon" />
        <div className="body">
          <div className="name">忘却のドラゴン{boss && <span className="tag focus-tag">出現中</span>}</div>
          <div className="muted">週末（土・日）に現れる。その週に学んだ語の意味を選んで戦う</div>
        </div>
        <span className="min">▶</span>
      </button>

      <h2 className="quest-board-title"><PixelIcon name="book" size={22} /> 添削を生かす</h2>
      <button className="menu-item as-button" onClick={() => onStart('importFeedback')}>
        <PixelIcon name="scroll" size={28} className="quest-icon" />
        <div className="body">
          <div className="name">添削を取り込む</div>
          <div className="muted">Claude の返事を貼り付けて、直しと新しい表現を保存する（旅の手帳・弱点の研究へ）</div>
        </div>
        <span className="min">▶</span>
      </button>

      <h2 className="quest-board-title"><PixelIcon name="scroll" size={22} /> 追加の依頼（1日のメニューの外）</h2>
      {EXTRAS.map((x) => (
        <button key={x.kind} className="menu-item as-button" onClick={() => onStart(x.kind)}>
          <PixelIcon name={x.icon} size={28} className="quest-icon" />
          <div className="body">
            <div className="name">{x.name}</div>
            <div className="muted">{x.detail}</div>
            <div style={{ marginTop: 4 }}><span className="tag">{PILLAR_LABELS[x.pillar]}</span></div>
          </div>
          <span className="min">▶</span>
        </button>
      ))}
    </div>
  )
}
