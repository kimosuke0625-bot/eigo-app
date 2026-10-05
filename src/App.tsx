import { useEffect, useState } from 'react'
import { useSettings } from './db/settings'
import type { ThemeMode } from './db/schema'
import { TodayScreen } from './today/TodayScreen'
import { SettingsScreen } from './settings/SettingsScreen'
import { Onboarding } from './settings/Onboarding'
import { Placeholder } from './ui/Placeholder'
import { PHASE_COLORS } from './ui/theme'

export type Tab = 'today' | 'practice' | 'progress' | 'materials' | 'collection' | 'settings'

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
  useTheme(settings?.theme)

  if (!settings) return null
  if (!settings.onboarded) return <Onboarding settings={settings} />

  return (
    <div className="app">
      <header className="header">
        <h1>英語マスター 2年計画</h1>
        <span className="phase-chip" style={{ background: PHASE_COLORS[settings.phase] }}>
          Phase {settings.phase}
        </span>
      </header>

      {tab === 'today' && <TodayScreen settings={settings} onNavigate={setTab} />}
      {tab === 'practice' && (
        <Placeholder title="練習" devPhase={2}
          text="復習カードはフェーズ2、聞く・読むはフェーズ4、話すはフェーズ5、書くはフェーズ6で追加します。" />
      )}
      {tab === 'progress' && (
        <Placeholder title="進捗" devPhase={3}
          text="学習時間・継続日数・語彙数・正答率のグラフをフェーズ3で追加します。記録はすでに端末内に保存される仕組みです。" />
      )}
      {tab === 'materials' && (
        <Placeholder title="素材" devPhase={4}
          text="内蔵素材の一覧と、文章を貼り付けて取り込む機能をフェーズ4で追加します。" />
      )}
      {tab === 'collection' && (
        <Placeholder title="図鑑" devPhase={3}
          text="前回アプリの雑学365個（英語版つき）と称号をフェーズ3で追加します。" />
      )}
      {tab === 'settings' && <SettingsScreen settings={settings} />}

      <nav className="tabbar" aria-label="画面の切り替え">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <span className="ico" aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
