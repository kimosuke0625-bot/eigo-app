export function Placeholder({ title, text, devPhase }: { title: string; text: string; devPhase: number }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted">{text}</p>
      <p style={{ marginTop: 8 }}><span className="tag soon">開発フェーズ{devPhase}〜</span></p>
    </section>
  )
}
