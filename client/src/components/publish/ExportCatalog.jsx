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

export default function ExportCatalog({ exports, loading, activeSlides, onAddSlides }) {
  const [expandedExports, setExpandedExports] = useState(new Set())
  const [selectedKeys, setSelectedKeys] = useState(new Set())

  const activeSlideKeys = useMemo(() => {
    return new Set(activeSlides.map(s => `${s.flowId}::${s.exportId}::${s.slideIndex}`))
  }, [activeSlides])

  const toggleExport = (exportId) => {
    setExpandedExports(prev => {
      const next = new Set(prev)
      if (next.has(exportId)) next.delete(exportId)
      else next.add(exportId)
      return next
    })
  }

  const toggleSlide = (key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAllInExport = (exp) => {
    const keys = exp.slides.map(s => `${exp.flowId}::${exp.exportId}::${s.slideIndex}`)
    const allSelected = keys.every(k => selectedKeys.has(k))
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (allSelected) keys.forEach(k => next.delete(k))
      else keys.forEach(k => next.add(k))
      return next
    })
  }

  const handleAddToTree = () => {
    if (selectedKeys.size === 0) return
    const slidesToAdd = []
    for (const key of selectedKeys) {
      const [flowId, exportId, slideIndexStr] = key.split('::')
      const slideIndex = parseInt(slideIndexStr, 10)
      const exp = exports.find(e => e.flowId === flowId && e.exportId === exportId)
      const slide = exp?.slides.find(s => s.slideIndex === slideIndex)
      if (slide && exp) {
        slidesToAdd.push(buildSlideForDrop(exp, slide))
      }
    }
    onAddSlides(slidesToAdd)
    setSelectedKeys(new Set())
  }

  const handleDragStart = (e, exp, slide) => {
    const key = `${exp.flowId}::${exp.exportId}::${slide.slideIndex}`
    const isAlreadyAdded = activeSlideKeys.has(key)

    if (isAlreadyAdded) {
      e.preventDefault()
      return
    }

    let slidesToDrag = []
    if (selectedKeys.has(key)) {
      for (const selectedKey of selectedKeys) {
        const [flowId, exportId, slideIndexStr] = selectedKey.split('::')
        const slideIndex = parseInt(slideIndexStr, 10)
        const selectedExp = exports.find(e => e.flowId === flowId && e.exportId === exportId)
        const selectedSlide = selectedExp?.slides.find(s => s.slideIndex === slideIndex)
        if (selectedSlide && selectedExp && !activeSlideKeys.has(selectedKey)) {
          slidesToDrag.push(buildSlideForDrop(selectedExp, selectedSlide))
        }
      }
    } else {
      slidesToDrag.push(buildSlideForDrop(exp, slide))
    }

    e.dataTransfer.effectAllowed = 'copy'
    // Set both MIME types for compatibility
    e.dataTransfer.setData('application/json', JSON.stringify(slidesToDrag))
    e.dataTransfer.setData('application/x-solon-catalog', JSON.stringify({
      type: 'slide',
      flowId: exp.flowId,
      exportId: exp.exportId,
      slideIndex: slide.slideIndex,
      title: slide.title,
    }))
  }

  const handleGroupDragStart = (e, exp) => {
    const slides = (exp.slides || []).map(slide => ({
      flowId: exp.flowId,
      exportId: exp.exportId,
      slideIndex: slide.slideIndex,
      title: slide.title,
    }))

    const payload = {
      type: 'group',
      flowId: exp.flowId,
      exportId: exp.exportId,
      flowName: exp.flowName,
      slides,
    }

    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('application/x-solon-catalog', JSON.stringify(payload))
    e.currentTarget.style.opacity = '0.5'
  }

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1'
  }

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

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Export Catalog</span>
        <span className={styles.exportCount}>{exports.length} export{exports.length !== 1 ? 's' : ''}</span>
      </div>
      <div className={styles.dragHint}>Drag slides into the workspace or select + Add</div>

      <div className={styles.exportList}>
        {exports.map(exp => {
          const isExpanded = expandedExports.has(exp.exportId)
          const exportSlideKeys = (exp.slides || []).map(s => `${exp.flowId}::${exp.exportId}::${s.slideIndex}`)
          const selectedInExport = exportSlideKeys.filter(k => selectedKeys.has(k)).length
          const allInExportSelected = exportSlideKeys.length > 0 && exportSlideKeys.every(k => selectedKeys.has(k))

           return (
             <div key={`${exp.flowId}::${exp.exportId}`} className={styles.exportGroup}>
               <div
                 className={styles.exportHeader}
                 draggable
                 onDragStart={(e) => handleGroupDragStart(e, exp)}
                 onDragEnd={handleDragEnd}
               >
                 <span className={styles.dragHandle}>⠿</span>
                 <label className={styles.exportCheckboxLabel}>
                   <input
                     type="checkbox"
                     className={styles.checkbox}
                     checked={allInExportSelected}
                     onChange={() => toggleAllInExport(exp)}
                     aria-label={`Select all slides in ${exp.exportId}`}
                   />
                 </label>
                 <button
                   className={styles.exportToggle}
                   onClick={() => toggleExport(exp.exportId)}
                   aria-expanded={isExpanded}
                   aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${exp.exportId}`}
                 >
                   <span className={styles.expandIcon}>{isExpanded ? '▾' : '▸'}</span>
                   <span className={styles.exportName}>{exp.flowName}</span>
                   <span className={styles.exportMeta}>
                     {exp.exportName || exp.exportId} · {(exp.slides || []).length} slides
                     {selectedInExport > 0 && (
                       <span className={styles.selectedBadge}>{selectedInExport} selected</span>
                     )}
                   </span>
                 </button>
               </div>

              {isExpanded && (
                <div className={styles.slideList}>
                  {(exp.slides || []).map(slide => {
                    const key = `${exp.flowId}::${exp.exportId}::${slide.slideIndex}`
                    const isChecked = selectedKeys.has(key)
                    const isAlreadyAdded = activeSlideKeys.has(key)
                    return (
                       <div
                         key={key}
                         className={`${styles.slideRow} ${isChecked ? styles.slideRowChecked : ''} ${isAlreadyAdded ? styles.slideRowAdded : ''}`}
                         draggable
                         onDragStart={(e) => handleDragStart(e, exp, slide)}
                         onDragEnd={handleDragEnd}
                       >
                         <span className={styles.dragHandle}>⠿</span>
                         <label className={styles.checkboxLabel}>
                           <input
                             type="checkbox"
                             className={styles.checkbox}
                             checked={isChecked}
                             onChange={() => toggleSlide(key)}
                             disabled={isAlreadyAdded}
                             aria-label={`Select ${slide.title}`}
                           />
                         </label>
                         <span className={styles.slideIndex}>{slide.slideIndex}</span>
                         <span className={styles.slideTitle}>{slide.title}</span>
                         {isAlreadyAdded && <span className={styles.addedBadge}>Added</span>}
                       </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedKeys.size > 0 && (
        <div className={styles.actionBar}>
          <span className={styles.actionBarCount}>{selectedKeys.size} slide{selectedKeys.size !== 1 ? 's' : ''} selected</span>
          <div className={styles.actionBarButtons}>
            <button className={styles.clearBtn} onClick={() => setSelectedKeys(new Set())}>
              Clear
            </button>
            <button className={styles.addToTreeBtn} onClick={handleAddToTree}>
              Add to Tree →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
