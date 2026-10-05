import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSettings } from './db/settings'
import { db, type Settings, type ThemeMode } from './db/schema'
import { TodayScreen } from './today/TodayScreen'
import { SettingsScreen } from './settings/SettingsScreen'
import { Onboarding } from './settings/Onboarding'
import { PHASE_COLORS } from './ui/theme'
import { loadNgsl } from './content/ngsl'
import { PracticeHub } from './practice/PracticeHub'
import { InputScreen } from './practice/InputScreen'
import { DictationScreen } from './practice/DictationScreen'
import { SpeedReadScreen } from './practice/SpeedReadScreen'
import { MaterialsScreen } from './content/MaterialsScreen'
import { ReviewScreen } from './practice/ReviewScreen'
import { NewCardsScreen } from './practice/NewCardsScreen'
import { DiagnosticScreen } from './assessment/DiagnosticScreen'
import type { PracticeKind } from './today/menu'
import { ProgressScreen } from './progress/ProgressScreen'
import { CollectionScreen } from './rewards/CollectionScreen'
import { useDailyRewards } from './rewards/useDailyRewards'
import { setSoundEnabled } from './rewards/sound'
import { checkPhase } from './progress/autoPhase'

export type Tab = 'today' | 'practice' | 'progress' | 'materials' | 'collection' | 'settings'

type Overlay = { practice: PracticeKind; materialId?: string } | { diagnostic: true } | null

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
    void checkPhase()
  }, [])
  useEffect(() => setSoundEnabled(settings?.sound ?? true), [settings?.sound])

  if (!settings) return null
  if (!settings.onboarded) return <Onboarding settings={settings} />
  return <Main settings={settings} tab={tab} setTab={setTab} overlay={overlay} setOverlay={setOverlay}
    contentError={contentError} dueCount={dueCount} setClock={setClock} />
}

function Main({ settings, tab, setTab, overlay, setOverlay, contentError, dueCount, setClock }: {
  settings: Settings
  tab: Tab
  setTab: (t: Tab) => void
  overlay: Overlay
  setOverlay: (o: Overlay) => void
  contentError: string
  dueCount: number
  setClock: (n: number) => void
}) {
  const rewards = useDailyRewards(settings, overlay === null)

  const close = () => { setOverlay(null); setClock(Date.now()) }
  const start = (k: PracticeKind, materialId?: string) => setOverlay({ practice: k, materialId })

  let body
  if (overlay && 'diagnostic' in overlay) {
    body = <DiagnosticScreen onDone={close} />
  } else if (overlay?.practice === 'review') {
    body = <ReviewScreen key="review" settings={settings} onExit={close} onAddCards={() => start('addCards')} />
  } else if (overlay?.practice === 'addCards') {
    body = <NewCardsScreen key="add" settings={settings} onExit={close} onReview={() => start('review')} />
  } else if (overlay?.practice === 'input') {
    body = <InputScreen key={overlay.materialId ?? 'input'} settings={settings} materialId={overlay.materialId} onExit={close}
      onDictation={(id) => start('dictation', id)} />
  } else if (overlay?.practice === 'dictation') {
    body = <DictationScreen key={overlay.materialId ?? 'dict'} settings={settings} materialId={overlay.materialId} onExit={close} />
  } else if (overlay?.practice === 'fluency') {
    body = <SpeedReadScreen key={overlay.materialId ?? 'speed'} settings={settings} materialId={overlay.materialId} onExit={close} />
  } else if (tab === 'today') {
    body = <TodayScreen settings={settings} dueCount={dueCount} onSettings={() => setTab('settings')}
      onStart={start} onDiagnostic={() => setOverlay({ diagnostic: true })} />
  } else if (tab === 'practice') {
    body = <PracticeHub onStart={start} dueCount={dueCount} />
  } else if (tab === 'progress') {
    body = <ProgressScreen settings={settings} />
  } else if (tab === 'materials') {
    body = <MaterialsScreen onRead={(id) => start('input', id)} onSpeed={(id) => start('fluency', id)} />
  } else if (tab === 'collection') {
    body = <CollectionScreen settings={settings} />
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
      {rewards}

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
