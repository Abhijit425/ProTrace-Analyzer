import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useStore } from './store'
import { TopBar } from './components/TopBar'
import { FileSidebar } from './components/FileSidebar'
import { FilterBar } from './components/FilterBar'
import { RawLogViewer } from './components/RawLogViewer'
import { EntryDetail } from './components/EntryDetail'
import { IngestBar } from './components/IngestBar'
import { EmptyState } from './components/EmptyState'

export default function App() {
  const { init, files, open, toast } = useStore()
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  useEffect(() => init(), [init])

  // Window-wide drag & drop of files and folders.
  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    depth.current++
    setDragging(true)
  }
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1)
    if (!depth.current) setDragging(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    depth.current = 0
    setDragging(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.protrace.getPathForFile(f))
      .filter(Boolean)
    void open(paths)
  }

  return (
    <div
      className="flex h-full flex-col"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <TopBar />
      {files.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex min-h-0 flex-1">
          <FileSidebar />
          <main className="flex min-w-0 flex-1 flex-col">
            <FilterBar />
            <RawLogViewer />
          </main>
          <EntryDetail />
        </div>
      )}
      <IngestBar />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent-600/15 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent-500 bg-white/90 px-12 py-10 dark:bg-[#0e1420]/90">
            <Upload size={36} className="text-accent-500" />
            <div className="text-lg font-semibold">Drop to analyse</div>
            <div className="text-[13px] text-slate-500">Files and folders are both fine</div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-[13px] text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
          {toast}
        </div>
      )}
    </div>
  )
}
