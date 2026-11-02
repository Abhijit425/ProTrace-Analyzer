import { FilePlus2, FolderOpen, Moon, RotateCcw, Sun } from 'lucide-react'
import { useStore } from '../store'

export function TopBar() {
  const { pickFiles, pickFolder, newSession, theme, toggleTheme, ingesting, files } = useStore()
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-[#0e1420]">
      <div className="mr-3 flex items-center gap-2">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight">ProTrace Analyzer</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          M1
        </span>
      </div>
      <Btn onClick={pickFiles} icon={<FilePlus2 size={15} />}>Open files</Btn>
      <Btn onClick={pickFolder} icon={<FolderOpen size={15} />}>Open folder</Btn>
      <Btn
        onClick={newSession}
        icon={<RotateCcw size={15} />}
        disabled={ingesting || files.length === 0}
        title={ingesting ? 'Cancel the running import first' : 'Clear all loaded files'}
      >
        New analysis
      </Btn>
      <div className="flex-1" />
      <button
        onClick={toggleTheme}
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
  )
}

function Btn(props: {
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {props.icon}
      {props.children}
    </button>
  )
}

/** Simple mark: a stack trace "bracket" with a red error dot. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="22" height="22" rx="6" className="fill-accent-600" />
      <path d="M7 7h7M7 11h10M7 15h5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17" cy="16" r="3" fill="#fb7185" stroke="white" strokeWidth="1.5" />
    </svg>
  )
}
