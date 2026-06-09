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
import HtmlTreePanel, { sanitizeKey } from '../components/HtmlTreePanel.jsx'

export default function HtmlUploadStep({
  step, canNavigateTo, navigateTo,
  stepAnimClass, debugContext,
  appName = 'Slide Studio',
  initialSession, onSessionChange,
  onProjectCreated, onBack, setToast,
  currentProjectName, currentFlowId, pendingFlowName,
}) {
  const fileInputRef  = useRef(null)

  // ── Preview: controlled container size + derived scale ───────────────────
  const [containerSize, setContainerSize] = useState(null) // { width, height }
  const [previewScale,  setPreviewScale]  = useState(1)
  const slideDimsRef    = useRef({ width: 1280, height: 720 })
  const containerSizeRef = useRef(null) // stable ref for drag handler
  const panelRef        = useRef(null)  // measures initial available width

  // ── Highlight: tree hover → preview iframe ────────────────────────────────
  const [highlightNodeId, setHighlightNodeId] = useState(null)

  // ── Key selection mode ─────────────────────────────────────────────────────
  // ── Stage A: file selection ───────────────────────────────────────────────
  const [fileName,  setFileName]  = useState(initialSession?.fileName  ?? '')
  const [uploading, setUploading] = useState(false)

  // ── Stage B: tree + selections ────────────────────────────────────────────
  const [templateId,          setTemplateId]          = useState(initialSession?.templateId          ?? null)
  const [slideCount,          setSlideCount]           = useState(initialSession?.slideCount          ?? 0)
  const [trees,               setTrees]                = useState(initialSession?.trees               ?? [])
  const [selections,          setSelections]          = useState(initialSession?.selections          ?? [])
  const [repeatableSlides,    setRepeatableSlides]    = useState(initialSession?.repeatableSlides    ?? [])
  const [fullSlideGeneration, setFullSlideGeneration] = useState(initialSession?.fullSlideGeneration ?? [])
  const [previewHtml,         setPreviewHtml]         = useState(initialSession?.previewHtml         ?? '')
  const [violations,          setViolations]          = useState([])
  const [promptCopied,        setPromptCopied]        = useState(false)

  // ── Stage C: proceed ─────────────────────────────────────────────────────
  const [creating,     setCreating]     = useState(false)
  const [isExistingFlow, setIsExistingFlow] = useState(false)
  const [loadingFlow,    setLoadingFlow]    = useState(false)

   const [rawHtml,    setRawHtml]    = useState(initialSession?.rawHtml ?? '')

  // Parse slide dims and initialise container size whenever a new file is loaded.
  useEffect(() => {
    if (!previewHtml) return
    let sw = 1280, sh = 720
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(previewHtml, 'text/html')
      const shell = doc.getElementById('solon-slide-shell')
      if (shell) {
        sw = parseInt(shell.style.width,  10) || 1280
        sh = parseInt(shell.style.height, 10) || 720
      }
    } catch {}
    slideDimsRef.current = { width: sw, height: sh }

    // Fit initial container to the panel's available width.
    const panelW = panelRef.current?.getBoundingClientRect().width ?? sw
    const initScale = panelW / sw
    const newSize = { width: Math.round(panelW), height: Math.round(sh * initScale) }
    containerSizeRef.current = newSize
    setContainerSize(newSize)
  }, [previewHtml])

  // Derive scale from container size using both dimensions.
  useEffect(() => {
    if (!containerSize) return
    const { width: sw, height: sh } = slideDimsRef.current
    const scale = Math.min(containerSize.width / sw, containerSize.height / sh)
    setPreviewScale(Math.max(0.05, scale))
  }, [containerSize])

  // After iframe loads, measure actual shell height and resize container to fit.
  const handlePreviewLoad = useCallback((e) => {
    try {
      const shell = e.target.contentDocument?.getElementById('solon-slide-shell')
      if (!shell) return
      const naturalH = shell.scrollHeight
      if (naturalH <= 0) return
      slideDimsRef.current = { ...slideDimsRef.current, height: naturalH }
      // Resize container so the full content fits at the current scale.
      const scale = containerSize ? containerSize.width / slideDimsRef.current.width : 1
      const newSize = {
        width:  containerSizeRef.current?.width ?? slideDimsRef.current.width,
        height: Math.round(naturalH * scale),
      }
      containerSizeRef.current = newSize
      setContainerSize(newSize)
    } catch {}
  }, [containerSize])

  // Drag-to-resize handler — reads start values from ref to avoid stale closures.
  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault()
    const startX  = e.clientX
    const startY  = e.clientY
    const startW  = containerSizeRef.current?.width  ?? 400
    const startH  = containerSizeRef.current?.height ?? 300

    const onMove = (mv) => {
      const newSize = {
        width:  Math.max(160, startW + mv.clientX - startX),
        height: Math.max(90,  startH + mv.clientY - startY),
      }
      containerSizeRef.current = newSize
      setContainerSize(newSize)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [])

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
    setTemplateId(null); setTrees([]); setSelections([]); setRepeatableSlides([]); setFullSlideGeneration([]); setPreviewHtml('')

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
       setFullSlideGeneration(Array.from({ length: data.slideCount }, (_, i) => i))
       setRawHtml(html)
       syncSession({
         templateId:          data.templateId,
         fileName:            file.name,
         slideCount:          data.slideCount,
         trees:               data.trees ?? [],
         selections:          data.selections ?? [],
         repeatableSlides:    [],
         fullSlideGeneration: Array.from({ length: data.slideCount }, (_, i) => i),
         previewHtml:         data.previewHtml,
         rawHtml:             html,
       })
    } catch (err) {
      setToast({ message: 'Upload error: ' + err.message, type: 'error' })
    } finally {
      setUploading(false)
    }
  }, [setToast, syncSession])

   const handleDrop        = useCallback((e) => { e.preventDefault(); handleFile(e.dataTransfer?.files?.[0]) }, [handleFile])
   const handleInputChange = useCallback((e) => { handleFile(e.target.files?.[0]) }, [handleFile])

   // ── Load existing flow if opening from dashboard ──────────────────────────
   useEffect(() => {
     if (currentProjectName && currentFlowId) {
        const loadExistingFlow = async () => {
          setLoadingFlow(true)
          try {
            const res = await fetch(`/api/html-flow/load-flow?projectName=${encodeURIComponent(currentProjectName)}&flowId=${encodeURIComponent(currentFlowId)}`)
             if (res.ok) {
               const data = await res.json()
               setFileName(data.fileName)
              setSlideCount(data.slideCount)
              setTrees(data.trees || [])
              setSelections(data.selections || [])
              setRepeatableSlides(data.repeatableSlides || [])
              setFullSlideGeneration(data.fullSlideGeneration || [])
               setPreviewHtml(data.previewHtml)
               setIsExistingFlow(true)
               if (data.violations?.length) {
                 setViolations(data.violations)
               }
           } else {
             const errorData = await res.json()
             setToast({ message: 'Failed to load flow: ' + (errorData.error || 'Unknown error'), type: 'error' })
           }
         } catch (err) {
           setToast({ message: 'Error loading flow: ' + err.message, type: 'error' })
         } finally {
           setLoadingFlow(false)
         }
       }
       loadExistingFlow()
     }
   }, [currentProjectName, currentFlowId, setToast])

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

  // ── Full slide generation change ───────────────────────────────────────────
  const handleFullSlideGenerationChange = useCallback((newFullSlideGen) => {
    setFullSlideGeneration(newFullSlideGen)
    syncSession({ fullSlideGeneration: newFullSlideGen })
  }, [syncSession])

  // ── Clear all zones + repeatable slides ───────────────────────────────────
  const handleClearAll = useCallback(() => {
    setSelections([])
    setRepeatableSlides([])
    setFullSlideGeneration([])
    syncSession({ selections: [], repeatableSlides: [], fullSlideGeneration: [] })
    if (templateId) {
      fetch('/api/html-flow/update-selections', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, selections: [] })
      }).catch(() => {})
    }
    if (isExistingFlow && currentProjectName && currentFlowId) {
      fetch(`/api/projects/${encodeURIComponent(currentProjectName)}/flows/${encodeURIComponent(currentFlowId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: [], repeatableSlides: [], fullSlideGeneration: [] })
      }).catch(() => {})
    }
  }, [templateId, syncSession, isExistingFlow, currentProjectName, currentFlowId])

   // ── Proceed to recipe ─────────────────────────────────────────────────────
   const handleProceed = useCallback(async () => {
     setCreating(true)
     try {
       if (isExistingFlow && currentProjectName && currentFlowId) {
         // Persist UI edits (selections with custom prompts, repeatableSlides, fullSlideGeneration) back to server.
         await fetch(`/api/projects/${encodeURIComponent(currentProjectName)}/flows/${encodeURIComponent(currentFlowId)}`, {
           method: 'PATCH',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ repeatableSlides, selections, fullSlideGeneration }),
         })

         // Load current zones from server (zone assignments live in flow.json)
         const res = await fetch(`/api/projects/${encodeURIComponent(currentProjectName)}/flows/${encodeURIComponent(currentFlowId)}`)
         if (!res.ok) throw new Error('Failed to load flow')
         const data = await res.json()
         const meta = data.flow?._metadata || {}
          onProjectCreated({
            projectName:         currentProjectName,
            flowId:              currentFlowId,
            selections:          meta.selections          || selections,
            zones:               meta.zones               || [],
            repeatableSlides,
            fullSlideGeneration: meta.fullSlideGeneration || fullSlideGeneration,
            agenticCustomInput:  data.flow?.agenticCustomInput  || '',
            agenticJsonResponse: data.flow?.agenticJsonResponse || null,
          })
       } else {
         // New flow — create it inside the current project
         if (!templateId || !currentProjectName) return
         const res = await fetch('/api/html-flow/create-project', {
           method: 'POST', headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             templateId,
             selections,
             repeatableSlides,
             fullSlideGeneration,
             existingProjectName: currentProjectName,
             flowName: pendingFlowName || undefined,
           })
         })
         const data = await res.json()
         if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to create flow')
         onProjectCreated({
           projectName:         data.projectName,
           flowId:              data.flowId,
           selections:          data.selections,
           zones:               data.zones,
           repeatableSlides,
           fullSlideGeneration,
         })
       }
     } catch (err) {
       setToast({ message: err.message, type: 'error' })
     } finally {
       setCreating(false)
     }
   }, [isExistingFlow, currentProjectName, currentFlowId, templateId, selections, repeatableSlides, fullSlideGeneration, pendingFlowName, onProjectCreated, setToast])

   // ── Copy AI fix prompt ────────────────────────────────────────────────────
   const handleCopyPrompt = useCallback(() => {
     const issueList = violations.map(v => v.rule).join(', ')
     const prompt = `You are an expert HTML developer helping to prepare a slide template for use with an AI content generation tool.\n\nThe following validation issues were found:\n${issueList}\n\nPlease fix the HTML file so that:\n- Each slide is wrapped in a <section> element\n\nReturn only the corrected HTML.`
     navigator.clipboard.writeText(prompt).then(() => {
       setPromptCopied(true)
       setTimeout(() => setPromptCopied(false), 2000)
     }).catch(() => {})
   }, [violations])

   // ── Preview HTML with highlight injection ─────────────────────────────────
  // Scale is applied to the iframe element itself — do NOT inject scale CSS here.
  // Only inject the highlight style and a minimal body reset.
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

    const injection = `<style>
html, body { margin: 0; padding: 0; overflow: hidden; }
[data-solon-id] { cursor: pointer; }
[data-solon-id]:hover { outline: 1px dashed rgba(76,175,128,0.5); }
${highlightCss}
</style>`

    return previewHtml.includes('</head>')
      ? previewHtml.replace('</head>', injection + '</head>')
      : injection + previewHtml
  }, [previewHtml, highlightNodeId])

  // ── Can proceed ───────────────────────────────────────────────────────────
  // Allow proceeding if:
  // 1. User has made zone selections, OR
  // 2. User has marked at least one slide for "Generate Full Slide"
  // AND either:
  // - Creating new project with a name, OR
  // - Using existing project with one selected
  const hasSelectionsOrFullSlide = selections.length > 0 || fullSlideGeneration.length > 0
  const canProceed = isExistingFlow
    ? hasSelectionsOrFullSlide
    : (templateId && hasSelectionsOrFullSlide)

  return (
    <div className="app">
      <AppHeader
        title={
          (templateId || isExistingFlow) && (pendingFlowName || currentFlowId)
            ? (pendingFlowName || currentFlowId)
            : appName
        }
        subtitle={
          (templateId || isExistingFlow) && fileName
            ? fileName
            : 'Visual Flow — Upload HTML Template'
        }
        debugContext={debugContext}
      />

      <div className="html-upload-back">
        <button className="btn btn-link" onClick={onBack}><span aria-hidden="true">←</span> Change flow</button>
        <Breadcrumbs step={step} canNavigateTo={canNavigateTo} navigateTo={navigateTo} flow="html" />
      </div>

      <div className={stepAnimClass}>
        <div className="html-upload-layout">

          {/* ── Left: upload zone / tree panel ─────────────────────────── */}
          <div className="html-upload-left">

            {/* Upload zone */}
            {!(templateId || isExistingFlow) ? (
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

                </div>

                 {/* DOM Tree panel */}
                 <HtmlTreePanel
                   trees={trees}
                   selections={selections}
                   onSelections={handleSelectionsChange}
                   onClearAll={handleClearAll}
                   repeatableSlides={repeatableSlides}
                   onRepeatableSlides={handleRepeatableSlidesChange}
                   fullSlideGeneration={fullSlideGeneration}
                   onFullSlideGeneration={handleFullSlideGenerationChange}
                   slideCount={slideCount}
                   highlightNodeId={highlightNodeId}
                   onHighlight={setHighlightNodeId}
                 />

                {/* Proceed footer */}
                <div className="html-project-footer">
                  <button
                    className="btn btn-primary"
                    disabled={!canProceed || creating || loadingFlow}
                    onClick={handleProceed}
                    data-testid="create-project-btn"
                  >
                    {loadingFlow ? 'Loading…' : creating ? 'Working…' : <><span aria-hidden="true">→</span> Next</>}
                  </button>
                </div>
              </>
            )}

            {/* Fatal violations (NO_SECTIONS) — only shown when no template is loaded at all */}
            {!templateId && !isExistingFlow && violations.length > 0 && (
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
            <div className="html-preview-panel" ref={panelRef}>
              <div className="html-preview-label">
                Slide 1 preview
                {highlightNodeId && (
                  <span className="html-preview-highlight-label">
                    · <code>{highlightNodeId.split('>').pop()}</code>
                  </span>
                )}
              </div>

              <div
                className="html-preview-frame-wrapper"
                style={containerSize
                  ? { width: containerSize.width, height: containerSize.height }
                  : { width: '100%', minHeight: 120 }
                }
              >
                {/* Slide at native size, centered and scaled to fit the container */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width:  `${slideDimsRef.current.width}px`,
                  height: `${slideDimsRef.current.height}px`,
                  transform: `translate(-50%, -50%) scale(${previewScale})`,
                  transformOrigin: 'center center',
                }}>
                  <iframe
                    className="html-preview-frame"
                    srcDoc={highlightedPreviewHtml}
                    sandbox="allow-same-origin allow-scripts"
                    title="Slide preview"
                    onLoad={handlePreviewLoad}
                  />
                </div>

                {/* Drag handle — bottom-right corner */}
                <div
                  className="html-preview-resize-handle"
                  onMouseDown={handleResizeMouseDown}
                  title="Drag to resize"
                />
              </div>

              <p className="html-preview-note">
                Drag the corner handle to resize · Hover a tree node to highlight it
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
