import { useState, useEffect, useCallback } from 'react'
import styles from './PresentationStructureManager.module.css'
import ExportCatalog from './ExportCatalog'
import PublishTreeWorkspace from './PublishTreeWorkspace'

export default function PresentationStructureManager({ projectName, setToast }) {
  const [structures, setStructures] = useState([])
  const [activeStructureId, setActiveStructureId] = useState(null)
  const [exportCatalog, setExportCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nameEditing, setNameEditing] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [publishName, setPublishName] = useState('')
  const [publishError, setPublishError] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)

  const activeStructure = structures.find(s => s.id === activeStructureId) || null

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

  const handleDeleteStructure = async () => {
    if (!activeStructureId) return
    const name = activeStructure?.name || 'this structure'
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/projects/${projectName}/presentation-structures/${activeStructureId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete structure')
      const remaining = structures.filter(s => s.id !== activeStructureId)
      setStructures(remaining)
      const next = remaining[0] || null
      setActiveStructureId(next?.id || null)
      setNameValue(next?.name || '')
      setNameEditing(false)
    } catch (err) {
      setToast?.({ type: 'error', message: err.message })
    }
  }

  const handleSwitchStructure = (id) => {
    setActiveStructureId(id)
    const s = structures.find(s => s.id === id)
    if (s) setNameValue(s.name)
    setNameEditing(false)
  }

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

  const sanitizeName = (name) => {
    return name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '')
  }

  const isValidPresentationName = (name) => {
    return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0
  }

  const handlePublishClick = () => {
    const defaultName = sanitizeName(activeStructure?.name || 'presentation')
    setPublishName(defaultName)
    setPublishError('')
    setPublishSuccess(false)
    setShowPublishDialog(true)
  }

  const handlePublish = async () => {
    if (!isValidPresentationName(publishName)) {
      setPublishError('Name must contain only letters, numbers, hyphens, and underscores')
      return
    }
    setIsPublishing(true)
    try {
      const res = await fetch(`/api/projects/${projectName}/presentations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: publishName, structureId: activeStructure.id }),
      })
      if (!res.ok) throw new Error('Failed to publish presentation')
      setPublishSuccess(true)
      setTimeout(() => {
        setShowPublishDialog(false)
        setPublishName('')
        setPublishError('')
        setPublishSuccess(false)
        setToast?.({ type: 'success', message: '✓ Presentation published! View it in the Presentations tab.' })
      }, 1500)
    } catch (err) {
      setPublishError(err.message)
    } finally {
      setIsPublishing(false)
    }
  }

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
      {/* Selector bar */}
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
              <button className={styles.renameBtn} onClick={() => setNameEditing(true)} title="Rename">
                Rename
              </button>
            )
          )}
        </div>
        <div className={styles.selectorRight}>
          <button className={styles.newBtn} onClick={handleCreateStructure}>+ New</button>
          {activeStructure && (
            <>
              <button className={styles.deleteBtn} onClick={handleDeleteStructure} title="Delete structure">Delete</button>
              <button className={styles.saveBtn} onClick={() => handleSave({ slides: activeStructure.slides, tree: activeStructure.tree, levelNames: activeStructure.levelNames || [] })} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className={styles.publishBtn} onClick={handlePublishClick} disabled={isPublishing} title="Publish presentation">
                {isPublishing ? 'Publishing…' : '🚀 Publish'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Layout */}
      {structures.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No presentation structures yet</p>
          <p className={styles.emptySubtitle}>Create a structure to start arranging your exported slides into a hierarchy.</p>
          <button className={styles.emptyCreateBtn} onClick={handleCreateStructure}>Create your first structure</button>
        </div>
      ) : activeStructure ? (
        <div className={styles.panels}>
          <div className={styles.leftPanel}>
            <ExportCatalog
              exports={exportCatalog}
              loading={catalogLoading}
              activeSlides={activeStructure.slides || []}
              onAddSlides={(newSlides) => {
                const merged = mergeSlides(activeStructure.slides || [], newSlides)
                const newTree = appendToTree(activeStructure.tree || [], newSlides.map(s => s.id))
                handleUpdateTree(merged, newTree)
              }}
            />
          </div>
          <div className={styles.mainPanel}>
            <PublishTreeWorkspace
              slides={activeStructure.slides || []}
              tree={activeStructure.tree || []}
              levelNames={activeStructure.levelNames || []}
              onChange={handleUpdateTree}
              onLevelNamesChange={handleUpdateLevelNames}
              onSave={handleSaveTree}
               onExternalDrop={(droppedSlides, targetId, zone) => {
                 const merged = mergeSlides(activeStructure.slides || [], droppedSlides)
                 const slideIds = droppedSlides.map(s => s.id)
                 
                 let newTree = activeStructure.tree || []
                 
                 if (!targetId) {
                   // No target: append to root
                   newTree = appendToTree(newTree, slideIds)
                 } else if (droppedSlides.length === 1) {
                   // Single slide: insert at position
                   const node = { slideRefId: slideIds[0], children: [] }
                   newTree = insertNodeAtPosition(newTree, [node], targetId, zone)
                 } else {
                   // Group drop: nest as a group (first slide is parent, rest are children)
                   const parentNode = {
                     slideRefId: slideIds[0],
                     children: slideIds.slice(1).map(id => ({ slideRefId: id, children: [] }))
                   }
                   newTree = insertNodeAtPosition(newTree, [parentNode], targetId, zone)
                 }
                 
                 handleUpdateTree(merged, newTree)
               }}
            />
          </div>
        </div>
      ) : null}

      {/* Publish Dialog */}
      {showPublishDialog && (
        <div className={styles.dialogOverlay}>
          <div className={styles.dialog}>
            <div className={styles.dialogHeader}><h2>Publish Presentation</h2></div>
            <div className={styles.dialogBody}>
              {publishSuccess ? (
                <p style={{ color: 'var(--success)', textAlign: 'center', margin: 0 }}>✓ Published! View in the Presentations tab.</p>
              ) : (
                <>
                  <label htmlFor="publish-name-input">Presentation name</label>
                  <input id="publish-name-input" type="text" value={publishName} onChange={e => { setPublishName(e.target.value); setPublishError('') }} placeholder="my-presentation" disabled={isPublishing} autoFocus />
                  {publishError && <div className={styles.dialogError}>{publishError}</div>}
                </>
              )}
            </div>
            <div className={styles.dialogActions}>
              <button className={styles.dialogCancel} onClick={() => { setShowPublishDialog(false); setPublishName(''); setPublishError(''); setPublishSuccess(false) }} disabled={isPublishing}>Cancel</button>
              {!publishSuccess && (
                <button className={styles.dialogPublish} onClick={handlePublish} disabled={isPublishing || !isValidPresentationName(publishName)}>
                  {isPublishing ? 'Publishing…' : 'Publish'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function mergeSlides(existing, newSlides) {
  const existingIds = new Set(existing.map(s => s.id))
  return [...existing, ...newSlides.filter(s => !existingIds.has(s.id))]
}

function appendToTree(tree, slideRefIds) {
  return [...tree, ...slideRefIds.map(id => ({ slideRefId: id, children: [] }))]
}

function insertNodeAtPosition(tree, nodesToInsert, targetId, zone) {
  // Insert nodes at a position relative to targetId
  // zone: 'before', 'after', or 'into'
  
  if (zone === 'into') {
    // Insert as children of targetId
    return tree.map(node => {
      if (node.slideRefId === targetId) {
        return { ...node, children: [...(node.children || []), ...nodesToInsert] }
      }
      return { ...node, children: insertNodeAtPosition(node.children || [], nodesToInsert, targetId, zone) }
    })
  } else {
    // Insert as sibling before or after targetId
    const result = []
    for (const node of tree) {
      if (node.slideRefId === targetId) {
        if (zone === 'before') {
          result.push(...nodesToInsert, node)
        } else {
          result.push(node, ...nodesToInsert)
        }
      } else {
        result.push({
          ...node,
          children: insertNodeAtPosition(node.children || [], nodesToInsert, targetId, zone)
        })
      }
    }
    return result
  }
}
