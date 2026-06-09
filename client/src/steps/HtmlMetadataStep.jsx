/**
 * HtmlMetadataStep — Stage 4 of the HTML Visual Flow.
 *
 * Assign per-slide metadata (name), export slides with metadata,
 * and finish back to the project dashboard.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import AppHeader   from '../components/AppHeader.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'

export default function HtmlMetadataStep({
  projectName,
  flowName,
  templateFilename,
  flowId,
  applied,        // { outputFile, previewHtml, roundId, slideCount }
  slideNames,     // [{ index, name }, ...]
  step,
  canNavigateTo,
  navigateTo,
  onBack,
  onFinish,
  setToast,
  debugContext,
  skippedSlides = [],
}) {
  const { outputFile, roundId, slideCount = 1 } = applied
  const generationContext = debugContext?.project || {}

  const [exportName, setExportName] = useState('')
  const [bulkGroupValue, setBulkGroupValue] = useState('')
  const [selectedSlides, setSelectedSlides] = useState([])

  const [metadata, setMetadata] = useState(
    Array.from({ length: slideCount }, (_, i) => ({
      name: `Slide ${i + 1}`,
      exportGroup: '',
    }))
  )

  const [isExporting, setIsExporting] = useState(false)

  // Pre-fill metadata from slideNames prop and auto-populate exportName
  useEffect(() => {
    if (slideNames?.length) {
      setMetadata(
        Array.from({ length: slideCount }, (_, i) => {
          const found = slideNames.find(s => s.index === i + 1)
          return {
            name: found?.name ?? `Slide ${i + 1}`,
            exportGroup: found?.exportGroup ?? '',
          }
        })
      )

      // Auto-populate export name from first slide if not already set
      if (!exportName.trim() && slideNames[0]?.name) {
        setExportName(slideNames[0].name)
      }
    }
  }, [slideCount, slideNames])

  const handleMetadataChange = useCallback((index, field, value) => {
    setMetadata(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }, [])

  const toggleSlideSelection = useCallback((index) => {
    setSelectedSlides(prev => (
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    ))
  }, [])

  const applyBulkGroup = useCallback(() => {
    const value = bulkGroupValue.trim()
    if (!selectedSlides.length) return

    setMetadata(prev => prev.map((slide, index) => (
      selectedSlides.includes(index)
        ? { ...slide, exportGroup: value }
        : slide
    )))
    setSelectedSlides([])
  }, [bulkGroupValue, selectedSlides])

  const selectAllSlides = useCallback(() => {
    setSelectedSlides(metadata.map((_, index) => index))
  }, [metadata])

  const groupedSummary = useMemo(() => {
    const counts = new Map()
    metadata.forEach(slide => {
      const key = slide.exportGroup?.trim() || 'default'
      counts.set(key, (counts.get(key) || 0) + 1)
    })
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [metadata])

  const exportBuckets = useMemo(() => {
    const buckets = new Map()
    metadata.forEach((slide, index) => {
      const group = slide.exportGroup?.trim() || 'default'
      if (!buckets.has(group)) buckets.set(group, [])
      buckets.get(group).push({ ...slide, index: index + 1 })
    })
    return Array.from(buckets.entries())
  }, [metadata])

  const contextSummary = useMemo(() => {
    const items = []
    if (generationContext.groupingColumn) {
      items.push(`Grouping column: ${generationContext.groupingColumn}`)
    }
    if (Array.isArray(generationContext.selections) && generationContext.selections.length > 0) {
      items.push(`Filters / selections: ${generationContext.selections.length}`)
    }
    if (Array.isArray(generationContext.repeatableSlides) && generationContext.repeatableSlides.length > 0) {
      items.push(`Repeatable slides: ${generationContext.repeatableSlides.length}`)
    }
    if (Array.isArray(generationContext.zones) && generationContext.zones.length > 0) {
      items.push(`Zones: ${generationContext.zones.length}`)
    }
    return items
  }, [generationContext])

  const exportGroupPreview = useMemo(() => {
    return exportBuckets.map(([groupName, slides]) => `${groupName} (${slides.length})`).join(', ')
  }, [exportBuckets])

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const results = []

      for (const [groupName, slides] of exportBuckets) {
        const slideMetadata = slides.map((slide) => ({
          slideId: `slide-${slide.index}`,
          name: slide.name,
          type: 'content',
          exportGroup: groupName,
        }))
        const slideIndices = slides.map(slide => slide.index)

        const res = await fetch(`/api/projects/${projectName}/flows/${flowId}/exports`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ 
            roundId, 
            outputFile, 
            exportName: groupName === 'default' ? exportName.trim() : groupName,
            slideMetadata,
            slideIndices,
          }),
        })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || 'Export failed')
        results.push({ groupName, count: data.slideCount })
      }

      const totalSlides = results.reduce((sum, item) => sum + item.count, 0)
      const groupSummary = results.map(r => `${r.groupName} (${r.count})`).join(', ')
      setToast({ type: 'success', message: `Exported ${results.length} group${results.length !== 1 ? 's' : ''}: ${groupSummary}. Total ${totalSlides} slide${totalSlides !== 1 ? 's' : ''}.` })
    } catch (err) {
      setToast({ type: 'error', message: err.message })
    } finally {
      setIsExporting(false)
    }
  }, [projectName, flowId, roundId, outputFile, metadata, exportName, setToast, exportBuckets])



  return (
    <div className="app">
      <AppHeader
        title={flowName || flowId}
        subtitle={templateFilename || projectName}
        debugContext={debugContext}
      />
      <Breadcrumbs step={step} canNavigateTo={canNavigateTo} navigateTo={navigateTo} flow="html" />

      <div className="html-metadata-panel">
         {/* Skipped Slides Warning */}
         {skippedSlides.length > 0 && (
           <div style={{
             backgroundColor: '#fff3cd',
             border: '1px solid #ffeaa7',
             borderRadius: '4px',
             padding: '12px 16px',
             marginBottom: '20px',
             color: '#856404',
           }}>
             <strong>⚠️ {skippedSlides.length} slide(s) were skipped due to generation errors:</strong>
             <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
               {skippedSlides.map((slide, i) => (
                 <li key={i}>{slide}</li>
               ))}
             </ul>
             <small style={{ display: 'block', marginTop: '8px' }}>These slides will not be included in the export. You can go back to retry them if needed.</small>
           </div>
         )}

        {/* Export Name Field */}
        <div className="html-metadata-export-name">
           <label htmlFor="export-name">Export Name</label>
           <input
             id="export-name"
             type="text"
             value={exportName}
            onChange={e => setExportName(e.target.value)}
            placeholder="e.g., Q2 Product Launch"
             disabled={isExporting}
           />
         </div>

          <div className="html-metadata-export-summary" aria-live="polite">
            {groupedSummary.map(([groupName, count]) => (
              <span key={groupName} className="html-metadata-export-badge">
                {groupName}: {count}
              </span>
            ))}
          </div>

          {contextSummary.length > 0 && (
            <div className="html-metadata-context-summary">
              {contextSummary.map(item => (
                <span key={item} className="html-metadata-context-chip">{item}</span>
              ))}
            </div>
          )}

          <p className="html-metadata-panel-desc">
            Blank export groups route to <code>default</code>. This export will create: {exportGroupPreview || 'default (1)'}
          </p>

         <div className="html-metadata-bulk-bar">
           <label htmlFor="bulk-group-value">Set export group for selected slides</label>
           <div className="html-metadata-bulk-controls">
             <input
               id="bulk-group-value"
               type="text"
               value={bulkGroupValue}
               onChange={e => setBulkGroupValue(e.target.value)}
               placeholder='e.g. Capability A'
               disabled={isExporting}
             />
              <button
                className="btn btn-secondary"
                onClick={applyBulkGroup}
                disabled={isExporting || selectedSlides.length === 0}
              >
                Apply to selected
              </button>
              <button
                className="btn btn-secondary"
                onClick={selectAllSlides}
                disabled={isExporting || metadata.length === 0 || selectedSlides.length === metadata.length}
              >
                Select all
              </button>
              <button
                className="btn btn-link"
                onClick={() => setSelectedSlides([])}
                disabled={isExporting || selectedSlides.length === 0}
              >
                Deselect all
              </button>
            </div>
           <small>Blank export groups will be exported to the <code>default</code> folder.</small>
         </div>

         {/* Slide List */}
        <div className="html-metadata-slide-list">
          {metadata.map((slide, i) => {
            const selected = selectedSlides.includes(i)
            return (
              <div key={i} className={`html-metadata-slide-row${selected ? ' is-selected' : ''}`}>
                <label className="html-metadata-select">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSlideSelection(i)}
                    disabled={isExporting}
                  />
                </label>
                <span className="html-metadata-index">{i + 1}</span>
                <div className="html-metadata-row-fields">
                  <input
                    className="html-metadata-input"
                    value={slide.name}
                    onChange={e => handleMetadataChange(i, 'name', e.target.value)}
                    placeholder={`Slide ${i + 1}`}
                    disabled={isExporting}
                  />
                  <input
                    className="html-metadata-input html-metadata-export-group"
                    value={slide.exportGroup}
                    onChange={e => handleMetadataChange(i, 'exportGroup', e.target.value)}
                    placeholder="Export group: default"
                    disabled={isExporting}
                  />
                  <div className="html-metadata-row-context">
                    <span>{slide.groupingColumn ? `Grouping: ${slide.groupingColumn}` : 'Grouping: AI decides'}</span>
                    <span>{Array.isArray(slide.filters) && slide.filters.length ? `Filters: ${slide.filters.length}` : 'Filters: none'}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="html-metadata-actions">
          <button className="btn btn-link" onClick={onBack}>
            <span aria-hidden="true">←</span> Back
          </button>
          <div className="html-metadata-right-actions">
            <button
              className="btn btn-secondary"
              onClick={handleExport}
              disabled={isExporting || exportBuckets.length === 0}
              data-testid="btn-export-slides"
            >
              {isExporting ? 'Packaging…' : `Package ${exportBuckets.length} export${exportBuckets.length !== 1 ? 's' : ''}`}
            </button>
            <button
              className="btn btn-primary"
              onClick={onFinish}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
