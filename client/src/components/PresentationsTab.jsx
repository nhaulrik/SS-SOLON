import { useState, useEffect, useCallback, useMemo } from 'react'
import styles from './PresentationsTab.module.css'

const SORT_NONE = null

function SortIcon({ direction }) {
  if (!direction) return <span className={styles.sortIconInactive}>⇅</span>
  return <span className={styles.sortIconActive}>{direction === 'asc' ? '↑' : '↓'}</span>
}

export default function PresentationsTab({ projectName, setToast }) {
  const [presentations, setPresentations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [selectedName, setSelectedName] = useState(null)
  const [sortCol, setSortCol] = useState('published')
  const [sortDir, setSortDir] = useState('desc')

  const loadPresentations = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/projects/${projectName}/presentations`)
      if (!res.ok) throw new Error('Failed to load presentations')
      const data = await res.json()
      setPresentations(data.presentations || [])
    } catch (err) {
      setError(err.message)
      setToast?.({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }, [projectName, setToast])

  useEffect(() => {
    loadPresentations()
  }, [loadPresentations])

  const handleRenameStart = (presentation) => {
    setRenamingId(presentation.name)
    setRenameValue(presentation.name)
  }

  const handleRenameCancel = () => {
    setRenamingId(null)
    setRenameValue('')
  }

  const validateName = (name) => {
    if (!name || !name.trim()) return false
    return /^[a-zA-Z0-9_-]{1,100}$/.test(name)
  }

  const handleRenameConfirm = async (oldName) => {
    const newName = renameValue.trim()
    if (!validateName(newName)) {
      setToast?.({ type: 'error', message: 'Name must contain only letters, numbers, hyphens, and underscores' })
      return
    }

    if (newName === oldName) {
      handleRenameCancel()
      return
    }

    try {
      const res = await fetch(`/api/projects/${projectName}/presentations/${oldName}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to rename presentation')
      }

      setPresentations(prev =>
        prev.map(p => p.name === oldName ? { ...p, name: newName } : p)
      )
      if (selectedName === oldName) setSelectedName(newName)
      setToast?.({ type: 'success', message: `Presentation renamed to "${newName}"` })
      handleRenameCancel()
    } catch (err) {
      setToast?.({ type: 'error', message: err.message })
    }
  }

  const handleDelete = async (name) => {
    try {
      const res = await fetch(`/api/projects/${projectName}/presentations/${name}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to delete presentation')
      }

      setPresentations(prev => prev.filter(p => p.name !== name))
      if (selectedName === name) setSelectedName(null)
      setToast?.({ type: 'success', message: `Presentation "${name}" deleted` })
      setConfirmDeleteId(null)
    } catch (err) {
      setToast?.({ type: 'error', message: err.message })
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '—'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return '—'
    }
  }

  const handleColumnSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortCol) return presentations
    return [...presentations].sort((a, b) => {
      let av, bv
      if (sortCol === 'name') {
        av = a.name.toLowerCase()
        bv = b.name.toLowerCase()
      } else {
        av = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
        bv = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [presentations, sortCol, sortDir])

  const selectedPresentation = presentations.find(p => p.name === selectedName)
  const previewUrl = selectedName
    ? `/published/${projectName}/presentations/${selectedName}/index.html`
    : null

  if (loading) {
    return (
      <div className={styles.loadingSpinner}>
        <div className={styles.spinner}></div>
        <p>Loading presentations…</p>
      </div>
    )
  }

  if (error && presentations.length === 0) {
    return (
      <div className={styles.errorContainer}>
        <p>{error}</p>
        <button className={styles.retryButton} onClick={loadPresentations}>Retry</button>
      </div>
    )
  }

  if (presentations.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📊</div>
        <p>No presentations published yet</p>
      </div>
    )
  }

  return (
    <div className={`${styles.splitContainer} ${selectedName ? styles.splitActive : ''}`}>
      {/* ── Left: table ── */}
      <div className={styles.tablePane}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th
                className={`${styles.thName} ${styles.sortable}`}
                onClick={() => handleColumnSort('name')}
              >
                <span className={styles.thInner}>
                  Name <SortIcon direction={sortCol === 'name' ? sortDir : null} />
                </span>
              </th>
              <th
                className={`${styles.thDate} ${styles.sortable}`}
                onClick={() => handleColumnSort('published')}
              >
                <span className={styles.thInner}>
                  Published <SortIcon direction={sortCol === 'published' ? sortDir : null} />
                </span>
              </th>
              <th className={styles.thSlides}>Slides</th>
              <th className={styles.thActions}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(presentation => {
              const isSelected = selectedName === presentation.name
              const isRenaming = renamingId === presentation.name
              const isConfirmingDelete = confirmDeleteId === presentation.name

              return (
                <tr
                  key={presentation.name}
                  className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
                  onClick={() => {
                    if (!isRenaming) setSelectedName(isSelected ? null : presentation.name)
                  }}
                >
                  <td className={styles.tdName}>
                    {isRenaming ? (
                      <input
                        type="text"
                        className={styles.renameInput}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameConfirm(presentation.name)
                          if (e.key === 'Escape') handleRenameCancel()
                        }}
                      />
                    ) : (
                      <span className={styles.nameText}>{presentation.name}</span>
                    )}
                  </td>
                  <td className={styles.tdDate}>{formatDate(presentation.publishedAt)}</td>
                  <td className={styles.tdSlides}>{presentation.slideCount}</td>
                  <td className={styles.tdActions} onClick={e => e.stopPropagation()}>
                    {isRenaming ? (
                      <div className={styles.actionGroup}>
                        <button
                          className={styles.confirmButton}
                          onClick={() => handleRenameConfirm(presentation.name)}
                          title="Confirm rename"
                        >✓</button>
                        <button
                          className={styles.cancelButton}
                          onClick={handleRenameCancel}
                          title="Cancel rename"
                        >✗</button>
                      </div>
                    ) : (
                      <div className={styles.actionGroup}>
                        <button
                          className={styles.openButton}
                          onClick={() => window.open(
                            `/published/${projectName}/presentations/${presentation.name}/index.html`,
                            '_blank'
                          )}
                          title="Open presentation"
                        >Open</button>
                        <button
                          className={styles.renameButton}
                          onClick={() => handleRenameStart(presentation)}
                          title="Rename presentation"
                        >Rename</button>
                        {isConfirmingDelete ? (
                          <>
                            <button
                              className={styles.deleteConfirmButton}
                              onClick={() => handleDelete(presentation.name)}
                              title="Confirm delete"
                            >Delete</button>
                            <button
                              className={styles.cancelButton}
                              onClick={() => setConfirmDeleteId(null)}
                              title="Cancel delete"
                            >Cancel</button>
                          </>
                        ) : (
                          <button
                            className={styles.deleteButton}
                            onClick={() => setConfirmDeleteId(presentation.name)}
                            title="Delete presentation"
                          >Delete</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Right: preview pane ── */}
      {selectedName && (
        <div className={styles.previewPane}>
          <div className={styles.previewHeader}>
            <div className={styles.previewMeta}>
              <span className={styles.previewLabel}>Preview</span>
              <span className={styles.previewName}>{selectedName}</span>
              {selectedPresentation && (
                <span className={styles.previewSlides}>{selectedPresentation.slideCount} slides</span>
              )}
            </div>
            <div className={styles.previewActions}>
              <button
                className={styles.previewOpenButton}
                onClick={() => window.open(previewUrl, '_blank')}
                title="Open in new tab"
              >
                ↗ Open
              </button>
              <button
                className={styles.previewCloseButton}
                onClick={() => setSelectedName(null)}
                title="Close preview"
              >✕</button>
            </div>
          </div>
          <div className={styles.previewBody}>
            <iframe
              key={previewUrl}
              src={previewUrl}
              className={styles.previewFrame}
              title={`Preview: ${selectedName}`}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      )}
    </div>
  )
}
