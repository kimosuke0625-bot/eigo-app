import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Reward, type Settings } from '../db/schema'
import { updateSettings } from '../db/settings'
import { SOUND_SETS, THEMES } from '../rewards/titles'
import { playChime, playCorrect, setSoundSet } from '../rewards/sound'

/** 称号で解放した配色テーマと効果音セットを選ぶ */
export function LookSection({ settings }: { settings: Settings }) {
  const rows = useLiveQuery(() => db.rewards.toArray(), [], [] as Reward[])
  const themes = new Set(['indigo', ...rows.filter((r) => r.kind === 'theme').map((r) => r.key)])
  const sounds = new Set(['classic', ...rows.filter((r) => r.kind === 'soundSet').map((r) => r.key)])
  return (
    <section className="card stack">
      <h2>配色テーマと効果音（称号で解放）</h2>
      <div className="seg">
        {Object.entries(THEMES).map(([key, t]) => (
          <button key={key} aria-pressed={settings.accentTheme === key} disabled={!themes.has(key)}
            onClick={() => void updateSettings({ accentTheme: key })}>
            <span className="swatch" style={{ background: t.btn }} /> {themes.has(key) ? t.name : '🔒'}
          </button>
        ))}
      </div>
      <div className="seg">
        {Object.entries(SOUND_SETS).map(([key, name]) => (
          <button key={key} aria-pressed={settings.soundSet === key} disabled={!sounds.has(key)}
            onClick={() => { void updateSettings({ soundSet: key }); setSoundSet(key); playChime(); window.setTimeout(() => playCorrect(3), 900) }}>
            {sounds.has(key) ? name : '🔒'}
          </button>
        ))}
      </div>
      <p className="muted">🔒 は、まだ解放していないもの。どの称号で解放されるかは図鑑の「称号」で確かめられます。</p>
    </section>
  )
}
