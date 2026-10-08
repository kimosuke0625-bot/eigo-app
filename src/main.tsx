import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// ゲーム風の書体（見出しと数字だけに使う）。SIL Open Font License 1.1
import '@fontsource/dotgothic16/400.css'
import './index.css'
import './rpg.css'
import './rpg-world.css'
import App from './App.tsx'

// 保存データがブラウザに消されにくくなるよう永続化を要求する
navigator.storage?.persist?.().catch(() => {})

// オフラインでも開けるよう、画面と教材を端末に保存する（公開版だけ。開発中は使わない）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}) })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
