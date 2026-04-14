/**
 * HtmlUploadStep — Stage 1 of the HTML Visual Flow.
 *
 * Architecture: zones are now derived from user *selections* on the structural
 * DOM tree (HtmlTreePanel). The flat ZoneRow list is replaced by the tree.
 *
 * State:
 *   templateId   — pending template session id (pre-project-creation)
 *   trees        — per-slide DOM tree arrays from the server
 *   selections   — user's zone assignments on the tree (controlled)
 *   previewHtml  — first-slide preview HTML for the iframe
 *   rawHtml      — full HTML string (for the editor)
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import AppHeader    from '../components/AppHeader.jsx'
import Breadcrumbs  from '../components/Breadcrumbs.jsx'
import HtmlTreePanel from '../components/HtmlTreePanel.jsx'
import { lazy, Suspense } from 'react'
const HtmlEditorPanel = lazy(() => import('../components/HtmlEditorPanel.jsx'))

export default function HtmlUploadStep({
  step, canNavigateTo, navigateTo,
  stepAnimClass, debugContext,
  initialSession, onSessionChange,
  onProjectCreated, onBack, setToast,
}) {
  const fileInputRef  = useRef(null)

  // ── Preview scale: measure wrapper width, inject scale into srcDoc ──────
  // Use a callback ref so the ResizeObserver attaches as soon as the wrapper
  // div mounts (which only happens after previewHtml is set).
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

  // ── Highlight: tree hover → preview iframe ────────────────────────────────
  const [highlightNodeId, setHighlightNodeId] = useState(null)

  // ── Stage A: file selection ───────────────────────────────────────────────
  const [fileName,  setFileName]  = useState(initialSession?.fileName  ?? '')
  const [uploading, setUploading] = useState(false)

  // ── Stage B: tree + selections ────────────────────────────────────────────
  const [templateId,       setTemplateId]       = useState(initialSession?.templateId       ?? null)
  const [slideCount,       setSlideCount]        = useState(initialSession?.slideCount       ?? 0)
  const [trees,            setTrees]             = useState(initialSession?.trees            ?? [])
  const [selections,       setSelections]        = useState(initialSession?.selections       ?? [])
  const [repeatableSlides, setRepeatableSlides]  = useState(initialSession?.repeatableSlides ?? [])
  const [previewHtml,      setPreviewHtml]       = useState(initialSession?.previewHtml      ?? '')
  const [violations,       setViolations]        = useState([])
  const [promptCopied,     setPromptCopied]      = useState(false)

  // ── Stage C: create project ───────────────────────────────────────────────
  const [creating,     setCreating]     = useState(false)
  const [projectName,  setProjectName]  = useState(initialSession?.projectName ?? '')

  // ── Editor (opt-in) ───────────────────────────────────────────────────────
  const [rawHtml,    setRawHtml]    = useState(initialSession?.rawHtml ?? '')
  const [editorOpen, setEditorOpen] = useState(false)

  // ── Sync session state up to App.jsx ─────────────────────────────────────
  const syncSession = useCallback((patch) => {
    onSessionChange?.(prev => ({ ...prev, ...patch }))
  }, [onSessionChange])

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      setToast({ message: 'Please upload an .html file', type: 'error' }); return
    }

    setFileName(file.name); setUploading(true); setViolations([])
    setTemplateId(null); setTrees([]); setSelections([]); setRepeatableSlides([]); setPreviewHtml('')

    try {
      const html = await file.text()
      const res  = await fetch('/api/html-flow/upload-template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, fileName: file.name })
      })
      const data = await res.json()

      if (!res.ok && data.violations?.some(v => v.rule === 'NO_SECTIONS')) {
        setViolations(data.violations)
        return
      }
      if (!res.ok) {
        setToast({ message: data.error || 'Upload failed', type: 'error' })
        return
      }

      // Non-fatal violations (NO_ZONES) — show warning but still load tree
      if (data.violations?.length) setViolations(data.violations)

      const derivedName = file.name.replace(/\.html?$/, '')
      setTemplateId(data.templateId)
      setSlideCount(data.slideCount)
      setTrees(data.trees ?? [])
      setSelections(data.selections ?? [])
      setPreviewHtml(data.previewHtml)
      setRawHtml(html)
      setProjectName(derivedName)

      syncSession({
        templateId:       data.templateId,
        fileName:         file.name,
        slideCount:       data.slideCount,
        trees:            data.trees ?? [],
        selections:       data.selections ?? [],
        repeatableSlides: [],
        previewHtml:      data.previewHtml,
        rawHtml:          html,
        projectName:      derivedName,
      })
    } catch (err) {
      setToast({ message: 'Upload error: ' + err.message, type: 'error' })
    } finally {
      setUploading(false)
    }
  }, [setToast, syncSession])

  const handleDrop        = useCallback((e) => { e.preventDefault(); handleFile(e.dataTransfer?.files?.[0]) }, [handleFile])
  const handleInputChange = useCallback((e) => { handleFile(e.target.files?.[0]) }, [handleFile])

  // ── Selections change (from tree panel) ──────────────────────────────────
  const handleSelectionsChange = useCallback((newSelections) => {
    setSelections(newSelections)
    syncSession({ selections: newSelections })
    // Best-effort persist to server session
    if (templateId) {
      fetch('/api/html-flow/update-selections', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, selections: newSelections })
      }).catch(() => {})
    }
  }, [templateId, syncSession])

  // ── Repeatable slides change ──────────────────────────────────────────────
  const handleRepeatableSlidesChange = useCallback((newRepSlides) => {
    setRepeatableSlides(newRepSlides)
    syncSession({ repeatableSlides: newRepSlides })
  }, [syncSession])

  // ── Clear all zones + repeatable slides ───────────────────────────────────
  const handleClearAll = useCallback(() => {
    setSelections([])
    setRepeatableSlides([])
    syncSession({ selections: [], repeatableSlides: [] })
    if (templateId) {
      fetch('/api/html-flow/update-selections', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, selections: [] })
      }).catch(() => {})
    }
  }, [templateId, syncSession])

  // ── Create project ────────────────────────────────────────────────────────
  const handleCreateProject = useCallback(async () => {
    if (!templateId) return
    setCreating(true)
    try {
      const res  = await fetch('/api/html-flow/create-project', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, selections, repeatableSlides, projectName })
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to create project')
      onProjectCreated({
        chainId:          data.chainId,
        projectName:      data.projectName,
        selections:       data.selections,
        zones:            data.zones,
        repeatableSlides: repeatableSlides,  // pass current client state
      })
    } catch (err) {
      setToast({ message: 'Create project failed: ' + err.message, type: 'error' })
    } finally {
      setCreating(false)
    }
  }, [templateId, selections, repeatableSlides, projectName, onProjectCreated, setToast])

  // ── Copy AI fix prompt ────────────────────────────────────────────────────
  const handleCopyPrompt = useCallback(() => {
    const issueList = violations.map(v => v.rule).join(', ')
    const prompt = `You are an expert HTML developer helping to prepare a slide template for use with an AI content generation tool.\n\nThe following validation issues were found:\n${issueList}\n\nPlease fix the HTML file so that:\n- Each slide is wrapped in a <section> element\n\nReturn only the corrected HTML.`
    navigator.clipboard.writeText(prompt).then(() => {
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    }).catch(() => {})
  }, [violations])

  // ── Editor apply ──────────────────────────────────────────────────────────
  // Called by HtmlEditorPanel with (newHtml, newSelections).
  // newSelections comes from re-parsing the edited HTML on the server.
  const handleEditorApply = useCallback((newHtml, newSelections) => {
    setRawHtml(newHtml)
    setPreviewHtml(newHtml)
    setEditorOpen(false)
    if (Array.isArray(newSelections) && newSelections.length > 0) {
      setSelections(newSelections)
      syncSession({ rawHtml: newHtml, previewHtml: newHtml, selections: newSelections })
    } else {
      syncSession({ rawHtml: newHtml, previewHtml: newHtml })
    }
  }, [syncSession])

  // ── Preview HTML with highlight injection ─────────────────────────────────
  // Inject a <style> that highlights the hovered tree node by data-solon-id,
  // and a <script> that posts back when the user hovers elements in the iframe.
  const highlightedPreviewHtml = useMemo(() => {
    if (!previewHtml) return ''
    const highlightCss = highlightNodeId ? `
[data-solon-id="${CSS.escape(highlightNodeId)}"] {
  outline: 3px solid #4CAF80 !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px rgba(76,175,128,0.4), 0 4px 12px rgba(115,170,135,0.4) !important;
  background: rgba(115,170,135,0.15) !important;
  position: relative !important;
  z-index: 9999 !important;
}` : ''

    // Bake the scale into the srcDoc as a <style> block.
    // previewScale = wrapperWidth / 1280 — computed by ResizeObserver.
    // This avoids any iframe scripts or sandbox permissions.
    const injection = `<style>
#solon-slide-shell { transform: scale(${previewScale}); }
[data-solon-id] { cursor: pointer; }
[data-solon-id]:hover { outline: 1px dashed rgba(76,175,128,0.5); }
${highlightCss}
</style>`

    return previewHtml.includes('</head>')
      ? previewHtml.replace('</head>', injection + '</head>')
      : injection + previewHtml
  }, [previewHtml, highlightNodeId, previewScale])

  // ── Can proceed ───────────────────────────────────────────────────────────
  const canProceed = templateId && selections.length > 0 && projectName.trim().length > 0

  // ── Editor overlay ────────────────────────────────────────────────────────
  if (editorOpen && rawHtml) {
    return (
      <Suspense fallback={<div className="html-editor-overlay" style={{display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Loading editor…</div>}>
        <HtmlEditorPanel
          uploadedHtml={rawHtml}
          onApply={handleEditorApply}
          onClose={() => setEditorOpen(false)}
        />
      </Suspense>
    )
  }

  return (
    <div className="app">
      <AppHeader title="Solon Slide Studio" subtitle="Visual Flow — Upload HTML Template" debugContext={debugContext} />

      <div className="html-upload-back">
        <button className="btn btn-link" onClick={onBack}>← Change flow</button>
        <Breadcrumbs step={step} canNavigateTo={canNavigateTo} navigateTo={navigateTo} flow="html" />
      </div>

      <div className={stepAnimClass}>
        <div className="html-upload-layout">

          {/* ── Left: upload zone / tree panel ─────────────────────────── */}
          <div className="html-upload-left">

            {/* Upload zone */}
            {!templateId ? (
              <div
                className={`upload-zone html-upload-zone${uploading ? ' upload-zone--loading' : ''}`}
                role="button"
                tabIndex={uploading ? -1 : 0}
                aria-label="Upload HTML template file"
                onClick={() => !uploading && fileInputRef.current?.click()}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && !uploading && fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
              >
                <input ref={fileInputRef} type="file" accept=".html,.htm" style={{ display: 'none' }} onChange={handleInputChange} />
                {uploading ? (
                  <><div className="upload-spinner" /><p>Parsing {fileName}…</p></>
                ) : (
                  <>
                    <div className="html-upload-icon">
                      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 40V8h22l10 10v22H8z" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4"/>
                        <path d="M30 8v10h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M16 24l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M20 20v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <p className="upload-zone-primary">Drop your HTML file here</p>
                    <p className="upload-zone-secondary">or click to browse — .html files only</p>
                  </>
                )}
              </div>
            ) : (
              <>
                {/* File loaded header */}
                <div className="html-file-loaded">
                  <div className="html-file-loaded-info">
                    <span className="html-file-icon">📄</span>
                    <div>
                      <p className="html-file-name">{fileName}</p>
                      <p className="html-file-meta">
                        {slideCount} slide{slideCount !== 1 ? 's' : ''} · {selections.length} zone{selections.length !== 1 ? 's' : ''} assigned
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditorOpen(true)}
                      title="Open HTML editor"
                    >
                      ✎ Edit HTML
                    </button>
                    <button className="btn btn-link" onClick={() => {
                      if (selections.length > 0 && !window.confirm('Replace file? Your current zone assignments will be lost.')) return
                      setTemplateId(null); setTrees([]); setSelections([]); setRepeatableSlides([])
                      setPreviewHtml(''); setRawHtml(''); setFileName(''); setViolations([])
                      syncSession({ templateId: null, trees: [], selections: [], repeatableSlides: [], previewHtml: '', rawHtml: '', fileName: '' })
                    }}>
                      Replace file
                    </button>
                  </div>
                </div>

                {/* Non-fatal violations (e.g. NO_ZONES warning) */}
                {violations.length > 0 && (
                  <div className="html-violations">
                    <div className="html-violations-header">
                      <div className="html-violations-title-row">
                        <span className="html-violations-icon">⚠</span>
                        <p className="html-violations-title">Template notice</p>
                      </div>
                      <p className="html-violations-subtitle">
                        No zones were detected in your HTML. Use the tree below to assign zones.
                      </p>
                    </div>
                    <ul className="html-violations-list">
                      {violations.map((v, i) => (
                        <li key={i} className="html-violation-item">
                          <span className="html-violation-bullet">·</span>
                          <div>
                            <span className="html-violation-rule">{v.rule}</span>
                            <span className="html-violation-message">{v.message}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* DOM Tree panel */}
                <HtmlTreePanel
                  trees={trees}
                  selections={selections}
                  onSelections={handleSelectionsChange}
                  onClearAll={handleClearAll}
                  repeatableSlides={repeatableSlides}
                  onRepeatableSlides={handleRepeatableSlidesChange}
                  slideCount={slideCount}
                  highlightNodeId={highlightNodeId}
                  onHighlight={setHighlightNodeId}
                />

                {/* Project footer */}
                <div className="html-project-footer">
                  <div className="form-group">
                    <label className="form-label">Project name</label>
                    <input
                      className="form-input"
                      type="text"
                      value={projectName}
                      onChange={e => { setProjectName(e.target.value); syncSession({ projectName: e.target.value }) }}
                      placeholder="my-presentation"
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={!canProceed || creating}
                    onClick={handleCreateProject}
                    data-testid="create-project-btn"
                  >
                    {creating ? 'Creating…' : 'Create Project →'}
                  </button>
                </div>
              </>
            )}

            {/* Fatal violations (NO_SECTIONS) */}
            {!templateId && violations.length > 0 && (
              <div className="html-violations">
                <div className="html-violations-header">
                  <div className="html-violations-title-row">
                    <span className="html-violations-icon">✕</span>
                    <p className="html-violations-title">Template issues found</p>
                  </div>
                  <p className="html-violations-subtitle">
                    Your HTML file needs adjustments before it can be used as a slide template.
                  </p>
                </div>
                <ul className="html-violations-list">
                  {violations.map((v, i) => (
                    <li key={i} className="html-violation-item">
                      <span className="html-violation-bullet">✕</span>
                      <div>
                        <span className="html-violation-rule">{v.rule}</span>
                        <span className="html-violation-message">{v.message}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="html-violations-prompt-section">
                  <div className="html-violations-prompt-header">
                    <div>
                      <p className="html-violations-prompt-title">Fix with AI</p>
                      <p className="html-violations-prompt-desc">
                        Copy this prompt and send it to your AI assistant along with your HTML file.
                      </p>
                    </div>
                    <button
                      className={`btn html-violations-copy-btn${promptCopied ? ' html-violations-copy-btn--copied' : ''}`}
                      onClick={handleCopyPrompt}
                    >
                      {promptCopied ? '✓ Copied' : 'Copy prompt'}
                    </button>
                  </div>
                  <div className="html-violations-prompt-preview">
                    <code>
                      You are an expert HTML developer…
                      <br />
                      <span className="html-violations-prompt-issues">
                        Issues: {violations.map(v => v.rule).join(' · ')}
                      </span>
                    </code>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: slide preview ──────────────────────────────────── */}
          {previewHtml && (
            <div className="html-preview-panel">
              <div className="html-preview-label">
                Slide 1 preview
                {highlightNodeId && (
                  <span className="html-preview-highlight-label">
                    · <code>{highlightNodeId.split('>').pop()}</code>
                  </span>
                )}
              </div>
              <div className="html-preview-frame-wrapper" ref={wrapperCallbackRef}>
                <iframe
                  className="html-preview-frame"
                  srcDoc={highlightedPreviewHtml}
                  sandbox="allow-same-origin"
                  title="Slide preview"
                />
              </div>
              <p className="html-preview-note">
                Hover a tree node to highlight it here.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
