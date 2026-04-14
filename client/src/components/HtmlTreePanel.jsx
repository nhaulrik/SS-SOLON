/**
 * HtmlTreePanel — structural DOM tree browser for the HTML Visual Flow.
 *
 * Replaces the flat zone list. Shows the slide's DOM hierarchy so the user
 * can select nodes (single or multi), assign zone types, and provide prompts.
 *
 * Props:
 *   trees              — array of per-slide tree node arrays from the server
 *   selections         — current selection objects array (controlled)
 *   onSelections       — (newSelections) => void
 *   onClearAll         — () => void — clears all zones + repeatable slides
 *   repeatableSlides   — [{ slideIndex, key, prompt }] (controlled)
 *   onRepeatableSlides — (newRepeatableSlides) => void
 *   slideCount         — total number of slides
 *   highlightNodeId    — node id currently highlighted from iframe hover
 *   onHighlight        — (nodeId | null) => void — called on tree row hover
 */

import { useState, useCallback, useMemo } from 'react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeKey(raw) {
  return raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 60)
}

function suggestKey(node) {
  // Derive a snake_case key from the node's classes or text preview
  const fromClass = node.classes.filter(c => c.length > 2 && !/^(col|row|wrap|inner|outer|box|section|panel|left|right|top|bottom|main|body|content)$/.test(c))[0]
  if (fromClass) return sanitizeKey(fromClass)
  if (node.textPreview) return sanitizeKey(node.textPreview.slice(0, 30))
  return sanitizeKey(node.label)
}

/** Flatten a tree array into a depth-first list. */
function flatten(nodes) {
  const result = []
  function visit(arr) {
    for (const n of arr) {
      result.push(n)
      if (n.children?.length) visit(n.children)
    }
  }
  visit(nodes)
  return result
}

/** True if nodeId is a strict descendant of ancestorId in the CSS-path scheme. */
function isDescendant(nodeId, ancestorId) {
  return nodeId !== ancestorId && nodeId.startsWith(ancestorId + '>')
}

// ── Slide control bar ─────────────────────────────────────────────────────────

function SlideControlBar({ slideIndex, repeatableSlides, onRepeatableSlides, hasZones }) {
  const existing = repeatableSlides.find(rs => rs.slideIndex === slideIndex)
  const isRep    = !!existing

  const handleToggle = (e) => {
    if (e.target.checked) {
      onRepeatableSlides([...repeatableSlides, { slideIndex, key: `slide_${slideIndex}`, prompt: '' }])
    } else {
      onRepeatableSlides(repeatableSlides.filter(rs => rs.slideIndex !== slideIndex))
    }
  }

  const handleKey = (val) => {
    const sanitized = val.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+/, '').slice(0, 60)
    onRepeatableSlides(repeatableSlides.map(rs =>
      rs.slideIndex === slideIndex ? { ...rs, key: sanitized } : rs
    ))
  }

  const handlePrompt = (val) => {
    onRepeatableSlides(repeatableSlides.map(rs =>
      rs.slideIndex === slideIndex ? { ...rs, prompt: val } : rs
    ))
  }

  return (
    <div className={`html-tree-slide-bar${isRep ? ' html-tree-slide-bar--repeatable' : ''}`}
         data-testid={`slide-bar-${slideIndex}`}>
      <div className="html-tree-slide-bar-header">
        <span className="html-tree-slide-bar-label">
          Slide {slideIndex}
          {isRep && <span className="html-tree-slide-bar-badge" data-testid={`slide-repeatable-badge-${slideIndex}`}>repeatable</span>}
        </span>
        <label className="html-tree-slide-bar-toggle" title="Mark this entire slide as repeatable">
          <input
            type="checkbox"
            checked={isRep}
            onChange={handleToggle}
            data-testid={`slide-repeatable-toggle-${slideIndex}`}
          />
          <span>Repeatable</span>
        </label>
      </div>

      {isRep && (
        <div className="html-tree-slide-bar-fields">
          <div className="html-tree-slide-bar-field">
            <label>Slide key</label>
            <input
              className="html-tree-slide-bar-input"
              value={existing.key}
              onChange={e => handleKey(e.target.value)}
              placeholder="brand_slide"
              data-testid={`slide-key-input-${slideIndex}`}
            />
          </div>
          <div className="html-tree-slide-bar-field">
            <label>Generation prompt</label>
            <textarea
              className="html-tree-slide-bar-input html-tree-slide-bar-textarea"
              rows={2}
              value={existing.prompt}
              onChange={e => handlePrompt(e.target.value)}
              placeholder='e.g. "Generate one slide per car brand found in your context"'
              data-testid={`slide-prompt-input-${slideIndex}`}
            />
          </div>
          {!hasZones && (
            <p className="html-tree-slide-bar-warning" data-testid={`slide-no-zones-warning-${slideIndex}`}>
              ⚠ No zones assigned to this slide. Mark at least one zone as unique for meaningful instances.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Selection badge ───────────────────────────────────────────────────────────

function SelectionBadge({ sel }) {
  const isShared = sel.unique === false
  return (
    <span className={`tree-zone-badge tree-zone-badge--${sel.zoneType}${isShared ? ' tree-zone-badge--shared' : ''}`}>
      {isShared ? 'shared' : sel.zoneType === 'block' ? 'block' : sel.type || 'leaf'}
      <span className="tree-zone-badge-key">{sel.key}</span>
    </span>
  )
}

// ── Assignment panel ──────────────────────────────────────────────────────────

function AssignmentPanel({ nodes, existingSel, isRepeatableSlide, onAssign, onClear, onClose }) {
  const isGroup  = nodes.length > 1
  const firstNode = nodes[0]

  const [zoneType, setZoneType]   = useState(existingSel?.zoneType ?? (isGroup ? 'block' : 'leaf'))
  const [key,      setKey]        = useState(existingSel?.key ?? suggestKey(firstNode))
  const [hint,     setHint]       = useState(existingSel?.hint ?? '')
  const [prompt,   setPrompt]     = useState(existingSel?.prompt ?? '')
  const [type,     setType]       = useState(existingSel?.type ?? 'text')
  const [autoGen,  setAutoGen]    = useState(existingSel?.autoGenerate ?? true)
  // unique: true = different per instance, false = same on every clone
  // Only meaningful for zones on repeatable slides
  const [unique,   setUnique]     = useState(existingSel?.unique !== false)

  const handleConfirm = () => {
    if (!key.trim()) return
    const payload = { zoneType, key: key.trim(), hint: hint.trim(), prompt: prompt.trim(), type, autoGenerate: autoGen }
    if (isRepeatableSlide) payload.unique = unique
    onAssign(payload)
  }

  return (
    <div
      className="tree-assign-panel"
      data-testid="tree-assign-panel"
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      <div className="tree-assign-header">
        <span className="tree-assign-title">
          {isGroup ? `Assign ${nodes.length} elements` : `Assign: ${firstNode.label}`}
        </span>
        <button className="tree-assign-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {isGroup && (
        <p className="tree-assign-group-note">
          All selected elements will share this zone key and prompt.
        </p>
      )}

      {/* Zone type selector */}
      <div className="tree-assign-options">
        <label className={`tree-assign-option${zoneType === 'leaf' ? ' tree-assign-option--active' : ''}`}>
          <input type="radio" name="zoneType" value="leaf" checked={zoneType === 'leaf'} onChange={() => setZoneType('leaf')} />
          <div>
            <strong>Content zone</strong>
            <span>AI fills this element's text value</span>
          </div>
        </label>
        <label className={`tree-assign-option${zoneType === 'block' ? ' tree-assign-option--active' : ''}`}>
          <input type="radio" name="zoneType" value="block" checked={zoneType === 'block'} onChange={() => setZoneType('block')} />
          <div>
            <strong>Block zone</strong>
            <span>AI generates the entire inner HTML</span>
          </div>
        </label>
      </div>

      {/* Zone key */}
      <div className="tree-assign-field">
        <label>Zone key</label>
        <input
          className="tree-assign-input"
          value={key}
          onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
          placeholder="snake_case_key"
          autoFocus
          onKeyDown={e => e.key === 'Enter' && handleConfirm()}
          data-testid="tree-assign-key"
        />
      </div>

      {/* Leaf: hint + type */}
      {zoneType === 'leaf' && (
        <>
          <div className="tree-assign-field">
            <label>Hint <span className="tree-assign-optional">(guidance for the AI)</span></label>
            <input
              className="tree-assign-input"
              value={hint}
              onChange={e => setHint(e.target.value)}
              placeholder="Describe what content goes here…"
              data-testid="tree-assign-hint"
            />
          </div>
          <div className="tree-assign-field tree-assign-field--row">
            <div>
              <label>Type</label>
              <select className="tree-assign-input" value={type} onChange={e => setType(e.target.value)} data-testid="tree-assign-type">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="image">Image</option>
              </select>
            </div>
            <label className="tree-assign-toggle">
              <input type="checkbox" checked={autoGen} onChange={e => setAutoGen(e.target.checked)} data-testid="tree-assign-ai" />
              <span>AI generates</span>
            </label>
          </div>
        </>
      )}

      {/* Block: prompt */}
      {zoneType === 'block' && (
        <div className="tree-assign-field">
          <label>Prompt <span className="tree-assign-optional">(optional)</span></label>
          <textarea
            className="tree-assign-input tree-assign-textarea"
            rows={3}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder='e.g. "Populate with Q3 initiatives for the EMEA region"'
            data-testid="tree-assign-prompt"
          />
        </div>
      )}

      {/* Uniqueness toggle — only shown for zones on repeatable slides */}
      {isRepeatableSlide && (
        <div className="tree-assign-field" data-testid="tree-assign-uniqueness">
          <label>Across slide instances</label>
          <div className="tree-assign-uniqueness-options">
            <label className={`tree-assign-uniqueness-option${unique ? ' tree-assign-uniqueness-option--active' : ''}`}>
              <input
                type="radio"
                name="unique"
                checked={unique}
                onChange={() => setUnique(true)}
                data-testid="tree-assign-unique"
              />
              <div>
                <strong>Unique</strong>
                <span>Different value per instance</span>
              </div>
            </label>
            <label className={`tree-assign-uniqueness-option${!unique ? ' tree-assign-uniqueness-option--active' : ''}`}>
              <input
                type="radio"
                name="unique"
                checked={!unique}
                onChange={() => setUnique(false)}
                data-testid="tree-assign-shared"
              />
              <div>
                <strong>Shared</strong>
                <span>Same value on every clone</span>
              </div>
            </label>
          </div>
        </div>
      )}

      <div className="tree-assign-actions">
        {existingSel && (
          <button className="btn btn-danger-subtle" onClick={onClear} data-testid="tree-assign-clear">
            Remove zone
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={!key.trim()}
          data-testid="tree-assign-confirm"
        >
          {existingSel ? 'Update' : 'Assign zone'}
        </button>
      </div>
    </div>
  )
}

// ── Tree node row ─────────────────────────────────────────────────────────────

function TreeNode({
  node,
  depth,
  selections,
  selectedIds,
  expandedIds,
  onToggleExpand,
  onToggleSelect,
  onOpenAssign,
  highlightNodeId,
  onHighlight,
  conflictIds,
}) {
  const sel         = selections.find(s => s.nodeId === node.id)
  const isSelected  = selectedIds.has(node.id)
  const isExpanded  = expandedIds.has(node.id)
  const isHighlight = highlightNodeId === node.id
  const isConflict  = conflictIds.has(node.id)
  const hasChildren = node.children?.length > 0

  const indent = depth * 16

  return (
    <>
      <div
        className={[
          'tree-node',
          isSelected  ? 'tree-node--selected'  : '',
          isHighlight ? 'tree-node--highlight' : '',
          node.interesting ? 'tree-node--interesting' : '',
          node.chrome      ? 'tree-node--chrome'      : '',
          isConflict       ? 'tree-node--conflict'    : '',
          sel ? `tree-node--assigned tree-node--assigned-${sel.zoneType}` : '',
        ].filter(Boolean).join(' ')}
        style={{ paddingLeft: 8 + indent + 'px' }}
        onMouseEnter={() => onHighlight(node.id)}
        onMouseLeave={() => onHighlight(null)}
        data-node-id={node.id}
        data-testid={`tree-node-${node.id}`}
      >
        {/* Expand toggle */}
        <button
          className="tree-node-expand"
          onClick={() => hasChildren && onToggleExpand(node.id)}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          tabIndex={hasChildren ? 0 : -1}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {isExpanded ? '▾' : '▸'}
        </button>

        {/* Checkbox for multi-select */}
        <input
          type="checkbox"
          className="tree-node-check"
          checked={isSelected}
          onChange={() => onToggleSelect(node.id)}
          aria-label={`Select ${node.label}`}
          data-testid={`tree-check-${node.id}`}
        />

        {/* Node label */}
        <span className="tree-node-label" onClick={() => onOpenAssign([node])}>
          <span className="tree-node-tag">{node.tag}</span>
          {node.classes.length > 0 && (
            <span className="tree-node-classes">.{node.classes.join('.')}</span>
          )}
          {node.textPreview && (
            <span className="tree-node-preview">{node.textPreview}</span>
          )}
        </span>

        {/* Zone badge */}
        {sel && <SelectionBadge sel={sel} />}

        {/* Assign / edit button */}
        <button
          className="tree-node-assign-btn"
          onClick={() => onOpenAssign([node])}
          title={sel ? 'Edit zone' : 'Assign zone'}
          data-testid={`tree-assign-btn-${node.id}`}
        >
          {sel ? '✎' : '+'}
        </button>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && node.children.map(child => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selections={selections}
          selectedIds={selectedIds}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          onToggleSelect={onToggleSelect}
          onOpenAssign={onOpenAssign}
          highlightNodeId={highlightNodeId}
          onHighlight={onHighlight}
          conflictIds={conflictIds}
        />
      ))}
    </>
  )
}

// ── Conflict warning ──────────────────────────────────────────────────────────

function ConflictWarning({ conflicts, onDismiss }) {
  if (!conflicts.length) return null
  return (
    <div className="tree-conflict-warning" data-testid="tree-conflict-warning">
      <strong>Block zone takes precedence.</strong> The following zones will be removed:
      <ul>
        {conflicts.map(s => <li key={s.nodeId}><code>{s.key}</code></li>)}
      </ul>
      <button className="btn btn-secondary" onClick={onDismiss}>OK</button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HtmlTreePanel({
  trees,
  selections,
  onSelections,
  onClearAll,
  repeatableSlides = [],
  onRepeatableSlides,
  slideCount,
  highlightNodeId,
  onHighlight,
}) {
  const [slideIdx,     setSlideIdx]     = useState(0)   // 0-based
  const [expandedIds,  setExpandedIds]  = useState(() => new Set())
  const [selectedIds,  setSelectedIds]  = useState(() => new Set())
  const [assignTarget, setAssignTarget] = useState(null) // [node, ...]
  const [conflicts,    setConflicts]    = useState([])

  const currentTree = trees?.[slideIdx] ?? []
  const slideIndex  = slideIdx + 1

  // Is the current slide marked repeatable?
  const isCurrentSlideRepeatable = repeatableSlides.some(rs => rs.slideIndex === slideIndex)

  // Nodes that are descendants of a block zone (will be superseded)
  const conflictIds = useMemo(() => {
    const blockNodeIds = selections.filter(s => s.zoneType === 'block').map(s => s.nodeId)
    const ids = new Set()
    for (const flat of flatten(currentTree)) {
      if (blockNodeIds.some(bid => isDescendant(flat.id, bid))) ids.add(flat.id)
    }
    return ids
  }, [selections, currentTree])

  // ── Expand / collapse ────────────────────────────────────────────────────────

  const handleToggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  // ── Multi-select ─────────────────────────────────────────────────────────────

  const handleToggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  // ── Open assignment panel ────────────────────────────────────────────────────

  const handleOpenAssign = useCallback((nodes) => {
    setAssignTarget(nodes)
  }, [])

  const handleOpenGroupAssign = useCallback(() => {
    if (selectedIds.size === 0) return
    const allNodes = flatten(currentTree)
    const nodes    = allNodes.filter(n => selectedIds.has(n.id))
    if (nodes.length > 0) setAssignTarget(nodes)
  }, [selectedIds, currentTree])

  // ── Assign ───────────────────────────────────────────────────────────────────

  const handleAssign = useCallback(({ zoneType, key, hint, prompt, type, autoGenerate, unique }) => {
    if (!assignTarget) return

    const newSelections = [...selections]

    // Detect conflicts: leaf zones that are descendants of the new block zone
    const removedByConflict = []
    if (zoneType === 'block') {
      for (const node of assignTarget) {
        const existing = newSelections.filter(
          s => s.zoneType === 'leaf' && isDescendant(s.nodeId, node.id)
        )
        removedByConflict.push(...existing)
      }
    }

    // Remove conflicted selections
    const filtered = newSelections.filter(s => !removedByConflict.includes(s))

    // Add / replace selections for each target node
    for (const node of assignTarget) {
      const idx = filtered.findIndex(s => s.nodeId === node.id)
      const sel = {
        nodeId:       node.id,
        slideIndex,
        zoneType,
        key,
        hint:         zoneType === 'block' ? (prompt || hint) : hint,
        prompt:       zoneType === 'block' ? prompt : '',
        autoGenerate: zoneType === 'block' ? true : autoGenerate,
        type:         zoneType === 'block' ? 'block' : type,
        // Capture the node's current innerHTML as exampleHtml for block zones
        // so the recipe builder can show the AI the exact HTML structure to fill
        ...(zoneType === 'block' && node.innerHTML ? { exampleHtml: node.innerHTML } : {}),
        // unique is only set for zones on repeatable slides
        ...(isCurrentSlideRepeatable ? { unique: unique !== false } : {}),
      }
      if (idx >= 0) filtered[idx] = sel
      else filtered.push(sel)
    }

    onSelections(filtered)

    if (removedByConflict.length > 0) setConflicts(removedByConflict)
    setAssignTarget(null)
    setSelectedIds(new Set())
  }, [assignTarget, selections, onSelections, slideIndex, isCurrentSlideRepeatable])

  // ── Clear zone ───────────────────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    if (!assignTarget) return
    const targetIds = new Set(assignTarget.map(n => n.id))
    onSelections(selections.filter(s => !targetIds.has(s.nodeId)))
    setAssignTarget(null)
  }, [assignTarget, selections, onSelections])

  // ── Expand all interesting nodes on first load ────────────────────────────────

  const handleExpandInteresting = useCallback(() => {
    const ids = new Set()
    function visit(nodes) {
      for (const n of nodes) {
        if (!n.chrome && n.children?.length) {
          ids.add(n.id)
          visit(n.children)
        }
      }
    }
    visit(currentTree)
    setExpandedIds(ids)
  }, [currentTree])

  const selectionCount = selections.filter(s => s.slideIndex === slideIndex).length

  return (
    <div className="html-tree-panel" data-testid="html-tree-panel">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="html-tree-header">
        <div className="html-tree-header-left">
          <span className="html-tree-title">DOM Tree</span>
          <span className="html-tree-count">
            {selectionCount} zone{selectionCount !== 1 ? 's' : ''} assigned
          </span>
        </div>
        <div className="html-tree-header-right">
          {selectedIds.size > 1 && (
            <button
              className="btn btn-secondary html-tree-group-btn"
              onClick={handleOpenGroupAssign}
              data-testid="tree-group-assign-btn"
            >
              Assign {selectedIds.size} selected →
            </button>
          )}
          {onClearAll && (selections.length > 0 || repeatableSlides.length > 0) && (
            <button
              className="btn btn-link html-tree-clear-btn"
              onClick={() => {
                if (window.confirm('Clear all zone assignments and repeatable slide settings?')) {
                  onClearAll()
                }
              }}
              title="Remove all zone assignments and repeatable slide settings"
              data-testid="tree-clear-all-btn"
            >
              Clear all
            </button>
          )}
          <button
            className="btn btn-link html-tree-expand-btn"
            onClick={handleExpandInteresting}
            title="Expand all content nodes"
          >
            Expand all
          </button>
          {expandedIds.size > 0 && (
            <button
              className="btn btn-link html-tree-expand-btn"
              onClick={() => setExpandedIds(new Set())}
              title="Collapse all"
            >
              Collapse
            </button>
          )}
        </div>
      </div>

      {/* ── Slide tabs (multi-slide templates) ──────────────────────────── */}
      {slideCount > 1 && (
        <div className="html-tree-slide-tabs">
          {Array.from({ length: slideCount }, (_, i) => {
            const isRep = repeatableSlides.some(rs => rs.slideIndex === i + 1)
            return (
              <button
                key={i}
                className={`html-tree-slide-tab${slideIdx === i ? ' html-tree-slide-tab--active' : ''}${isRep ? ' html-tree-slide-tab--repeatable' : ''}`}
                onClick={() => { setSlideIdx(i); setExpandedIds(new Set()); setSelectedIds(new Set()) }}
              >
                Slide {i + 1}{isRep ? ' ↻' : ''}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Slide control bar (repeatable toggle) ────────────────────────── */}
      {onRepeatableSlides && (
        <SlideControlBar
          slideIndex={slideIndex}
          repeatableSlides={repeatableSlides}
          onRepeatableSlides={onRepeatableSlides}
          hasZones={selections.some(s => s.slideIndex === slideIndex && s.unique !== false)}
        />
      )}

      {/* ── Conflict warning ─────────────────────────────────────────────── */}
      <ConflictWarning conflicts={conflicts} onDismiss={() => setConflicts([])} />

      {/* ── Tree ─────────────────────────────────────────────────────────── */}
      <div className="html-tree-scroll">
        {currentTree.length === 0 ? (
          <p className="html-tree-empty">No elements found in this slide.</p>
        ) : (
          currentTree.map(node => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selections={selections}
              selectedIds={selectedIds}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
              onToggleSelect={handleToggleSelect}
              onOpenAssign={handleOpenAssign}
              highlightNodeId={highlightNodeId}
              onHighlight={onHighlight}
              conflictIds={conflictIds}
            />
          ))
        )}
      </div>

      {/* ── Assignment panel ─────────────────────────────────────────────── */}
      {assignTarget && (
        <div className="html-tree-assign-overlay" onClick={() => setAssignTarget(null)}>
          <div onClick={e => e.stopPropagation()}>
            <AssignmentPanel
              nodes={assignTarget}
              existingSel={assignTarget.length === 1
                ? selections.find(s => s.nodeId === assignTarget[0].id)
                : null}
              isRepeatableSlide={isCurrentSlideRepeatable}
              onAssign={handleAssign}
              onClear={handleClear}
              onClose={() => setAssignTarget(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
