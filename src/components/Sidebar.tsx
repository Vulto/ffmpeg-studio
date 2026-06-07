import { Clapperboard, PanelRight, Upload } from 'lucide-react'
import { usePanelStore } from '../store/mediaStore'
import { SettingsMenu } from './SettingsMenu'

type SidebarProps = {
  onImport: () => void
}

export function Sidebar({ onImport }: SidebarProps) {
  const { terminalOpen, toggleTerminal } = usePanelStore()

  return (
    <aside
      className="flex h-full w-[var(--sidebar-width-icon)] shrink-0 flex-col border-r border-border-l1 bg-surface-base"
      aria-label="Sidebar"
    >
      <div className="flex h-12 items-center justify-center">
        <div
          className="flex size-9 items-center justify-center rounded-xl bg-button-ghost-hover"
          title="FFmpeg Studio"
        >
          <Clapperboard className="size-4 text-fg-primary" />
        </div>
      </div>

      <nav className="flex flex-col items-center gap-1 px-2 py-2">
        <SidebarButton
          icon={<Upload className="size-[18px]" />}
          label="Import media"
          onClick={onImport}
        />
        <SidebarButton
          icon={<PanelRight className="size-[18px]" />}
          label={terminalOpen ? 'Hide terminal' : 'Show terminal'}
          onClick={toggleTerminal}
          active={terminalOpen}
        />
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col items-center px-2 pb-4">
        <SettingsMenu />
      </div>
    </aside>
  )
}

type SidebarButtonProps = {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}

function SidebarButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: SidebarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex size-9 items-center justify-center rounded-xl transition-colors',
        active
          ? 'bg-button-ghost-active text-fg-primary'
          : 'text-fg-primary hover:bg-button-ghost-hover',
        disabled ? 'cursor-not-allowed opacity-40' : '',
      ].join(' ')}
    >
      {icon}
    </button>
  )
}