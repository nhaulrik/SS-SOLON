import { useState, useEffect } from 'react'
import styles from './PresentationsTab.module.css'

export default function PresentationsTab({ projectName, setToast }) {
  const [presentations, setPresentations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  useEffect(() => {
    loadPresentations()
  }, [projectName])

  const loadPresentations = async () => {
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
  }

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
        prev.map(p =>
          p.name === oldName ? { ...p, name: newName } : p
        )
      )
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
        <button className={styles.retryButton} onClick={loadPresentations}>
          Retry
        </button>
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
    <div className={styles.section}>
      <div className={styles.grid}>
        {presentations.map(presentation => (
          <div key={presentation.name} className={styles.card}>
            <div className={styles.cardHeader}>
              {renamingId === presentation.name ? (
                <input
                  type="text"
                  className={styles.renameInput}
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRenameConfirm(presentation.name)
                    if (e.key === 'Escape') handleRenameCancel()
                  }}
                />
              ) : (
                <h3 className={styles.cardTitle}>{presentation.name}</h3>
              )}
            </div>

            <div className={styles.cardMeta}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Published:</span>
                <span className={styles.metaValue}>{formatDate(presentation.publishedAt)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Slides:</span>
                <span className={styles.metaValue}>{presentation.slideCount}</span>
              </div>
            </div>

            <div className={styles.cardActions}>
              {renamingId === presentation.name ? (
                <>
                  <button
                    className={styles.confirmButton}
                    onClick={() => handleRenameConfirm(presentation.name)}
                    title="Confirm rename"
                  >
                    ✓
                  </button>
                  <button
                    className={styles.cancelButton}
                    onClick={handleRenameCancel}
                    title="Cancel rename"
                  >
                    ✗
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={styles.openButton}
                    onClick={() => {
                      window.open(
                        `/published/${projectName}/presentations/${presentation.name}/index.html`,
                        '_blank'
                      )
                    }}
                    title="Open presentation"
                  >
                    Open
                  </button>
                  <button
                    className={styles.renameButton}
                    onClick={() => handleRenameStart(presentation)}
                    title="Rename presentation"
                  >
                    Rename
                  </button>
                  {confirmDeleteId === presentation.name ? (
                    <>
                      <button
                        className={styles.deleteConfirmButton}
                        onClick={() => handleDelete(presentation.name)}
                        title="Confirm delete"
                      >
                        Delete
                      </button>
                      <button
                        className={styles.cancelButton}
                        onClick={() => setConfirmDeleteId(null)}
                        title="Cancel delete"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className={styles.deleteButton}
                      onClick={() => setConfirmDeleteId(presentation.name)}
                      title="Delete presentation"
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
