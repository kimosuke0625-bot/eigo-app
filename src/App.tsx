import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSettings } from './db/settings'
import { db, type ThemeMode } from './db/schema'
import { TodayScreen } from './today/TodayScreen'
import { SettingsScreen } from './settings/SettingsScreen'
import { Onboarding } from './settings/Onboarding'
import { Placeholder } from './ui/Placeholder'
import { PHASE_COLORS } from './ui/theme'
import { loadNgsl } from './content/ngsl'
import { PracticeHub } from './practice/PracticeHub'
import { ReviewScreen } from './practice/ReviewScreen'
import { NewCardsScreen } from './practice/NewCardsScreen'
import { DiagnosticScreen } from './assessment/DiagnosticScreen'
import type { PracticeKind } from './today/menu'

export type Tab = 'today' | 'practice' | 'progress' | 'materials' | 'collection' | 'settings'

type Overlay = { practice: PracticeKind } | { diagnostic: true } | null

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: '今日', icon: '☀️' },
  { id: 'practice', label: '練習', icon: '🎯' },
  { id: 'progress', label: '進捗', icon: '📈' },
  { id: 'materials', label: '素材', icon: '📚' },
  { id: 'collection', label: '図鑑', icon: '🗂️' },
  { id: 'settings', label: '設定', icon: '⚙️' },
]

function useTheme(mode: ThemeMode | undefined) {
  useEffect(() => {
    if (!mode) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [mode])
}

export default function App() {
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('today')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [contentError, setContentError] = useState('')
  useTheme(settings?.theme)
  // 期日が来たカードの数（数分ごとに新しく来る分も拾う）
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setClock(Date.now()), 60000)
    return () => window.clearInterval(t)
  }, [])
  const dueCount = useLiveQuery(() => db.cards.where('due').belowOrEqual(clock).count(), [clock], 0)

  useEffect(() => {
    loadNgsl().catch((e: Error) => setContentError(e.message))
  }, [])

  if (!settings) return null
  if (!settings.onboarded) return <Onboarding settings={settings} />

  const close = () => { setOverlay(null); setClock(Date.now()) }
  const start = (k: PracticeKind) => setOverlay({ practice: k })

  let body
  if (overlay && 'diagnostic' in overlay) {
    body = <DiagnosticScreen onDone={close} />
  } else if (overlay?.practice === 'review') {
    body = <ReviewScreen key="review" settings={settings} onExit={close} onAddCards={() => start('addCards')} />
  } else if (overlay?.practice === 'addCards') {
    body = <NewCardsScreen key="add" settings={settings} onExit={close} onReview={() => start('review')} />
  } else if (tab === 'today') {
    body = <TodayScreen settings={settings} dueCount={dueCount} onSettings={() => setTab('settings')}
      onStart={start} onDiagnostic={() => setOverlay({ diagnostic: true })} />
  } else if (tab === 'practice') {
    body = <PracticeHub onStart={start} dueCount={dueCount} />
  } else if (tab === 'progress') {
    body = <Placeholder title="進捗" devPhase={3}
      text="学習時間・継続日数・語彙数・正答率のグラフをフェーズ3で追加します。記録はすでに端末内に保存されています。" />
  } else if (tab === 'materials') {
    body = <Placeholder title="素材" devPhase={4}
      text="内蔵素材の一覧と、文章を貼り付けて取り込む機能をフェーズ4で追加します。" />
  } else if (tab === 'collection') {
    body = <Placeholder title="図鑑" devPhase={3}
      text="前回アプリの雑学365個（英語版つき）と称号をフェーズ3で追加します。" />
  } else {
    body = <SettingsScreen settings={settings} onDiagnostic={() => setOverlay({ diagnostic: true })} />
  }

  return (
    <div className="app">
      <header className="header">
        <h1>英語マスター 2年計画</h1>
        <span className="phase-chip" style={{ background: PHASE_COLORS[settings.phase] }}>
          Phase {settings.phase}
        </span>
      </header>

      {contentError && <div className="banner warn">{contentError}。通信できる場所でもう一度開いてください。</div>}
      {body}

      {!overlay && (
        <nav className="tabbar" aria-label="画面の切り替え">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              <span className="ico" aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
