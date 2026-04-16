/**
 * HtmlMetadataStep — Stage 4 of the HTML Visual Flow.
 *
 * Assign per-slide metadata (id, name, type), export to individual slide files,
 * and finish back to the project dashboard.
 */

import { useState, useCallback } from 'react'
import AppHeader          from '../components/AppHeader.jsx'
import Breadcrumbs        from '../components/Breadcrumbs.jsx'
import ExportHistoryPanel from '../components/ExportHistoryPanel.jsx'

const SLIDE_TYPES = ['content', 'title', 'conclusion', 'other']

export default function HtmlMetadataStep({
  projectName,
  flowId,
  applied,        // { outputFile, previewHtml, roundId, slideCount }
  step,
  canNavigateTo,
  navigateTo,
  onBack,
  onFinish,
  setToast,
  debugContext,
}) {
  const { outputFile, roundId, slideCount = 1 } = applied

  const [metadata, setMetadata] = useState(
    Array.from({ length: slideCount }, (_, i) => ({
      slideId: `slide-${i + 1}`,
      name:    `Slide ${i + 1}`,
      type:    'content',
    }))
  )

  const [isExporting, setIsExporting] = useState(false)
  const [exportRefreshTrigger, setExportRefreshTrigger] = useState(0)

  const handleMetadataChange = useCallback((index, field, value) => {
    setMetadata(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }, [])

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const res = await fetch(`/api/projects/${projectName}/flows/${flowId}/exports`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ roundId, outputFile, slideMetadata: metadata }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Export failed')
      setToast({ type: 'success', message: `Exported ${data.slideCount} slide${data.slideCount !== 1 ? 's' : ''}` })
      setExportRefreshTrigger(n => n + 1)
    } catch (err) {
      setToast({ type: 'error', message: err.message })
    } finally {
      setIsExporting(false)
    }
  }, [projectName, flowId, roundId, outputFile, metadata, setToast])

  return (
    <div className="app">
      <AppHeader
        title={projectName}
        subtitle="Assign slide metadata and export"
        debugContext={debugContext}
      />
      <Breadcrumbs step={step} canNavigateTo={canNavigateTo} navigateTo={navigateTo} flow="html" />

      <div className="html-metadata-layout">

        {/* ── Left: metadata form ───────────────────────────────────── */}
        <div className="html-metadata-left">
          <div className="html-metadata-panel">
            <h3 className="html-metadata-panel-title">Slide Metadata</h3>
            <p className="html-metadata-panel-desc">
              Assign an ID, name, and type to each slide before exporting.
            </p>

            <div className="html-metadata-table-wrap">
              <table className="html-metadata-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Slide ID</th>
                    <th>Name</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {metadata.map((slide, i) => (
                    <tr key={i}>
                      <td className="html-metadata-index">{i + 1}</td>
                      <td>
                        <input
                          className="html-metadata-input"
                          value={slide.slideId}
                          onChange={e => handleMetadataChange(i, 'slideId', e.target.value)}
                          placeholder={`slide-${i + 1}`}
                          disabled={isExporting}
                        />
                      </td>
                      <td>
                        <input
                          className="html-metadata-input"
                          value={slide.name}
                          onChange={e => handleMetadataChange(i, 'name', e.target.value)}
                          placeholder={`Slide ${i + 1}`}
                          disabled={isExporting}
                        />
                      </td>
                      <td>
                        <select
                          className="html-metadata-select"
                          value={slide.type}
                          onChange={e => handleMetadataChange(i, 'type', e.target.value)}
                          disabled={isExporting}
                        >
                          {SLIDE_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="html-metadata-actions">
              <button className="btn btn-link" onClick={onBack}>
                <span aria-hidden="true">←</span> Back to preview
              </button>
              <div className="html-metadata-right-actions">
                <button
                  className="btn btn-secondary"
                  onClick={handleExport}
                  disabled={isExporting}
                  data-testid="btn-export-slides"
                >
                  {isExporting ? 'Exporting…' : `Export ${slideCount} Slide${slideCount !== 1 ? 's' : ''}`}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={onFinish}
                >
                  Finish
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: export history ─────────────────────────────────── */}
        <div className="html-metadata-right">
          <ExportHistoryPanel
            projectName={projectName}
            flowId={flowId}
            refreshTrigger={exportRefreshTrigger}
            setToast={setToast}
          />
        </div>

      </div>
    </div>
  )
}
