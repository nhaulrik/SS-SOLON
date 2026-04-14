/**
 * HtmlPreviewStep — Stage 3 of the HTML Visual Flow.
 *
 * Shows a live preview of the patched HTML output and provides
 * download + "start new project" actions.
 */

import { useCallback, useRef, useState, useMemo } from 'react'
import AppHeader   from '../components/AppHeader.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'

export default function HtmlPreviewStep({
  project,      // { chainId, projectName, zones }
  applied,      // { outputFile, previewHtml, roundId }
  step,
  canNavigateTo,
  navigateTo,
  onBack,       // () => void — back to recipe step
  onStartNew,   // () => void — back to flow selector
  setToast,
  debugContext,
}) {
  const { chainId, projectName } = project
  const { outputFile, previewHtml, slideCount = 1 } = applied
  const isMultiSlide = slideCount > 1

  // ── Scale: identical to HtmlUploadStep ────────────────────────────────────
  // The wrapper uses padding-bottom:56.25% (aspect-ratio trick) so its height
  // is always derived from its width — stable across srcDoc changes, which
  // means the ResizeObserver never sees 0-height flicker during iframe reload.
  const [previewScale, setPreviewScale] = useState(1)
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
    if (!previewHtml) return ''
    // CSS transforms are applied right-to-left: scale runs first, then translateY.
    // So translateY operates in post-scale (screen) space.
    // To shift slide N to the top of the viewport we need to move up by
    // (slideIndex - 1) * 720 * previewScale screen pixels.
    const offsetY   = (currentSlide - 1) * 720 * previewScale
    const injection = `<style>
#solon-slide-shell { transform: translateY(-${offsetY}px) scale(${previewScale}); overflow: hidden; }
</style>`
    return previewHtml.includes('</head>')
      ? previewHtml.replace('</head>', injection + '</head>')
      : injection + previewHtml
  }, [previewHtml, previewScale, currentSlide])

  const handleDownload = useCallback(() => {
    const url = `/api/html-flow/download/${chainId}/${outputFile}`
    const a   = document.createElement('a')
    a.href     = url
    a.download = outputFile
    a.click()
  }, [chainId, outputFile])

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
            sandbox="allow-same-origin"
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
              ←
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
              →
            </button>
          </div>
        )}

        {/* ── Actions ─────────────────────────────────────────────── */}
        <div className="html-preview-step-actions">
          <button className="btn btn-link" onClick={onBack}>
            ← Back to recipe
          </button>
          <div className="html-preview-step-right-actions">
            <button className="btn btn-secondary" onClick={handleDownload}>
              Download HTML
            </button>
            <button className="btn btn-primary" onClick={() => {
              if (window.confirm('Start a new project? This will clear the current session.')) onStartNew()
            }}>
              Start new project
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
