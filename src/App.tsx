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
import { ShadowingScreen } from './practice/ShadowingScreen'
import { PronunciationScreen } from './practice/PronunciationScreen'
import { SpeechScreen } from './practice/SpeechScreen'
import { FluencyHub } from './practice/FluencyHub'
import { OutputScreen } from './practice/OutputScreen'
import { AssessmentScreen } from './assessment/AssessmentScreen'
import { ConversationScreen } from './practice/ConversationScreen'
import { HelpButton } from './practice/PracticeHelp'
import { NO_HQ_VOICE_EVENT } from './speech/voices'
import { ReviewScreen } from './practice/ReviewScreen'
import { NewCardsScreen } from './practice/NewCardsScreen'
import { DiagnosticScreen } from './assessment/DiagnosticScreen'
import type { PracticeKind } from './today/menu'
import { ProgressScreen } from './progress/ProgressScreen'
import { CollectionScreen } from './rewards/CollectionScreen'
import { useDailyRewards } from './rewards/useDailyRewards'
import { setSoundEnabled, setSoundSet } from './rewards/sound'
import { THEMES } from './rewards/titles'
import { checkPhase } from './progress/autoPhase'

export type Tab = 'today' | 'practice' | 'progress' | 'materials' | 'collection' | 'settings'

type Overlay = { practice: PracticeKind; materialId?: string; speed?: boolean } | { diagnostic: true } | null

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: '今日', icon: '☀️' },
  { id: 'practice', label: '練習', icon: '🎯' },
  { id: 'progress', label: '進捗', icon: '📈' },
  { id: 'materials', label: '素材', icon: '📚' },
  { id: 'collection', label: '図鑑', icon: '🗂️' },
  { id: 'settings', label: '設定', icon: '⚙️' },
]

function useTheme(mode: ThemeMode | undefined, accent = 'indigo') {
  useEffect(() => {
    if (!mode) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      // 称号で解放した配色テーマ（アクセントの色だけを変える）
      const t = THEMES[accent] ?? THEMES.indigo
      document.documentElement.style.setProperty('--primary', dark ? t.primaryDark : t.primary)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [mode, accent])
}

export default function App() {
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('today')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [contentError, setContentError] = useState('')
  useTheme(settings?.theme, settings?.accentTheme)
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
  useEffect(() => setSoundSet(settings?.soundSet ?? 'classic'), [settings?.soundSet])

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
  // 高品質な声がなくて読み上げられなかったときの案内
  const [noVoice, setNoVoice] = useState(false)
  useEffect(() => {
    // 一度だけ出して、8秒たったら自動で消す（練習の邪魔をしない）
    const on = () => { setNoVoice(true); window.setTimeout(() => setNoVoice(false), 8000) }
    window.addEventListener(NO_HQ_VOICE_EVENT, on)
    return () => window.removeEventListener(NO_HQ_VOICE_EVENT, on)
  }, [])

  const close = () => { setOverlay(null); setClock(Date.now()) }
  const start = (k: PracticeKind, materialId?: string) => setOverlay({ practice: k, materialId })

  let body
  if (overlay && 'diagnostic' in overlay) {
    body = <DiagnosticScreen onDone={close} />
  } else if (overlay?.practice === 'review') {
    body = <><div className="practice-top"><HelpButton k="review" settings={settings} /></div><ReviewScreen key="review" settings={settings} onExit={close} onAddCards={() => start('addCards')} /></>
  } else if (overlay?.practice === 'addCards') {
    body = <><div className="practice-top"><HelpButton k="addCards" settings={settings} /></div><NewCardsScreen key="add" settings={settings} onExit={close} onReview={() => start('review')} /></>
  } else if (overlay?.practice === 'input') {
    body = <><div className="practice-top"><HelpButton k="input" settings={settings} /></div><InputScreen key={overlay.materialId ?? 'input'} settings={settings} materialId={overlay.materialId} onExit={close}
      onDictation={(id) => start('dictation', id)} /></>
  } else if (overlay?.practice === 'dictation') {
    body = <><div className="practice-top"><HelpButton k="dictation" settings={settings} /></div><DictationScreen key={overlay.materialId ?? 'dict'} settings={settings} materialId={overlay.materialId} onExit={close} /></>
  } else if (overlay?.practice === 'shadowing') {
    body = <ShadowingScreen settings={settings} onExit={close} />
  } else if (overlay?.practice === 'pronunciation') {
    body = <PronunciationScreen settings={settings} onExit={close} />
  } else if (overlay?.practice === 'assessment') {
    body = <AssessmentScreen settings={settings} onExit={close} />
  } else if (overlay?.practice === 'output') {
    body = <OutputScreen settings={settings} onExit={close} />
  } else if (overlay?.practice === 'conversation') {
    body = <ConversationScreen settings={settings} onExit={close} />
  } else if (overlay?.practice === 'speech') {
    body = <SpeechScreen settings={settings} onExit={close} />
  } else if (overlay?.practice === 'fluency' && !overlay.materialId && !overlay.speed) {
    body = <FluencyHub onSpeech={() => start('speech')} onSpeed={() => setOverlay({ practice: 'fluency', speed: true })} onExit={close} />
  } else if (overlay?.practice === 'fluency') {
    body = <><div className="practice-top"><HelpButton k="speedRead" settings={settings} /></div><SpeedReadScreen key={overlay.materialId ?? 'speed'} settings={settings} materialId={overlay.materialId} onExit={close} /></>
  } else if (tab === 'today') {
    body = <TodayScreen settings={settings} dueCount={dueCount} onSettings={() => setTab('settings')}
      onStart={start} onDiagnostic={() => setOverlay({ diagnostic: true })} />
  } else if (tab === 'practice') {
    body = <PracticeHub onStart={start} dueCount={dueCount} />
  } else if (tab === 'progress') {
    body = <ProgressScreen settings={settings} onAssess={() => start('assessment')} />
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
      {noVoice && (
        <div className="toast" role="status">
          <span>🔈 高品質な英語の声が見つからないため、使える中で一番よい声で読み上げています（設定 →「読み上げの声」で確認できます）。</span>
          <button className="icon-btn" aria-label="閉じる" onClick={() => setNoVoice(false)}>✕</button>
        </div>
      )}
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
