import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import css from './ContextSliceModal.module.css'

const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)

const FolderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
)

/**
 * Modal that shows the AI context slice for a single plan instance.
 *
 * Props:
 *   instanceName   string   — display name for the instance
 *   instanceIdx    number   — index used to fetch the right file
 *   projectName    string
 *   flowId         string
 *   onClose        () => void
 */
export default function ContextSliceModal({ instanceName, instanceIdx, projectName, flowId, onClose }) {
  const [content, setContent]   = useState('')
  const [filename, setFilename] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setContent('')
    setFilename(null)
    const idx = instanceIdx === 'shared' ? 'shared' : instanceIdx
    fetch(`/api/opencode/agentic/context-slice?projectName=${encodeURIComponent(projectName)}&flowId=${encodeURIComponent(flowId)}&instanceIdx=${idx}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          setContent(data.content || '')
          setFilename(data.filename || null)
        }
      })
      .catch(() => { if (!cancelled) setContent('') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectName, flowId, instanceIdx])

  const handleOpenFolder = useCallback(() => {
    fetch('/api/opencode/agentic/open-debug-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName, flowId }),
    }).catch(() => {})
  }, [projectName, flowId])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div className={css.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={css.dialog} role="dialog" aria-modal="true" aria-label={`Context slice: ${instanceName}`}>

        <div className={css.header}>
          <div className={css.headerIcon}>
            <FileIcon />
          </div>
          <div className={css.headerTitle}>
            <div className={css.headerLabel}>Context slice</div>
            <div className={css.headerName} title={instanceName}>{instanceName}</div>
          </div>
          <div className={css.headerActions}>
            <button className={css.folderBtn} onClick={handleOpenFolder} title="Open debug folder in file explorer">
              <FolderIcon />
              Open folder
            </button>
            <button className={css.closeBtn} onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>

        {filename && (
          <div className={css.filenamePill}>
            <span className={css.filenameText}>{filename}</span>
          </div>
        )}

        <div className={css.content}>
          {loading ? (
            <div className={css.loading}>
              <div className={css.spinner} />
              Loading context slice…
            </div>
          ) : content ? (
            <pre className={css.pre}>{content}</pre>
          ) : (
            <div className={css.empty}>No context slice file found for this instance.</div>
          )}
        </div>

      </div>
    </div>,
    document.body
  )
}
