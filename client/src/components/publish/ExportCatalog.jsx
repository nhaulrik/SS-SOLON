import { useState, useMemo } from 'react'
import styles from './ExportCatalog.module.css'

function buildSlideForDrop(exp, slide) {
  return {
    id: `sr-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`,
    flowId: exp.flowId,
    exportId: exp.exportId,
    slideIndex: slide.slideIndex,
    title: slide.title,
  }
}

function useActiveSlideKeys(activeSlides) {
  return useMemo(() => {
    const result = new Set()
    function collect(tree) {
      for (const node of (tree || [])) {
        if (node.slideRefId) {
          const parts = node.slideRefId.split('::')
          if (parts.length === 3) result.add(node.slideRefId)
        }
        if (node.children?.length) collect(node.children)
      }
    }
    collect(activeSlides)
    return result
  }, [activeSlides])
}

// ── Export group row ────────────────────────────────────────────────────────

function ExportGroupRow({
  exp,
  activeSlideKeys,
  selectedKeys,
  isExpanded,
  onToggleExpand,
  onToggleSlide,
  onToggleAll,
  onDragStart,
  onGroupDragStart,
  onDragEnd,
  onMoveUp,
  onMoveDown,
  searchQuery,
}) {
  const exportSlideKeys = (exp.slides || []).map(
    s => `${exp.flowId}::${exp.exportId}::${s.slideIndex}`
  )
  const selectedCount = exportSlideKeys.filter(k => selectedKeys.has(k)).length
  const addedCount = exportSlideKeys.filter(k => activeSlideKeys.has(k)).length
  const totalCount = exportSlideKeys.length
  const allSelected = totalCount > 0 && exportSlideKeys.every(k => selectedKeys.has(k))

  const slidesToShow = searchQuery
    ? (exp.slides || []).filter(s => s.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : (exp.slides || [])

  // Hide entire row when searching and nothing matches
  if (
    searchQuery &&
    slidesToShow.length === 0 &&
    !exp.flowName?.toLowerCase().includes(searchQuery.toLowerCase()) &&
    !(exp.exportName || exp.exportId || '').toLowerCase().includes(searchQuery.toLowerCase())
  ) {
    return null
  }

  const isAllAdded = addedCount === totalCount && totalCount > 0
  const isPartAdded = addedCount > 0 && addedCount < totalCount

  return (
    <div className={[
      styles.exportGroup,
      isAllAdded ? styles.exportGroupAllAdded : '',
      isPartAdded ? styles.exportGroupPartAdded : '',
    ].filter(Boolean).join(' ')}>
      <div
        className={styles.exportHeader}
        draggable
        onDragStart={e => onGroupDragStart(e, exp)}
        onDragEnd={onDragEnd}
      >
        <span className={styles.dragHandle} title="Drag to workspace">⠿</span>
        <button
          className={styles.collapseBtn}
          onClick={e => { e.stopPropagation(); onToggleExpand(exp.exportId) }}
          aria-expanded={isExpanded}
          tabIndex={-1}
        >
          <span className={styles.expandIcon}>{isExpanded ? '▾' : '▸'}</span>
        </button>
        <div
          className={styles.exportBody}
          onClick={() => onToggleExpand(exp.exportId)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onToggleExpand(exp.exportId)}
        >
          <div className={styles.exportPrimary}>
            <span className={styles.exportFlowName} title={exp.exportName || exp.exportId}>
              {exp.exportName || exp.exportId}
            </span>
            {isAllAdded && <span className={styles.statusAll}>✓ all</span>}
            {isPartAdded && <span className={styles.statusPart}>{addedCount}/{totalCount}</span>}
          </div>
          <div className={styles.exportSecondary}>
            <span className={styles.exportIdText} title={exp.flowName}>{exp.flowName}</span>
            <span className={styles.dotSep}>·</span>
            <span className={styles.slideCountText}>{totalCount} slide{totalCount !== 1 ? 's' : ''}</span>
            {selectedCount > 0 && <span className={styles.selPill}>{selectedCount} sel</span>}
          </div>
        </div>
        {(onMoveUp || onMoveDown) && (
          <div className={styles.exportMoveButtons}>
            <button
              className={styles.moveBtn}
              onClick={e => { e.stopPropagation(); onMoveUp?.() }}
              disabled={!onMoveUp}
              title="Move up"
            >↑</button>
            <button
              className={styles.moveBtn}
              onClick={e => { e.stopPropagation(); onMoveDown?.() }}
              disabled={!onMoveDown}
              title="Move down"
            >↓</button>
          </div>
        )}
        <label className={styles.exportCheckboxArea} onClick={e => e.stopPropagation()} title="Select all slides">
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={allSelected}
            onChange={() => onToggleAll(exp)}
          />
        </label>
      </div>

      {isExpanded && (
        <div className={styles.slideList}>
          {slidesToShow.map(slide => {
            const key = `${exp.flowId}::${exp.exportId}::${slide.slideIndex}`
            const isChecked = selectedKeys.has(key)
            const isAdded = activeSlideKeys.has(key)
            return (
              <div
                key={key}
                className={[
                  styles.slideRow,
                  isChecked ? styles.slideRowChecked : '',
                  isAdded ? styles.slideRowAdded : '',
                ].filter(Boolean).join(' ')}
                draggable={!isAdded}
                onDragStart={e => !isAdded && onDragStart(e, exp, slide)}
                onDragEnd={onDragEnd}
              >
                <span className={styles.dragHandle}>⠿</span>
                <label className={styles.slideCheckboxWrap} onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={isChecked}
                    onChange={() => onToggleSlide(key)}
                    disabled={isAdded}
                  />
                </label>
                <span className={styles.slideNum}>{slide.slideIndex}</span>
                <span className={styles.slideTitle}>{slide.title}</span>
                {isAdded && <span className={styles.addedCheck}>✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Bucket section ──────────────────────────────────────────────────────────

function BucketSection({
  group,
  exports,
  activeSlideKeys,
  selectedKeys,
  expandedExports,
  isExpanded,
  isEditing,
  editingName,
  onToggle,
  onToggleExpand,
  onToggleSlide,
  onToggleAll,
  onDragStart,
  onGroupDragStart,
  onDragEnd,
  onBucketDrop,
  onDelete,
  onStartRename,
  onFinishRename,
  onRenameChange,
  onCancelRename,
  onMoveGroupUp,
  onMoveGroupDown,
  onMoveExport,
  searchQuery,
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  const totalSlides = exports.reduce((n, exp) => n + (exp.slides?.length || 0), 0)
  const addedSlides = exports.reduce((n, exp) => {
    return n + (exp.slides || []).filter(
      s => activeSlideKeys.has(`${exp.flowId}::${exp.exportId}::${s.slideIndex}`)
    ).length
  }, 0)

  const handleDragOver = e => {
    if (e.dataTransfer.types.includes('application/x-solon-catalog-assign')) {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(true)
    }
  }

  const handleDragLeave = e => {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false)
  }

  const handleDrop = e => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const raw = e.dataTransfer.getData('application/x-solon-catalog-assign')
    if (raw) {
      try { onBucketDrop(JSON.parse(raw).exportKey, group.id) } catch {}
    }
  }

  return (
    <div className={`${styles.bucket} ${isDragOver ? styles.bucketDragOver : ''}`}>
      <div
        className={styles.bucketHeader}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button
          className={styles.bucketToggle}
          onClick={() => onToggle(group.id)}
          aria-expanded={isExpanded}
        >
          <span className={styles.bucketArrow}>{isExpanded ? '▾' : '▸'}</span>
        </button>

        {isEditing ? (
          <input
            className={styles.bucketNameInput}
            value={editingName}
            onChange={e => onRenameChange(e.target.value)}
            onBlur={() => onFinishRename(group.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') onFinishRename(group.id)
              if (e.key === 'Escape') onCancelRename()
            }}
            autoFocus
          />
        ) : (
          <span
            className={styles.bucketName}
            onDoubleClick={() => onStartRename(group.id, group.name)}
            title="Double-click to rename"
          >
            {group.name}
          </span>
        )}

        <span className={styles.bucketStats}>
          {exports.length} export{exports.length !== 1 ? 's' : ''}
          {totalSlides > 0 && addedSlides > 0 && (
            <span className={styles.bucketAdded}> · {addedSlides}/{totalSlides} added</span>
          )}
        </span>

        <div className={styles.bucketMoveButtons}>
          <button
            className={styles.moveBtn}
            onClick={onMoveGroupUp}
            disabled={!onMoveGroupUp}
            title="Move group up"
          >↑</button>
          <button
            className={styles.moveBtn}
            onClick={onMoveGroupDown}
            disabled={!onMoveGroupDown}
            title="Move group down"
          >↓</button>
        </div>

        <button
          className={styles.bucketDelete}
          onClick={() => onDelete(group.id)}
          title="Delete group — exports return to Ungrouped"
        >
          ×
        </button>
      </div>

      {isExpanded && (
        <div className={styles.bucketExports}>
          {exports.length === 0 ? (
            <div className={styles.bucketEmpty}>
              Drag export groups here to assign them
            </div>
          ) : (
            exports.map((exp, idx) => {
              const exportKey = `${exp.flowId}::${exp.exportId}`
              return (
                <ExportGroupRow
                  key={exportKey}
                  exp={exp}
                  activeSlideKeys={activeSlideKeys}
                  selectedKeys={selectedKeys}
                  isExpanded={expandedExports.has(exp.exportId)}
                  onToggleExpand={onToggleExpand}
                  onToggleSlide={onToggleSlide}
                  onToggleAll={onToggleAll}
                  onDragStart={onDragStart}
                  onGroupDragStart={onGroupDragStart}
                  onDragEnd={onDragEnd}
                  onMoveUp={idx > 0 ? () => onMoveExport(group.id, exportKey, 'up') : undefined}
                  onMoveDown={idx < exports.length - 1 ? () => onMoveExport(group.id, exportKey, 'down') : undefined}
                  searchQuery={searchQuery}
                />
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ExportCatalog({
  exports,
  loading,
  activeSlides,
  onAddSlides,
  catalogGroups,
  onCatalogGroupsChange,
}) {
  const [expandedExports, setExpandedExports] = useState(new Set())
  const [selectedKeys, setSelectedKeys] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedBuckets, setExpandedBuckets] = useState(new Set(['ungrouped']))
  const [editingBucketId, setEditingBucketId] = useState(null)
  const [editingBucketName, setEditingBucketName] = useState('')
  const [ungroupedDragOver, setUngroupedDragOver] = useState(false)

  const activeSlideKeys = useActiveSlideKeys(activeSlides)
  const groups = catalogGroups || []

  // Partition exports into buckets
  const { bucketExports, ungroupedExports } = useMemo(() => {
    const expByKey = {}
    for (const exp of exports) expByKey[`${exp.flowId}::${exp.exportId}`] = exp
    const assignedKeys = new Set()
    const bucketMap = {}
    for (const g of groups) {
      bucketMap[g.id] = (g.exportKeys || []).map(k => expByKey[k]).filter(Boolean)
      for (const k of (g.exportKeys || [])) assignedKeys.add(k)
    }
    const ungrouped = exports.filter(e => !assignedKeys.has(`${e.flowId}::${e.exportId}`))
    return { bucketExports: bucketMap, ungroupedExports: ungrouped }
  }, [exports, groups])

  // Filtered flat list when searching
  const searchResults = useMemo(() => {
    if (!searchQuery) return null
    const q = searchQuery.toLowerCase()
    return exports.filter(exp =>
      exp.flowName?.toLowerCase().includes(q) ||
      (exp.exportName || exp.exportId || '').toLowerCase().includes(q) ||
      exp.slides?.some(s => s.title?.toLowerCase().includes(q))
    )
  }, [exports, searchQuery])

  // ── Toggle helpers ────────────────────────────────────────────────────────

  const toggleExport = id => {
    setExpandedExports(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleBucket = id => {
    setExpandedBuckets(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSlide = key => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleAllInExport = exp => {
    const keys = exp.slides.map(s => `${exp.flowId}::${exp.exportId}::${s.slideIndex}`)
    const allSelected = keys.every(k => selectedKeys.has(k))
    setSelectedKeys(prev => {
      const next = new Set(prev)
      allSelected ? keys.forEach(k => next.delete(k)) : keys.forEach(k => next.add(k))
      return next
    })
  }

  // ── Bucket CRUD ───────────────────────────────────────────────────────────

  const handleCreateBucket = () => {
    const id = `cg-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`
    const newGroup = { id, name: 'New Group', exportKeys: [] }
    onCatalogGroupsChange([...groups, newGroup])
    setExpandedBuckets(prev => new Set([...prev, id]))
    setEditingBucketId(id)
    setEditingBucketName(newGroup.name)
  }

  const handleDeleteBucket = id => {
    onCatalogGroupsChange(groups.filter(g => g.id !== id))
  }

  const handleStartRename = (id, name) => {
    setEditingBucketId(id)
    setEditingBucketName(name)
  }

  const handleFinishRename = id => {
    if (editingBucketName.trim()) {
      onCatalogGroupsChange(groups.map(g => g.id === id ? { ...g, name: editingBucketName.trim() } : g))
    }
    setEditingBucketId(null)
  }

  const handleMoveGroup = (id, direction) => {
    const idx = groups.findIndex(g => g.id === id)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= groups.length) return
    const next = [...groups]
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    onCatalogGroupsChange(next)
  }

  const handleMoveExport = (bucketId, exportKey, direction) => {
    const group = groups.find(g => g.id === bucketId)
    if (!group) return
    const keys = [...(group.exportKeys || [])]
    const idx = keys.indexOf(exportKey)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= keys.length) return
    ;[keys[idx], keys[swapIdx]] = [keys[swapIdx], keys[idx]]
    onCatalogGroupsChange(groups.map(g => g.id === bucketId ? { ...g, exportKeys: keys } : g))
  }

  // Move an export group to a target bucket (or ungrouped)
  const handleBucketDrop = (exportKey, targetBucketId) => {
    const newGroups = groups.map(g => ({
      ...g,
      exportKeys: (g.exportKeys || []).filter(k => k !== exportKey),
    }))
    if (targetBucketId !== 'ungrouped') {
      const idx = newGroups.findIndex(g => g.id === targetBucketId)
      if (idx !== -1) {
        newGroups[idx] = { ...newGroups[idx], exportKeys: [...(newGroups[idx].exportKeys || []), exportKey] }
      }
    }
    onCatalogGroupsChange(newGroups)
  }

  // ── Add to tree ───────────────────────────────────────────────────────────

  const handleAddToTree = () => {
    if (selectedKeys.size === 0) return
    const slides = []
    for (const key of selectedKeys) {
      const [flowId, exportId, siStr] = key.split('::')
      const si = parseInt(siStr, 10)
      const exp = exports.find(e => e.flowId === flowId && e.exportId === exportId)
      const slide = exp?.slides.find(s => s.slideIndex === si)
      if (slide && exp) slides.push(buildSlideForDrop(exp, slide))
    }
    onAddSlides(slides)
    setSelectedKeys(new Set())
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handleDragStart = (e, exp, slide) => {
    const key = `${exp.flowId}::${exp.exportId}::${slide.slideIndex}`
    if (activeSlideKeys.has(key)) { e.preventDefault(); return }

    let toDrag = []
    if (selectedKeys.has(key)) {
      for (const sk of selectedKeys) {
        const [fId, eId, siStr] = sk.split('::')
        const si = parseInt(siStr, 10)
        const sExp = exports.find(e => e.flowId === fId && e.exportId === eId)
        const sSlide = sExp?.slides.find(s => s.slideIndex === si)
        if (sSlide && sExp && !activeSlideKeys.has(sk)) toDrag.push(buildSlideForDrop(sExp, sSlide))
      }
    } else {
      toDrag.push(buildSlideForDrop(exp, slide))
    }

    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('application/json', JSON.stringify(toDrag))
    if (toDrag.length === 1) {
      e.dataTransfer.setData('application/x-solon-catalog', JSON.stringify({
        type: 'slide',
        flowId: toDrag[0].flowId,
        exportId: toDrag[0].exportId,
        slideIndex: toDrag[0].slideIndex,
        title: toDrag[0].title,
      }))
    } else {
      e.dataTransfer.setData('application/x-solon-catalog', JSON.stringify({ type: 'group', slides: toDrag }))
    }
  }

  const handleGroupDragStart = (e, exp) => {
    const exportKey = `${exp.flowId}::${exp.exportId}`
    const rawSlides = (exp.slides || []).map(s => ({
      flowId: exp.flowId, exportId: exp.exportId, slideIndex: s.slideIndex, title: s.title,
    }))
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('application/x-solon-catalog', JSON.stringify({
      type: 'group', flowId: exp.flowId, exportId: exp.exportId, flowName: exp.flowName, slides: rawSlides,
    }))
    // Assign MIME type so bucket headers can accept it
    e.dataTransfer.setData('application/x-solon-catalog-assign', JSON.stringify({ exportKey }))
    e.currentTarget.style.opacity = '0.5'
  }

  const handleDragEnd = e => { e.currentTarget.style.opacity = '' }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Export Catalog</span>
        </div>
        <div className={styles.loadingState}>Loading exports…</div>
      </div>
    )
  }

  if (exports.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Export Catalog</span>
        </div>
        <div className={styles.emptyState}>
          <p>No exports found. Generate and export slides in a flow first.</p>
        </div>
      </div>
    )
  }

  const sharedRowProps = {
    activeSlideKeys,
    selectedKeys,
    expandedExports,
    onToggleExpand: toggleExport,
    onToggleSlide: toggleSlide,
    onToggleAll: toggleAllInExport,
    onDragStart: handleDragStart,
    onGroupDragStart: handleGroupDragStart,
    onDragEnd: handleDragEnd,
    searchQuery,
  }

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Export Catalog</span>
        <button className={styles.newGroupBtn} onClick={handleCreateBucket} title="Create a new group">
          + Group
        </button>
      </div>

      {/* Search */}
      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search by name or slide title…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* List */}
      <div className={styles.exportList}>
        {searchResults !== null ? (
          /* ── Flat search results ── */
          <div className={styles.searchSection}>
            <div className={styles.searchLabel}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </div>
            {searchResults.length === 0 ? (
              <div className={styles.searchEmpty}>No exports match "{searchQuery}"</div>
            ) : (
              searchResults.map(exp => (
                <ExportGroupRow
                  key={`${exp.flowId}::${exp.exportId}`}
                  exp={exp}
                  isExpanded={expandedExports.has(exp.exportId)}
                  {...sharedRowProps}
                />
              ))
            )}
          </div>
        ) : (
          <>
            {/* ── Named bucket groups ── */}
            {groups.map((group, idx) => (
              <BucketSection
                key={group.id}
                group={group}
                exports={bucketExports[group.id] || []}
                isExpanded={expandedBuckets.has(group.id)}
                isEditing={editingBucketId === group.id}
                editingName={editingBucketName}
                onToggle={toggleBucket}
                onBucketDrop={handleBucketDrop}
                onDelete={handleDeleteBucket}
                onStartRename={handleStartRename}
                onFinishRename={handleFinishRename}
                onRenameChange={setEditingBucketName}
                onCancelRename={() => setEditingBucketId(null)}
                onMoveGroupUp={idx > 0 ? () => handleMoveGroup(group.id, 'up') : undefined}
                onMoveGroupDown={idx < groups.length - 1 ? () => handleMoveGroup(group.id, 'down') : undefined}
                onMoveExport={handleMoveExport}
                {...sharedRowProps}
              />
            ))}

            {/* ── Ungrouped ── */}
            {ungroupedExports.length > 0 && (
              <div
                className={`${styles.ungroupedSection} ${ungroupedDragOver ? styles.bucketDragOver : ''}`}
                onDragOver={e => {
                  if (e.dataTransfer.types.includes('application/x-solon-catalog-assign')) {
                    e.preventDefault()
                    setUngroupedDragOver(true)
                  }
                }}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setUngroupedDragOver(false)
                }}
                onDrop={e => {
                  e.preventDefault()
                  setUngroupedDragOver(false)
                  const raw = e.dataTransfer.getData('application/x-solon-catalog-assign')
                  if (raw) {
                    try { handleBucketDrop(JSON.parse(raw).exportKey, 'ungrouped') } catch {}
                  }
                }}
              >
                <div
                  className={styles.ungroupedHeader}
                  onClick={() => toggleBucket('ungrouped')}
                >
                  <span className={styles.ungroupedArrow}>{expandedBuckets.has('ungrouped') ? '▾' : '▸'}</span>
                  <span className={styles.ungroupedLabel}>Ungrouped</span>
                  <span className={styles.ungroupedCount}>{ungroupedExports.length}</span>
                  {groups.length > 0 && (
                    <span className={styles.ungroupedHint}>drag to a group ↑</span>
                  )}
                </div>
                {expandedBuckets.has('ungrouped') && ungroupedExports.map(exp => (
                  <ExportGroupRow
                    key={`${exp.flowId}::${exp.exportId}`}
                    exp={exp}
                    isExpanded={expandedExports.has(exp.exportId)}
                    {...sharedRowProps}
                  />
                ))}
              </div>
            )}

            {/* ── Prompt when no groups yet ── */}
            {groups.length === 0 && ungroupedExports.length > 0 && (
              <div className={styles.groupPrompt}>
                <span>Organize exports into groups for easier navigation</span>
                <button className={styles.groupPromptBtn} onClick={handleCreateBucket}>
                  + Create Group
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Selection action bar */}
      {selectedKeys.size > 0 && (
        <div className={styles.actionBar}>
          <span className={styles.actionBarCount}>
            {selectedKeys.size} slide{selectedKeys.size !== 1 ? 's' : ''} selected
          </span>
          <div className={styles.actionBarButtons}>
            <button className={styles.clearBtn} onClick={() => setSelectedKeys(new Set())}>Clear</button>
            <button className={styles.addToTreeBtn} onClick={handleAddToTree}>Add to Tree →</button>
          </div>
        </div>
      )}
    </div>
  )
}
