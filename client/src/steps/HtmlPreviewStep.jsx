/**
 * HtmlPreviewStep — Stage 3 of the HTML Visual Flow.
 *
 * Shows a live preview of the patched HTML output and provides
 * download + "start new project" actions.
 */

import { useCallback, useRef, useState } from 'react'
import AppHeader   from '../components/AppHeader.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'

export default function HtmlPreviewStep({
  projectName,
  applied,      // { outputFile, previewHtml, roundId, slideCount }
  step,
  canNavigateTo,
  navigateTo,
  onBack,
  onNext,
  setToast,
  debugContext,
}) {
  const { previewHtml, slideCount = 1 } = applied
  const isMultiSlide = slideCount > 1

  // ── Scale: identical to HtmlUploadStep ────────────────────────────────────
  const [previewScale,  setPreviewScale]  = useState(1)
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
          {(() => {
            const slideOffset = (currentSlide - 1) * 720
            const wrapperStyle = {
              width: '100%',
              paddingBottom: `${(720 / 1280) * 100}%`,
              position: 'relative',
              overflow: 'hidden',
            }
            const iframeStyle = {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '1280px',
              height: `${720 * slideCount}px`,
              border: 'none',
              transform: `translateY(-${slideOffset}px) scale(${previewScale})`,
              transformOrigin: 'top left',
            }
            return (
              <div style={wrapperStyle} ref={wrapperCallbackRef}>
                <iframe
                   className="html-preview-step-frame"
                   srcDoc={previewHtml}
                   title="Output preview"
                   sandbox="allow-same-origin"
                   style={iframeStyle}
                 />
              </div>
            )
          })()}

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
           <button className="btn btn-primary" onClick={onNext}>
             <span aria-hidden="true">→</span> Next
           </button>
          </div>
       </div>
     </div>
   )
}
