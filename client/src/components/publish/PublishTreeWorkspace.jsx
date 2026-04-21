import { useState, useRef, useCallback, useMemo } from 'react'
import styles from './PublishTreeWorkspace.module.css'

// ── Tree helpers ───────────────────────────────────────────────────────────

function flattenTree(tree, slides, depth = 0, parentId = null) {
  const result = []
  for (const node of tree) {
    const slide = slides.find(s => s.id === node.slideRefId)
    result.push({ node, slide, depth, parentId })
    if (node.children && node.children.length > 0) {
      result.push(...flattenTree(node.children, slides, depth + 1, node.slideRefId))
    }
  }
  return result
}

function removeFromTree(tree, slideRefId) {
  return tree
    .filter(n => n.slideRefId !== slideRefId)
    .map(n => ({ ...n, children: removeFromTree(n.children || [], slideRefId) }))
}

function findNode(tree, slideRefId) {
  for (const node of tree) {
    if (node.slideRefId === slideRefId) return node
    const found = findNode(node.children || [], slideRefId)
    if (found) return found
  }
  return null
}

function insertUnderParent(tree, parentId, childNodes) {
  return tree.map(node => {
    if (node.slideRefId === parentId) {
      return { ...node, children: [...(node.children || []), ...childNodes] }
    }
    return { ...node, children: insertUnderParent(node.children || [], parentId, childNodes) }
  })
}

// Insert sourceNodes before or after targetId at whatever level targetId lives
function insertSibling(tree, sourceNodes, targetId, position) {
  const result = []
  for (const node of tree) {
    if (node.slideRefId === targetId) {
      if (position === 'before') {
        result.push(...sourceNodes, node)
      } else {
        result.push(node, ...sourceNodes)
      }
    } else {
      result.push({
        ...node,
        children: insertSibling(node.children || [], sourceNodes, targetId, position),
      })
    }
  }
  return result
}

// Move nodes: remove from wherever they are, then insert at target position
function moveNodes(tree, sourceIds, targetId, zone) {
  // Extract source nodes before removing
  const sourceNodes = sourceIds.map(id => findNode(tree, id)).filter(Boolean)
  // Remove sources
  let newTree = tree
  for (const id of sourceIds) {
    newTree = removeFromTree(newTree, id)
  }
  // Insert at target
  if (zone === 'into') {
    return insertUnderParent(newTree, targetId, sourceNodes)
  } else {
    return insertSibling(newTree, sourceNodes, targetId, zone === 'before' ? 'before' : 'after')
  }
}

// Indent: make node a last child of the node immediately above it in the flat list
function indentNode(tree, slides, nodeId) {
  const flat = flattenTree(tree, slides)
  const idx = flat.findIndex(f => f.node.slideRefId === nodeId)
  if (idx <= 0) return tree // nothing above
  const above = flat[idx - 1]
  const nodeToMove = findNode(tree, nodeId)
  if (!nodeToMove) return tree
  let newTree = removeFromTree(tree, nodeId)
  newTree = insertUnderParent(newTree, above.node.slideRefId, [nodeToMove])
  return newTree
}

// Outdent: move node out of its parent, insert after parent in grandparent's children
function outdentNode(tree, slides, nodeId) {
  const flat = flattenTree(tree, slides)
  const entry = flat.find(f => f.node.slideRefId === nodeId)
  if (!entry || entry.depth === 0) return tree // already root
  const parentId = entry.parentId
  const nodeToMove = findNode(tree, nodeId)
  if (!nodeToMove) return tree
  let newTree = removeFromTree(tree, nodeId)
  newTree = insertSibling(newTree, [nodeToMove], parentId, 'after')
  return newTree
}

// ── TreeNode component ─────────────────────────────────────────────────────

function TreeNode({
  node,
  slides,
  depth,
  parentId,
  flatList,
  levelNames,
  expandedIds,
  editingNodeId,
  editingNodeValue,
  dragOverId,
  dragOverZone,
  isDragging,
  onToggleExpand,
  onStartEditNode,
  onFinishEditNode,
  onEditValueChange,
  onRemove,
  onIndent,
  onOutdent,
  onDragStart,
  onDragEnd,
  onNodeDragOver,
  onDrop,
  setEditingNodeId,
}) {
  const slide = slides.find(s => s.id === node.slideRefId)
  const hasChildren = node.children && node.children.length > 0
  const isExpanded = expandedIds.has(node.slideRefId)
  const isDragTarget = dragOverId === node.slideRefId
  const isEditingTitle = editingNodeId === node.slideRefId
  const levelLabel = (levelNames || [])[depth]

  // Find index in flat list to know if there's a node above
  const flatIdx = flatList.findIndex(f => f.node.slideRefId === node.slideRefId)
  const hasNodeAbove = flatIdx > 0
  const canIndent = hasNodeAbove && !isDragging
  const canOutdent = depth > 0 && !isDragging

  const dropClass =
    isDragTarget && dragOverZone === 'before' ? styles.dropBefore :
    isDragTarget && dragOverZone === 'into'   ? styles.dropInto :
    isDragTarget && dragOverZone === 'after'  ? styles.dropAfter :
    ''

  return (
    <div className={styles.treeNode} role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
      {/* Node row — single drag target, zone computed from cursor Y */}
      <div
        className={`${styles.nodeRow} ${dropClass}`}
        style={{ paddingLeft: `${16 + depth * 28}px` }}
        onDragOver={e => onNodeDragOver(e, node.slideRefId)}
        onDrop={e => onDrop(e, node.slideRefId)}
      >
        {/* Drag handle */}
        <span
          className={styles.dragHandle}
          draggable
          onDragStart={e => onDragStart(e, node.slideRefId)}
          onDragEnd={onDragEnd}
          title="Drag to reorder or nest"
          aria-hidden="true"
        >
          ⠿
        </span>

        {/* Expand toggle */}
        {hasChildren ? (
          <button
            className={styles.expandToggle}
            onClick={() => onToggleExpand(node.slideRefId)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <div className={styles.expandPlaceholder} />
        )}

        {/* Slide index badge */}
        <span className={styles.slideIndexBadge}>{slide?.slideIndex ?? '?'}</span>

        {/* Slide title */}
        {isEditingTitle ? (
          <input
            className={styles.titleInput}
            autoFocus
            value={editingNodeValue}
            onChange={e => onEditValueChange(e.target.value)}
            onBlur={() => onFinishEditNode(node.slideRefId)}
            onKeyDown={e => {
              if (e.key === 'Enter') onFinishEditNode(node.slideRefId)
              if (e.key === 'Escape') setEditingNodeId(null)
            }}
          />
        ) : (
          <button
            className={styles.titleButton}
            onClick={() => onStartEditNode(node.slideRefId, slide?.title || node.slideRefId)}
            title="Click to rename"
          >
            {slide?.title || node.slideRefId}
          </button>
        )}

        {/* Level badge */}
        {levelLabel && <span className={styles.levelBadge}>{levelLabel}</span>}

        {/* Indent / Outdent buttons */}
        <div className={styles.nestBtns}>
          {canOutdent && (
            <button
              className={styles.nestBtn}
              onClick={() => onOutdent(node.slideRefId)}
              title="Move out one level (←)"
              aria-label="Outdent"
            >
              ←
            </button>
          )}
          {canIndent && (
            <button
              className={styles.nestBtn}
              onClick={() => onIndent(node.slideRefId)}
              title="Nest under node above (→)"
              aria-label="Indent"
            >
              →
            </button>
          )}
        </div>

        {/* Delete button */}
        <button
          className={styles.deleteBtn}
          onClick={() => onRemove(node.slideRefId)}
          aria-label={`Remove ${slide?.title || node.slideRefId}`}
          title="Remove from tree"
        >
          ×
        </button>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className={styles.childrenContainer}>
          {node.children.map(child => (
            <TreeNode
              key={child.slideRefId}
              node={child}
              slides={slides}
              depth={depth + 1}
              parentId={node.slideRefId}
              flatList={flatList}
              levelNames={levelNames}
              expandedIds={expandedIds}
              editingNodeId={editingNodeId}
              editingNodeValue={editingNodeValue}
              dragOverId={dragOverId}
              dragOverZone={dragOverZone}
              isDragging={isDragging}
              onToggleExpand={onToggleExpand}
              onStartEditNode={onStartEditNode}
              onFinishEditNode={onFinishEditNode}
              onEditValueChange={onEditValueChange}
              onRemove={onRemove}
              onIndent={onIndent}
              onOutdent={onOutdent}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onNodeDragOver={onNodeDragOver}
              onDrop={onDrop}
              setEditingNodeId={setEditingNodeId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PublishTreeWorkspace({
  slides,
  tree,
  levelNames,
  onChange,
  onLevelNamesChange,
  onSave,
  onExternalDrop,
}) {
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [editingNodeId, setEditingNodeId] = useState(null)
  const [editingNodeValue, setEditingNodeValue] = useState('')
  const [editingLevelDepth, setEditingLevelDepth] = useState(null)
  const [editingLevelValue, setEditingLevelValue] = useState('')
  const [dragOverId, setDragOverId] = useState(null)
  const [dragOverZone, setDragOverZone] = useState(null)
  const [dragOverRoot, setDragOverRoot] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isCatalogDrag, setIsCatalogDrag] = useState(false)
  const [catalogDropLinePos, setCatalogDropLinePos] = useState(null)
  const dragSourceId = useRef(null)
  const dragSourceType = useRef(null)
  const workspaceRef = useRef(null)

  const flat = useMemo(() => flattenTree(tree, slides), [tree, slides])
  const maxDepth = flat.length > 0 ? Math.max(...flat.map(f => f.depth)) : 0
  const depthLevels = Array.from({ length: maxDepth + 1 }, (_, i) => i)

  // ── Level names ──────────────────────────────────────────────────────────

  const handleLevelNameChange = useCallback((depth, value) => {
    const next = [...(levelNames || [])]
    next[depth] = value
    onLevelNamesChange(next)
  }, [levelNames, onLevelNamesChange])

  const startEditingLevel = useCallback((depth) => {
    setEditingLevelDepth(depth)
    setEditingLevelValue((levelNames || [])[depth] || '')
  }, [levelNames])

  const finishEditingLevel = useCallback(() => {
    if (editingLevelDepth !== null) {
      handleLevelNameChange(editingLevelDepth, editingLevelValue)
    }
    setEditingLevelDepth(null)
    setEditingLevelValue('')
  }, [editingLevelDepth, editingLevelValue, handleLevelNameChange])

  // ── Node editing ─────────────────────────────────────────────────────────

  const startEditingNode = useCallback((nodeId, currentTitle) => {
    setEditingNodeId(nodeId)
    setEditingNodeValue(currentTitle)
  }, [])

  const finishEditingNode = useCallback((nodeId) => {
    if (editingNodeId === nodeId && editingNodeValue.trim()) {
      const newSlides = slides.map(s =>
        s.id === nodeId ? { ...s, title: editingNodeValue.trim() } : s
      )
      onChange(newSlides, tree)
    }
    setEditingNodeId(null)
    setEditingNodeValue('')
  }, [editingNodeId, editingNodeValue, slides, tree, onChange])

  // ── Expand/collapse ──────────────────────────────────────────────────────

  const toggleExpanded = useCallback((nodeId) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  // ── Remove ───────────────────────────────────────────────────────────────

  const handleRemove = useCallback((slideRefId) => {
    onChange(slides, removeFromTree(tree, slideRefId))
  }, [tree, slides, onChange])

  // ── Indent / Outdent ─────────────────────────────────────────────────────

  const handleIndent = useCallback((nodeId) => {
    onChange(slides, indentNode(tree, slides, nodeId))
  }, [tree, slides, onChange])

  const handleOutdent = useCallback((nodeId) => {
    onChange(slides, outdentNode(tree, slides, nodeId))
  }, [tree, slides, onChange])

  // ── Drag: internal ───────────────────────────────────────────────────────

  const handleDragStart = useCallback((e, slideRefId) => {
    dragSourceId.current = slideRefId
    dragSourceType.current = 'internal'
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', slideRefId)
  }, [])

  // Compute zone from cursor Y within the row element
  const handleNodeDragOver = useCallback((e, targetId) => {
    e.preventDefault()
    e.stopPropagation()
    
    const isCatalog = e.dataTransfer.types.includes('application/x-solon-catalog')
    setIsCatalogDrag(isCatalog)
    
    if (dragSourceId.current === targetId) return

    const rect = e.currentTarget.getBoundingClientRect()
    const relY = e.clientY - rect.top
    const pct = relY / rect.height

    let zone
    if (pct < 0.30) zone = 'before'
    else if (pct > 0.70) zone = 'after'
    else zone = 'into'

    e.dataTransfer.dropEffect = dragSourceType.current === 'internal' ? 'move' : 'copy'
    setDragOverId(targetId)
    setDragOverZone(zone)
    setDragOverRoot(false)
    
    // For catalog drops, show insertion line at the computed position
    if (isCatalog) {
      if (zone === 'before') {
        setCatalogDropLinePos({ top: rect.top - workspaceRef.current?.getBoundingClientRect().top, nodeId: targetId })
      } else if (zone === 'after') {
        setCatalogDropLinePos({ top: rect.bottom - workspaceRef.current?.getBoundingClientRect().top, nodeId: targetId })
      } else {
        setCatalogDropLinePos(null)
      }
    }
  }, [])

  const handleDrop = useCallback((e, targetId) => {
    e.preventDefault()
    e.stopPropagation()

    const zone = dragOverZone
    setDragOverId(null)
    setDragOverZone(null)
    setDragOverRoot(false)
    setIsDragging(false)
    setIsCatalogDrag(false)
    setCatalogDropLinePos(null)

    if (dragSourceType.current === 'internal') {
      const sourceId = dragSourceId.current
      if (!sourceId || sourceId === targetId) return
      const newTree = moveNodes(tree, [sourceId], targetId, zone)
      onChange(slides, newTree)
    } else if (dragSourceType.current === 'external') {
      // Try catalog drop first (application/x-solon-catalog)
      const catalogData = e.dataTransfer.getData('application/x-solon-catalog')
      if (catalogData) {
        try {
          const payload = JSON.parse(catalogData)
          if (onExternalDrop) {
            // Convert catalog payload to slides array
            let droppedSlides = []
            if (payload.type === 'group' && payload.slides) {
              droppedSlides = payload.slides.map(s => ({
                id: `sr-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`,
                flowId: s.flowId,
                exportId: s.exportId,
                slideIndex: s.slideIndex,
                title: s.title,
              }))
            } else if (payload.type === 'slide') {
              droppedSlides = [{
                id: `sr-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`,
                flowId: payload.flowId,
                exportId: payload.exportId,
                slideIndex: payload.slideIndex,
                title: payload.title,
              }]
            }
            if (droppedSlides.length > 0) {
              onExternalDrop(droppedSlides, targetId, zone)
            }
          }
        } catch { /* ignore */ }
      } else {
        // Fallback to application/json for backward compatibility
        try {
          const dataStr = e.dataTransfer.getData('application/json')
          if (dataStr && onExternalDrop) {
            const droppedSlides = JSON.parse(dataStr)
            if (Array.isArray(droppedSlides)) {
              onExternalDrop(droppedSlides, targetId, zone)
            }
          }
        } catch { /* ignore */ }
      }
    }

    dragSourceId.current = null
    dragSourceType.current = null
  }, [tree, slides, onChange, onExternalDrop, dragOverZone])

  const handleDragEnd = useCallback(() => {
    setDragOverId(null)
    setDragOverZone(null)
    setDragOverRoot(false)
    setIsDragging(false)
    setIsCatalogDrag(false)
    setCatalogDropLinePos(null)
    dragSourceId.current = null
    dragSourceType.current = null
  }, [])

  // ── External drop on workspace background ────────────────────────────────

  const handleWorkspaceDragOver = useCallback((e) => {
    e.preventDefault()
    
    const isCatalog = e.dataTransfer.types.includes('application/x-solon-catalog')
    setIsCatalogDrag(isCatalog)
    
    // Only handle if not already over a node
    if (dragSourceType.current !== 'internal') {
      dragSourceType.current = 'external'
    }
    e.dataTransfer.dropEffect = 'copy'
    setDragOverRoot(true)
  }, [])

  const handleWorkspaceDragLeave = useCallback((e) => {
    if (!workspaceRef.current?.contains(e.relatedTarget)) {
      setDragOverRoot(false)
      setIsCatalogDrag(false)
      setCatalogDropLinePos(null)
    }
  }, [])

  const handleWorkspaceDrop = useCallback((e) => {
    e.preventDefault()
    setDragOverRoot(false)
    setIsDragging(false)
    setIsCatalogDrag(false)
    setCatalogDropLinePos(null)
    
    if (dragSourceType.current === 'internal') {
      dragSourceId.current = null
      dragSourceType.current = null
      return
    }
    
    // Try catalog drop first (application/x-solon-catalog)
    const catalogData = e.dataTransfer.getData('application/x-solon-catalog')
    if (catalogData) {
      try {
        const payload = JSON.parse(catalogData)
        if (onExternalDrop) {
          // Convert catalog payload to slides array
          let droppedSlides = []
          if (payload.type === 'group' && payload.slides) {
            droppedSlides = payload.slides.map(s => ({
              id: `sr-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`,
              flowId: s.flowId,
              exportId: s.exportId,
              slideIndex: s.slideIndex,
              title: s.title,
            }))
          } else if (payload.type === 'slide') {
            droppedSlides = [{
              id: `sr-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`,
              flowId: payload.flowId,
              exportId: payload.exportId,
              slideIndex: payload.slideIndex,
              title: payload.title,
            }]
          }
          if (droppedSlides.length > 0) {
            onExternalDrop(droppedSlides)
          }
        }
      } catch { /* ignore */ }
    } else {
      // Fallback to application/json for backward compatibility
      try {
        const dataStr = e.dataTransfer.getData('application/json')
        if (dataStr && onExternalDrop) {
          const droppedSlides = JSON.parse(dataStr)
          if (Array.isArray(droppedSlides)) {
            onExternalDrop(droppedSlides)
          }
        }
      } catch { /* ignore */ }
    }
    
    dragSourceId.current = null
    dragSourceType.current = null
  }, [onExternalDrop])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <h2 className={styles.title}>Presentation Structure</h2>
        <span className={styles.slideCount}>{slides.length} slide{slides.length !== 1 ? 's' : ''}</span>
        <button className={styles.saveBtn} onClick={() => onSave(slides, tree)}>
          Save
        </button>
      </div>

      {/* Level name pills */}
      {slides.length > 0 && depthLevels.length > 0 && (
        <div className={styles.levelNamesSection}>
          <span className={styles.levelNamesLabel}>Levels:</span>
          <div className={styles.levelNamesList}>
            {depthLevels.map(depth => (
              <div key={depth} className={styles.levelNamePill}>
                {editingLevelDepth === depth ? (
                  <input
                    className={styles.levelNameInput}
                    autoFocus
                    value={editingLevelValue}
                    onChange={e => setEditingLevelValue(e.target.value)}
                    onBlur={finishEditingLevel}
                    onKeyDown={e => {
                      if (e.key === 'Enter') finishEditingLevel()
                      if (e.key === 'Escape') setEditingLevelDepth(null)
                    }}
                    placeholder={depth === 0 ? 'e.g. Chapter' : depth === 1 ? 'e.g. Section' : 'e.g. Slide'}
                    maxLength={30}
                  />
                ) : (
                  <button
                    className={styles.levelNameButton}
                    onClick={() => startEditingLevel(depth)}
                    title="Click to rename this level"
                  >
                    {(levelNames || [])[depth] || (depth === 0 ? 'Root' : `Level ${depth}`)}
                    <span className={styles.editIcon}>✎</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nesting hint */}
      {slides.length > 0 && (
        <div className={styles.nestingHint}>
          Drag onto a node to nest it · Use <kbd>→</kbd> / <kbd>←</kbd> buttons to indent/outdent
        </div>
      )}

      {/* Tree workspace */}
      <div
        ref={workspaceRef}
        className={`${styles.treeWorkspace} ${dragOverRoot ? styles.dragOverRoot : ''}`}
        onDragOver={handleWorkspaceDragOver}
        onDragLeave={handleWorkspaceDragLeave}
        onDrop={handleWorkspaceDrop}
        role="tree"
      >
       {slides.length === 0 ? (
           <div className={styles.emptyState}>
             <div className={styles.emptyIcon}>⊕</div>
             <p className={styles.emptyTitle}>No slides in this structure</p>
             <p className={styles.emptyHint}>Drag slides from the catalog, or select and click "Add to Tree"</p>
           </div>
         ) : tree.length === 0 ? (
           <div className={`${styles.emptyDropZone} ${dragOverRoot ? styles.emptyDropZoneActive : ''}`}>
             <div className={styles.emptyIcon}>⊕</div>
             <p className={styles.emptyTitle}>Drag slides or groups here to build your presentation</p>
           </div>
         ) : (
           <>
             <div className={styles.treeList}>
               {tree.map(node => (
                 <TreeNode
                   key={node.slideRefId}
                   node={node}
                   slides={slides}
                   depth={0}
                   parentId={null}
                   flatList={flat}
                   levelNames={levelNames}
                   expandedIds={expandedIds}
                   editingNodeId={editingNodeId}
                   editingNodeValue={editingNodeValue}
                   dragOverId={dragOverId}
                   dragOverZone={dragOverZone}
                   isDragging={isDragging}
                   onToggleExpand={toggleExpanded}
                   onStartEditNode={startEditingNode}
                   onFinishEditNode={finishEditingNode}
                   onEditValueChange={setEditingNodeValue}
                   onRemove={handleRemove}
                   onIndent={handleIndent}
                   onOutdent={handleOutdent}
                   onDragStart={handleDragStart}
                   onDragEnd={handleDragEnd}
                   onNodeDragOver={handleNodeDragOver}
                   onDrop={handleDrop}
                   setEditingNodeId={setEditingNodeId}
                 />
               ))}
             </div>
             {isCatalogDrag && catalogDropLinePos && (
               <div
                 className={styles.insertionLine}
                 style={{ top: `${catalogDropLinePos.top}px` }}
               >
                 <div className={styles.insertionLineDot} />
               </div>
             )}
           </>
         )}
      </div>
    </div>
  )
}
