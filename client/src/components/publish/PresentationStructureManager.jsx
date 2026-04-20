import { useState, useEffect, useCallback } from 'react'
import styles from './PresentationStructureManager.module.css'
import ExportCatalog from './ExportCatalog'
import TreeBuilder from './TreeBuilder'
import StructurePreview from './StructurePreview'

export default function PresentationStructureManager({ projectName, setToast }) {
  const [structures, setStructures] = useState([])
  const [activeStructureId, setActiveStructureId] = useState(null)
  const [exportCatalog, setExportCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nameEditing, setNameEditing] = useState(false)
  const [nameValue, setNameValue] = useState('')

  const activeStructure = structures.find(s => s.id === activeStructureId) || null

  // Load structures + catalog on mount
  useEffect(() => {
    loadStructures()
    loadCatalog()
  }, [projectName])

  const loadStructures = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectName}/presentation-structures`)
      if (!res.ok) throw new Error('Failed to load structures')
      const data = await res.json()
      const list = data.structures || []
      setStructures(list)
      if (list.length > 0 && !activeStructureId) {
        setActiveStructureId(list[0].id)
        setNameValue(list[0].name)
      }
    } catch (err) {
      setToast?.({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  const loadCatalog = async () => {
    setCatalogLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectName}/export-catalog`)
      if (!res.ok) throw new Error('Failed to load export catalog')
      const data = await res.json()
      setExportCatalog(data.exports || [])
    } catch (err) {
      console.error('Catalog load error:', err)
    } finally {
      setCatalogLoading(false)
    }
  }

  const handleCreateStructure = async () => {
    try {
      const res = await fetch(`/api/projects/${projectName}/presentation-structures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Structure' }),
      })
      if (!res.ok) throw new Error('Failed to create structure')
      const newStruct = await res.json()
      setStructures(prev => [...prev, newStruct])
      setActiveStructureId(newStruct.id)
      setNameValue(newStruct.name)
      setNameEditing(true)
    } catch (err) {
      setToast?.({ type: 'error', message: err.message })
    }
  }

  const handleSave = async (patch) => {
    if (!activeStructureId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectName}/presentation-structures/${activeStructureId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('Failed to save structure')
      const updated = await res.json()
      setStructures(prev => prev.map(s => s.id === updated.id ? updated : s))
      setToast?.({ type: 'success', message: 'Structure saved' })
    } catch (err) {
      setToast?.({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleRename = async () => {
    if (!nameValue.trim() || !activeStructureId) return
    await handleSave({ name: nameValue.trim() })
    setNameEditing(false)
    setStructures(prev => prev.map(s => s.id === activeStructureId ? { ...s, name: nameValue.trim() } : s))
  }

  const handleSwitchStructure = (id) => {
    setActiveStructureId(id)
    const s = structures.find(s => s.id === id)
    if (s) setNameValue(s.name)
    setNameEditing(false)
  }

  // Update slides in active structure (called from TreeBuilder)
  const handleUpdateTree = useCallback((slides, tree) => {
    setStructures(prev => prev.map(s =>
      s.id === activeStructureId ? { ...s, slides, tree } : s
    ))
  }, [activeStructureId])

  const handleSaveTree = useCallback(async (slides, tree) => {
    const current = structures.find(s => s.id === activeStructureId)
    await handleSave({ slides, tree, levelNames: current?.levelNames || [] })
  }, [activeStructureId, handleSave, structures])

  const handleUpdateLevelNames = useCallback((levelNames) => {
    setStructures(prev => prev.map(s =>
      s.id === activeStructureId ? { ...s, levelNames } : s
    ))
  }, [activeStructureId])

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        <p>Loading structures…</p>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {/* ── Structure selector bar ── */}
      <div className={styles.selectorBar}>
        <div className={styles.selectorLeft}>
          <span className={styles.selectorLabel}>Structure</span>
          {structures.length === 0 ? (
            <span className={styles.noStructures}>No structures yet</span>
          ) : (
            <select
              className={styles.structureSelect}
              value={activeStructureId || ''}
              onChange={e => handleSwitchStructure(e.target.value)}
              aria-label="Select presentation structure"
            >
              {structures.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          {nameEditing ? (
            <div className={styles.renameRow}>
              <input
                className={styles.renameInput}
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setNameEditing(false) }}
                autoFocus
                aria-label="Structure name"
                maxLength={80}
              />
              <button className={styles.renameConfirm} onClick={handleRename}>✓</button>
              <button className={styles.renameCancel} onClick={() => setNameEditing(false)}>✕</button>
            </div>
          ) : (
            activeStructure && (
              <button
                className={styles.renameBtn}
                onClick={() => setNameEditing(true)}
                aria-label="Rename structure"
                title="Rename"
              >
                Rename
              </button>
            )
          )}
        </div>

        <div className={styles.selectorRight}>
          <button className={styles.newBtn} onClick={handleCreateStructure}>
            + New
          </button>
          {activeStructure && (
            <button
              className={styles.saveBtn}
              onClick={() => handleSave({ slides: activeStructure.slides, tree: activeStructure.tree, levelNames: activeStructure.levelNames || [] })}
              disabled={saving}
              aria-label="Save structure"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* ── Two-panel layout ── */}
      {structures.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No presentation structures yet</p>
          <p className={styles.emptySubtitle}>Create a structure to start arranging your exported slides into a hierarchy.</p>
          <button className={styles.emptyCreateBtn} onClick={handleCreateStructure}>
            Create your first structure
          </button>
        </div>
      ) : activeStructure ? (
        <div className={styles.panels}>
          {/* Left panel */}
          <div className={styles.leftPanel}>
            <ExportCatalog
              exports={exportCatalog}
              loading={catalogLoading}
              activeSlides={activeStructure.slides || []}
              onAddSlides={(newSlides) => {
                const merged = mergeSlides(activeStructure.slides || [], newSlides)
                const tree = appendToTree(activeStructure.tree || [], newSlides.map(s => s.id))
                handleUpdateTree(merged, tree)
              }}
            />
            <TreeBuilder
              slides={activeStructure.slides || []}
              tree={activeStructure.tree || []}
              levelNames={activeStructure.levelNames || []}
              onChange={handleUpdateTree}
              onLevelNamesChange={handleUpdateLevelNames}
              onSave={handleSaveTree}
            />
          </div>

          {/* Right panel */}
          <div className={styles.rightPanel}>
            <StructurePreview
              slides={activeStructure.slides || []}
              tree={activeStructure.tree || []}
              levelNames={activeStructure.levelNames || []}
              projectName={projectName}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function mergeSlides(existing, newSlides) {
  const existingIds = new Set(existing.map(s => s.id))
  return [...existing, ...newSlides.filter(s => !existingIds.has(s.id))]
}

function appendToTree(tree, slideRefIds) {
  return [...tree, ...slideRefIds.map(id => ({ slideRefId: id, children: [] }))]
}
