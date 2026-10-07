import type { Settings } from '../db/schema'
import { CollectionScreen } from '../rewards/CollectionScreen'
import { PixelIcon } from '../ui/PixelIcon'
import { NotebookScreen } from './NotebookScreen'
import { WeaknessScreen } from './WeaknessScreen'
import { FeedbackLog } from './FeedbackLog'

export type BagSection = 'facts' | 'notebook' | 'weak' | 'log'

const SECTIONS: { key: BagSection; label: string; icon: string }[] = [
  { key: 'facts', label: '雑学図鑑', icon: 'gem' },
  { key: 'notebook', label: '旅の手帳', icon: 'book' },
  { key: 'weak', label: '弱点の研究', icon: 'slime' },
  { key: 'log', label: '添削の記録', icon: 'scroll' },
]

/** 持ち物：雑学図鑑（称号も）、旅の手帳（表現ノート）、弱点の研究（苦手ノート）、添削の記録 */
export function BagScreen({ settings, section, onSection, onImport, onRetell }: {
  settings: Settings
  section: BagSection
  onSection: (s: BagSection) => void
  onImport: () => void
  onRetell: () => void
}) {
  return (
    <div>
      <nav className="bag-tabs" aria-label="持ち物の切り替え">
        {SECTIONS.map((s) => (
          <button key={s.key} aria-pressed={section === s.key} onClick={() => onSection(s.key)}>
            <PixelIcon name={s.icon} size={22} />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>
      {section === 'facts' && <CollectionScreen settings={settings} />}
      {section === 'notebook' && <NotebookScreen settings={settings} onImport={onImport} />}
      {section === 'weak' && <WeaknessScreen voiceURI={settings.voiceURI} onRetell={onRetell} onImport={onImport} />}
      {section === 'log' && <FeedbackLog voiceURI={settings.voiceURI} onImport={onImport} />}
    </div>
  )
}
