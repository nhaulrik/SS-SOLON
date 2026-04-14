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
  const { outputFile, previewHtml } = applied

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

  const scaledPreviewHtml = useMemo(() => {
    if (!previewHtml) return ''
    const injection = `<style>
#solon-slide-shell { transform: scale(${previewScale}); }
</style>`
    return previewHtml.includes('</head>')
      ? previewHtml.replace('</head>', injection + '</head>')
      : injection + previewHtml
  }, [previewHtml, previewScale])

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
