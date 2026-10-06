/** 高品質な英語の声を端末に追加する手順 */
export function VoiceInstallGuide() {
  return (
    <div>
      <p><strong>高品質な英語の声が入っていないため、端末の声では読み上げません。</strong></p>
      <p>iPhone での追加の手順：</p>
      <ol className="steps">
        <li>「設定」アプリ →「アクセシビリティ」→「読み上げコンテンツ」→「声」</li>
        <li>「英語」→ 好きな声（例：Ava、Zoe、Evan など）を選ぶ</li>
        <li>「拡張」または「プレミアム」と書かれた版をダウンロードする（Wi-Fi 推奨）</li>
        <li>このアプリを一度閉じて開き直す</li>
      </ol>
      <p className="muted">PC では Microsoft Edge（Natural の声）か Chrome（Google の声）で開いてください。</p>
    </div>
  )
}
