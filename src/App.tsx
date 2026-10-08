import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSettings } from './db/settings'
import type { Settings, ThemeMode } from './db/schema'
import { TodayScreen } from './today/TodayScreen'
import { SettingsScreen } from './settings/SettingsScreen'
import { Onboarding } from './settings/Onboarding'
import { PHASE_COLORS } from './ui/theme'
import { loadBsl, loadNgsl } from './content/ngsl'
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
import { RoleplayScreen } from './practice/RoleplayScreen'
import { HelpButton } from './practice/PracticeHelp'
import { NO_HQ_VOICE_EVENT } from './speech/voices'
import { ReviewScreen } from './practice/ReviewScreen'
import { NewCardsScreen } from './practice/NewCardsScreen'
import { DiagnosticScreen } from './assessment/DiagnosticScreen'
import type { PracticeKind } from './today/menu'
import { ProgressScreen } from './progress/ProgressScreen'
import { useDailyRewards } from './rewards/useDailyRewards'
import { setSoundEnabled, setSoundSet } from './rewards/sound'
import { THEMES } from './rewards/titles'
import { checkPhase } from './progress/autoPhase'
import { PixelIcon } from './ui/PixelIcon'
import { ImportScreen, type FeedbackLink } from './notes/ImportScreen'
import { RetellScreen } from './notes/RetellScreen'
import { BagScreen, type BagSection } from './notes/BagScreen'
import { BossScreen } from './rewards/BossScreen'
import { syncPhraseItems } from './notes/store'
import { ExprReviewScreen } from './practice/ExprReviewScreen'
import { prefetchUpcoming } from './speech/audioBank'
import { db } from './db/schema'
import { deckOf } from './srs/deck'
import { dueCounts } from './srs/store'
import type { Deck } from './srs/deck'
import { SpeechNotice } from './speech/SpeechNotice'

export type Tab = 'today' | 'practice' | 'progress' | 'materials' | 'collection' | 'settings'

type Overlay = { practice: PracticeKind; materialId?: string; speed?: boolean; link?: FeedbackLink } | { diagnostic: true } | null

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: '今日', icon: 'sun' },
  { id: 'practice', label: '練習', icon: 'sword' },
  { id: 'progress', label: '進捗', icon: 'flag' },
  { id: 'materials', label: '素材', icon: 'book' },
  { id: 'collection', label: '持ち物', icon: 'bag' },
  { id: 'settings', label: '設定', icon: 'gear' },
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
      const root = document.documentElement.style
      root.setProperty('--primary', dark ? t.primaryDark : t.primary)
      // RPG 風の画面のボタンと見出しの色
      root.setProperty('--rpg-btn', t.btn)
      root.setProperty('--rpg-btn-dark', t.btnDark)
      root.setProperty('--rpg-accent', t.accent)
      root.setProperty('--rpg-accent-dark', t.accentDark)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [mode, accent])
}

async function prefetchDueAudio() {
  const cards = (await db.cards.where('due').below(Date.now() + 3 * 86_400_000).sortBy('due')).filter((c) => deckOf(c.itemId) === 'word')
  const items = new Map((await db.items.bulkGet(cards.map((c) => c.itemId))).flatMap((i) => (i ? [[i.id, i] as const] : [])))
  await prefetchUpcoming(cards, items)
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
  const dueCount = useLiveQuery(() => dueCounts(clock), [clock], { word: 0, expr: 0 })

  useEffect(() => {
    loadNgsl().then(() => loadBsl()).catch((e: Error) => setContentError(e.message))
    // 旅の手帳の表現を復習カードの語として用意する（バックアップから戻したときも）
    void syncPhraseItems()
    // これから3日のうちに復習する単語の音声を、通信できるうちに端末へ保存しておく（オフラインでも鳴るように）
    void checkPhase()
    const t = window.setTimeout(() => { void prefetchDueAudio() }, 5000)
    return () => window.clearTimeout(t)
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
  dueCount: Record<Deck, number>
  setClock: (n: number) => void
}) {
  const rewards = useDailyRewards(settings, overlay === null)
  const [bag, setBag] = useState<BagSection>('facts')
  // 通信できないとき（オフライン）の小さな表示
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(navigator.onLine)
    window.addEventListener('online', on)
    window.addEventListener('offline', on)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on) }
  }, [])
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
  const importFeedback = (link?: FeedbackLink) => setOverlay({ practice: 'importFeedback', link })
  const openBag = (s: BagSection) => { close(); setTab('collection'); setBag(s) }

  let body
  if (overlay && 'diagnostic' in overlay) {
    body = <DiagnosticScreen onDone={close} />
  } else if (overlay?.practice === 'review') {
    body = <><div className="practice-top"><HelpButton k="review" settings={settings} /></div><ReviewScreen key="review" settings={settings} onExit={close} onAddCards={() => start('addCards')} /></>
  } else if (overlay?.practice === 'exprReview') {
    body = <><div className="practice-top"><HelpButton k="exprReview" settings={settings} /></div><ExprReviewScreen key="expr" settings={settings} onExit={close} onImport={() => importFeedback()} /></>
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
    body = <OutputScreen settings={settings} onExit={close} onImport={importFeedback} />
  } else if (overlay?.practice === 'conversation') {
    body = <ConversationScreen settings={settings} onExit={close} onImport={importFeedback} />
  } else if (overlay?.practice === 'roleplay') {
    body = <RoleplayScreen settings={settings} onExit={close} />
  } else if (overlay?.practice === 'speech') {
    body = <SpeechScreen settings={settings} onExit={close} onImport={importFeedback} />
  } else if (overlay?.practice === 'importFeedback') {
    body = <ImportScreen link={overlay.link} onExit={close} onNotebook={() => openBag('notebook')} />
  } else if (overlay?.practice === 'retell') {
    body = <RetellScreen settings={settings} onExit={close} />
  } else if (overlay?.practice === 'boss') {
    body = <BossScreen settings={settings} onExit={close} />
  } else if (overlay?.practice === 'fluency' && !overlay.materialId && !overlay.speed) {
    body = <FluencyHub onSpeech={() => start('speech')} onSpeed={() => setOverlay({ practice: 'fluency', speed: true })} onExit={close} />
  } else if (overlay?.practice === 'fluency') {
    body = <><div className="practice-top"><HelpButton k="speedRead" settings={settings} /></div><SpeedReadScreen key={overlay.materialId ?? 'speed'} settings={settings} materialId={overlay.materialId} onExit={close} /></>
  } else if (tab === 'today') {
    body = <TodayScreen settings={settings} dueCount={dueCount} onSettings={() => setTab('settings')}
      onStart={start} onDiagnostic={() => setOverlay({ diagnostic: true })} onMap={() => setTab('progress')} />
  } else if (tab === 'practice') {
    body = <PracticeHub onStart={start} dueCount={dueCount} />
  } else if (tab === 'progress') {
    body = <ProgressScreen settings={settings} onAssess={() => start('assessment')} />
  } else if (tab === 'materials') {
    body = <MaterialsScreen onRead={(id) => start('input', id)} onSpeed={(id) => start('fluency', id)} />
  } else if (tab === 'collection') {
    body = <BagScreen settings={settings} section={bag} onSection={setBag} onImport={() => importFeedback()} onRetell={() => start('retell')} />
  } else {
    body = <SettingsScreen settings={settings} onDiagnostic={() => setOverlay({ diagnostic: true })} />
  }

  // フェーズ6.5：すべての画面を RPG 風の見た目にする
  return (
    <div className="app rpg">
      <header className="header">
        <h1>英語マスター 2年計画</h1>
        <span className="phase-chip" style={{ background: PHASE_COLORS[settings.phase] }}>
          Phase {settings.phase}
        </span>
      </header>

      {!online && <div className="banner info offline-note">📴 オフラインです。練習と記録はそのまま続けられます（記録はこの端末に保存されます）。Claude への依頼など、通信が必要なものは通信が戻ってから使えます。</div>}
      {contentError && <div className="banner warn">{contentError}。通信できる場所でもう一度開いてください。</div>}
      {noVoice && (
        <div className="toast" role="status">
          <span>🔈 高品質な英語の声が見つからないため、使える中で一番よい声で読み上げています（設定 →「読み上げの声」で確認できます）。</span>
          <button className="icon-btn" aria-label="閉じる" onClick={() => setNoVoice(false)}>✕</button>
        </div>
      )}
      {body}
      <SpeechNotice />
      {rewards}

      {!overlay && (
        <nav className="tabbar" aria-label="画面の切り替え">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              <PixelIcon name={t.icon} size={22} />
              {t.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
