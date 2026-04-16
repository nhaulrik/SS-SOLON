/**
 * HtmlPreviewStep — Stage 3 of the HTML Visual Flow.
 *
 * Shows a live preview of the patched HTML output and provides
 * download + "start new project" actions.
 */

import { useCallback, useRef, useState, useMemo } from 'react'
import AppHeader   from '../components/AppHeader.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'
import ExportDialog from '../components/ExportDialog.jsx'
import ExportHistoryPanel from '../components/ExportHistoryPanel.jsx'
import { generateScaledPreviewHtml } from '../utils/slidePreview.js'

export default function HtmlPreviewStep({
  project,      // { chainId, projectName, zones }
  applied,      // { outputFile, previewHtml, roundId }
  step,
  canNavigateTo,
  navigateTo,
  onBack,       // () => void — back to recipe step
  onStartNew,   // () => void — back to flow selector
  onAssignMetadata, // () => void — navigate to metadata assignment step
  setToast,
  debugContext,
}) {
  const { chainId, projectName } = project
  const { outputFile, previewHtml, roundId, slideCount = 1 } = applied
  const isMultiSlide = slideCount > 1

  // ── Export state ──────────────────────────────────────────────────────────
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportRefreshTrigger, setExportRefreshTrigger] = useState(0)

  const handleExportDialogOpen = useCallback(() => setShowExportDialog(true), [])
  const handleExportDialogClose = useCallback(() => setShowExportDialog(false), [])
  const handleExported = useCallback(() => {
    setExportRefreshTrigger(n => n + 1)
  }, [])

  // ── Scale: identical to HtmlUploadStep ────────────────────────────────────
  // The wrapper uses padding-bottom:56.25% (aspect-ratio trick) so its height
  // is always derived from its width — stable across srcDoc changes, which
  // means the ResizeObserver never sees 0-height flicker during iframe reload.
  const [previewScale,  setPreviewScale]  = useState(1)
  const [startNewArmed, setStartNewArmed] = useState(false)
  const roRef = useRef(null)
  const wrapperCallbackRef = useCallback((el) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null }
    if (!el) return
    const measure = () => {
      const { width } = el.getBoundingClientRect()
      if (width > 0) setPreviewScale(width / 1280)
    }
    measure()
    roRef.current = new ResizeObserver(measure)
    roRef.current.observe(el)
  }, [])

  // ── Slide navigation (multi-slide only) ──────────────────────────────────
  const [currentSlide, setCurrentSlide] = useState(1)

  const goToSlide = useCallback((index) => {
    setCurrentSlide(Math.max(1, Math.min(index, slideCount)))
  }, [slideCount])

  const scaledPreviewHtml = useMemo(() => {
    // Use shared utility to generate scaled preview HTML.
    // CSS transforms are applied right-to-left: scale runs first, then translateY.
    // So translateY operates in post-scale (screen) space.
    // To shift slide N to the top of the viewport we need to move up by
    // (slideIndex - 1) * 720 * previewScale screen pixels.
    return generateScaledPreviewHtml(previewHtml, currentSlide - 1, previewScale)
  }, [previewHtml, previewScale, currentSlide])



  return (
    <div className="app">
      <AppHeader
        title={projectName}
        subtitle="Content applied — review and download"
        debugContext={debugContext}
      />
      <Breadcrumbs step={step} canNavigateTo={canNavigateTo} navigateTo={navigateTo} flow="html" />

      <div className="html-preview-step-layout">
        {/* ── Preview ─────────────────────────────────────────────── */}
         <div className="html-preview-step-frame-wrap" ref={wrapperCallbackRef}>
           <iframe
             className="html-preview-step-frame"
             srcDoc={scaledPreviewHtml}
             sandbox="allow-same-origin allow-scripts"
             title="Output preview"
           />
         </div>

        {/* ── Slide navigation (multi-slide only) ─────────────────── */}
        {isMultiSlide && (
          <div className="html-preview-step-nav" data-testid="preview-nav">
            <button
              className="btn btn-secondary html-preview-step-nav-btn"
              onClick={() => goToSlide(currentSlide - 1)}
              disabled={currentSlide <= 1}
              aria-label="Previous slide"
              data-testid="preview-nav-prev"
            >
              <span aria-hidden="true">←</span>
            </button>
            <span className="html-preview-step-nav-counter" data-testid="preview-nav-counter">
              {currentSlide} / {slideCount}
            </span>
            <button
              className="btn btn-secondary html-preview-step-nav-btn"
              onClick={() => goToSlide(currentSlide + 1)}
              disabled={currentSlide >= slideCount}
              aria-label="Next slide"
              data-testid="preview-nav-next"
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>
        )}

        {/* ── Actions ─────────────────────────────────────────────── */}
         <div className="html-preview-step-actions">
           <button className="btn btn-link" onClick={onBack}>
             <span aria-hidden="true">←</span> Back to recipe
           </button>
            <div className="html-preview-step-right-actions">
              <button
                className="btn btn-secondary"
                onClick={handleExportDialogOpen}
                data-testid="btn-export-slides"
                title="Export slides as individual HTML files"
              >
                Export to Slides
              </button>
              <button 
                className="btn btn-primary" 
                onClick={onAssignMetadata}
                data-testid="btn-assign-metadata"
              >
                Assign Metadata
              </button>
              <button
                className={`btn ${startNewArmed ? 'btn-danger' : 'btn-secondary'}`}
                aria-label={startNewArmed ? 'Click again to confirm starting a new project' : 'Start new project'}
                onClick={() => {
                  if (startNewArmed) { onStartNew() }
                  else { setStartNewArmed(true); setTimeout(() => setStartNewArmed(false), 3000) }
                }}
                onBlur={() => setStartNewArmed(false)}
              >
                {startNewArmed ? 'Confirm — clear session' : 'Start new project'}
              </button>
            </div>
          </div>

        {/* ── Export History ───────────────────────────────────────── */}
        <div className="html-preview-step-export-history">
          <ExportHistoryPanel
            chainId={chainId}
            refreshTrigger={exportRefreshTrigger}
            setToast={setToast}
          />
        </div>
       </div>

      {/* ── Export Dialog ────────────────────────────────────────────── */}
      {showExportDialog && (
        <ExportDialog
          chainId={chainId}
          roundId={roundId}
          outputFile={outputFile}
          slideCount={slideCount}
          onClose={handleExportDialogClose}
          onExported={handleExported}
          setToast={setToast}
        />
      )}
     </div>
   )
}
