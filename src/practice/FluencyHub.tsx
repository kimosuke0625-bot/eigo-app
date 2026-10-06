import { Steps } from '../ui/Steps'

/** 流暢さの訓練：4/3/2スピーチか速読を選ぶ */
export function FluencyHub({ onSpeech, onSpeed, onExit }: { onSpeech: () => void; onSpeed: () => void; onExit: () => void }) {
  return (
    <div>
      <Steps steps={[]} current={0} guide="どちらか1つを選びましょう。話す日と読む日を交互にするのがおすすめです。" />
      <button className="menu-item as-button" onClick={onSpeech}>
        <div className="body">
          <div className="name">🗣 4/3/2スピーチ</div>
          <div className="muted">同じ話を4分 → 3分 → 2分で3回話す（約10分）</div>
        </div>
        <span className="min">▶</span>
      </button>
      <button className="menu-item as-button" onClick={onSpeed}>
        <div className="body">
          <div className="name">⏱ 速読</div>
          <div className="muted">やさしい英文をいつもより速く読み、1分あたりの語数を測る（約5分）</div>
        </div>
        <span className="min">▶</span>
      </button>
      <button className="btn secondary block" style={{ marginTop: 12 }} onClick={onExit}>戻る</button>
    </div>
  )
}
