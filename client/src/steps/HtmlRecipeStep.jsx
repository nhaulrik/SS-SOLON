/**
 * HtmlRecipeStep — Stage 2 of the HTML Visual Flow.
 *
 * Two-tab layout:
 * - Manual Generation: existing two-column layout (recipe + JSON response)
 * - Agentic Generation: single-column layout with context files, prompt, inline agentic UI
 *
 * Both tabs share the same Apply action and auto-navigate to preview on success.
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import AppHeader     from '../components/AppHeader.jsx'
import Breadcrumbs   from '../components/Breadcrumbs.jsx'
import agenticCss    from '../components/AgenticPanel.module.css'
import ContentReviewTable from '../components/ContentReviewTable'

export default function HtmlRecipeStep({
  project,          // { projectName, flowId, zones, selections }
  projectName,
  flowId,
  step,
  canNavigateTo,
  navigateTo,
  onBack,
  onApplied,        // ({ outputFile, previewHtml, roundId, slideCount }) => void
  onRecipeChange,
  onRecipeStateChange,
  onAiResponseChange,
  recipeState = { recipe: '', globalPrompt: '', jsonInput: '' },
  setToast,
  debugContext,
  // Agentic state props
  agenticStatus,
  agenticPhase,
  agenticLogs,
  agenticAgents,
  agenticErrorMsg,
  agenticElapsed,
  agenticSummaryMode,
  agenticSummaryPrompt,
  agenticContentPrompt,
  agenticPlan,
  // Agentic setter props
  setAgenticStatus,
  setAgenticPhase,
  setAgenticLogs,
  setAgenticAgents,
  setAgenticErrorMsg,
  setAgenticElapsed,
  setAgenticSummaryMode,
  setAgenticSummaryPrompt,
  setAgenticContentPrompt,
  setAgenticPlan,
}) {
  const { selections = [], zones = [], repeatableSlides = [] } = project

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('manual')

  // ── Recipe ────────────────────────────────────────────────────────────────
  const [recipe,        setRecipe]        = useState(recipeState.recipe)
  const [globalPrompt,  setGlobalPrompt]  = useState(recipeState.globalPrompt)
  const [loadingRecipe, setLoadingRecipe] = useState(false)

  // ── JSON response ─────────────────────────────────────────────────────────
  const [jsonInput,  setJsonInput]  = useState(recipeState.jsonInput)
  const [validation, setValidation] = useState(null)
  const [applying,   setApplying]   = useState(false)

  // ── Apply success flash ───────────────────────────────────────────────────
  const [applySuccess, setApplySuccess] = useState(false)

  // ── Expand/collapse state for collapsible panels ───────────────────────────
  const [recipeExpanded, setRecipeExpanded] = useState(false)
  const [jsonExpanded,   setJsonExpanded]   = useState(false)

  // ── Agentic tab state ─────────────────────────────────────────────────────
  const [contextFiles, setContextFiles] = useState([])
  const [selectedFiles, setSelectedFiles] = useState([])
  const [loadingContextFiles, setLoadingContextFiles] = useState(false)

  // Agentic phase state (absorbed from AgenticPanel)
  const [agenticPhaseLocal, setAgenticPhaseLocal] = useState('')
  const [agenticLogsLocal, setAgenticLogsLocal] = useState([])
  const [agenticAgentsLocal, setAgenticAgentsLocal] = useState([])
  const [agenticElapsedLocal, setAgenticElapsedLocal] = useState(0)
  const [agenticPlanLocal, setAgenticPlanLocal] = useState(null)
  const [agenticErrorMsgLocal, setAgenticErrorMsgLocal] = useState('')

   // Agentic custom input & previous response toggle
   const [agenticCustomInput, setAgenticCustomInput] = useState(project?.agenticCustomInput || '')
   const [usePreviousResponse, setUsePreviousResponse] = useState(false)

   // Slice output template
   const [sliceTemplates, setSliceTemplates] = useState([])
   const [sliceOutputTemplate, setSliceOutputTemplate] = useState(project?.sliceOutputTemplate || null)

  // Ref for debouncing custom input save
  const customInputSaveTimerRef = useRef(null)

  // Reset scroll position on component mount to ensure user starts at top of page
  // This fixes autoscroll issues when navigating between recipe steps
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Fetch context files from backend
  const fetchContextFiles = useCallback(async () => {
    setLoadingContextFiles(true)
    try {
      const res = await fetch(`/api/html-flow/context-files?projectName=${encodeURIComponent(projectName)}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      // Backend returns files with 'name' property, normalize to 'filename'
      const normalizedFiles = (data.files || []).map(f => ({
        filename: f.name,
        ext: f.ext,
        hasSummary: f.hasSummary,
      }))
      setContextFiles(normalizedFiles)
      // Initialize selected files from flow if available
      if (project.selectedContextFiles) {
        setSelectedFiles(project.selectedContextFiles)
      }
    } catch (err) {
      setToast({ message: 'Failed to load context files: ' + err.message, type: 'error' })
    } finally {
      setLoadingContextFiles(false)
    }
   }, [projectName, project.selectedContextFiles, setToast])

   // Load context files and slice templates when Agentic tab is shown
   useEffect(() => {
     if (activeTab === 'agentic') {
       if (contextFiles.length === 0) {
         fetchContextFiles()
       }
       if (sliceTemplates.length === 0) {
         fetch('/api/opencode/slice-templates')
           .then(r => r.json())
           .then(data => setSliceTemplates(Array.isArray(data) ? data : []))
           .catch(() => {})
       }
     }
   }, [activeTab, fetchContextFiles])

   // Save selected files to flow
   const saveSelectedFilesToFlow = useCallback(async (files) => {
     try {
       await fetch(`/api/projects/${projectName}/flows/${flowId}`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ selectedContextFiles: files }),
       })
     } catch {
       // silent — context files selection is non-critical
     }
   }, [projectName, flowId])

   const saveSliceOutputTemplateToFlow = useCallback(async (filename) => {
     if (!projectName || !flowId) return
     try {
       await fetch(`/api/projects/${projectName}/flows/${flowId}`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ sliceOutputTemplate: filename }),
       })
     } catch { /* non-critical */ }
   }, [projectName, flowId])

   const savePromptsToFlow = useCallback(async (summaryPrompt, contentPrompt) => {
      if (!projectName || !flowId) return
      try {
        await fetch(`/api/projects/${projectName}/flows/${flowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summaryPrompt, contentPrompt }),
        })
      } catch {
        // silent — prompt persistence is non-critical
      }
    }, [projectName, flowId])

    const saveAgenticCustomInputToFlow = useCallback(async (value) => {
      if (!projectName || !flowId) return
      try {
        await fetch(`/api/projects/${projectName}/flows/${flowId}/agentic`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agenticCustomInput: value }),
        })
      } catch {
        // silent — custom input persistence is non-critical
      }
    }, [projectName, flowId])

    const saveAgenticJsonResponseToFlow = useCallback(async (jsonResponse) => {
      if (!projectName || !flowId) return
      try {
        await fetch(`/api/projects/${projectName}/flows/${flowId}/agentic`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agenticJsonResponse: jsonResponse }),
        })
      } catch {
        // silent — JSON response persistence is non-critical
      }
    }, [projectName, flowId])

   // Initialise agentic prompts from persisted flow data (runs once on mount)
  useEffect(() => {
    if (project.summaryPrompt && !agenticSummaryPrompt) {
      setAgenticSummaryPrompt(project.summaryPrompt)
    }
    if (project.contentPrompt && !agenticContentPrompt) {
      setAgenticContentPrompt(project.contentPrompt)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

   const validateTimerRef = useRef(null)
   const promptSaveTimerRef = useRef(null)

   // Handle custom input change with debouncing
   const handleAgenticCustomInputChange = useCallback((value) => {
     setAgenticCustomInput(value)
     clearTimeout(customInputSaveTimerRef.current)
     customInputSaveTimerRef.current = setTimeout(() => {
       saveAgenticCustomInputToFlow(value)
     }, 500)
   }, [saveAgenticCustomInputToFlow])

     // ── Generate recipe ───────────────────────────────────────────────────────
  const handleGenerateRecipe = useCallback(async () => {
    setLoadingRecipe(true)
    try {
      const res = await fetch('/api/html-flow/generate-recipe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectName, flowId, globalPrompt, repeatableSlides }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed to generate recipe')
      setRecipe(data.recipe)
      onRecipeChange?.(data.recipe)
      onRecipeStateChange?.({ recipe: data.recipe, recipeGenerationId: data.generationId })
    } catch (err) {
      setToast({ message: 'Recipe generation failed: ' + err.message, type: 'error' })
    } finally {
      setLoadingRecipe(false)
    }
  }, [projectName, flowId, globalPrompt, repeatableSlides, setToast, onRecipeStateChange, onRecipeChange])

  // ── Validate JSON (debounced) ─────────────────────────────────────────────
  const validateJson = useCallback(async (value) => {
    if (!value.trim()) {
      setValidation(null)
      onAiResponseChange?.(null)
      return
    }
    try {
      const res = await fetch('/api/html-flow/validate-json', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectName, flowId, jsonString: value }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setValidation(data)
      onAiResponseChange?.({ raw: value, validated: true, validationResult: data })
    } catch (err) {
      const errorData = { valid: false, error: 'Validation failed: ' + err.message }
      setValidation(errorData)
      onAiResponseChange?.({ raw: value, validated: true, validationResult: errorData })
    }
  }, [projectName, flowId, onAiResponseChange])

  const handleJsonChange = useCallback((value) => {
    setJsonInput(value)
    onRecipeStateChange?.({ jsonInput: value })
    clearTimeout(validateTimerRef.current)
    validateTimerRef.current = setTimeout(() => validateJson(value), 400)
  }, [validateJson, onRecipeStateChange])

  // ── Apply content ─────────────────────────────────────────────────────────
  const handleApply = useCallback(async () => {
    if (!validation?.valid || applying) return
    setApplying(true)
    try {
      const res = await fetch('/api/html-flow/apply-content', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          projectName,
          flowId,
          jsonString: jsonInput,
          instanceNames: agenticPlanLocal?.instanceNames,
        }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Apply failed')

      setApplySuccess(true)
      onApplied({ outputFile: data.outputFile, previewHtml: data.previewHtml, roundId: data.roundId, slideCount: data.slideCount ?? 1, slideNames: data.slideNames ?? [] })
    } catch (err) {
      setToast({ message: 'Apply failed: ' + err.message, type: 'error' })
    } finally {
      setApplying(false)
    }
  }, [projectName, flowId, jsonInput, validation, applying, onApplied, setToast, agenticPlanLocal])

  // ── Copy helpers ──────────────────────────────────────────────────────────
  const handleCopyRecipe = useCallback(() => {
    navigator.clipboard.writeText(recipe)
    setToast({ message: 'Recipe copied!', type: 'success' })
  }, [recipe, setToast])

   const handleCopyJson = useCallback(() => {
     navigator.clipboard.writeText(jsonInput)
     setToast({ message: 'JSON copied!', type: 'success' })
   }, [jsonInput, setToast])


  const totalCount = (selections.length || zones.length)
  const hasRecipe = Boolean(recipe?.trim())
  const isAgenticActive = agenticStatus === 'planning' || agenticStatus === 'running'

  // Helper to get file extension badge color
  const getExtBadgeClass = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'md') return 'ext-badge ext-badge-md'
    if (ext === 'docx') return 'ext-badge ext-badge-docx'
    if (ext === 'xlsx') return 'ext-badge ext-badge-xlsx'
    return 'ext-badge ext-badge-other'
  }

  // Helper to toggle file selection
  const handleToggleFile = (filename) => {
    const updated = selectedFiles.includes(filename)
      ? selectedFiles.filter(f => f !== filename)
      : [...selectedFiles, filename]
    setSelectedFiles(updated)
    saveSelectedFilesToFlow(updated)
  }

  // Helper to select/deselect all
  const handleSelectAllFiles = () => {
    const allSelected = selectedFiles.length === contextFiles.length
    const updated = allSelected ? [] : contextFiles.map(f => f.filename)
    setSelectedFiles(updated)
    saveSelectedFilesToFlow(updated)
  }

  // SSE reader for agentic generation
  async function* readSSE(response) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const blocks = buffer.split('\n\n')
      buffer = blocks.pop()

      for (const block of blocks) {
        if (!block.trim()) continue
        let eventType = 'message'
        let eventData = ''
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim()
          if (line.startsWith('data: ')) eventData += (eventData ? '\n' : '') + line.slice(6)
        }
        if (eventData !== '') yield { type: eventType, data: eventData }
      }
    }
  }

  // Agentic phase config
  const PHASES = [
    { id: 'analyzing', label: 'Analysing' },
    { id: 'planning', label: 'Planning' },
    { id: 'generating', label: 'Generating' },
    { id: 'assembling', label: 'Assembling' },
  ]

  const phaseIndex = (id) => PHASES.findIndex(p => p.id === id)

   // Agentic: Phase 1 — call /plan, pause for confirmation
   const handleAgenticGenerate = useCallback(async () => {
     if (isAgenticActive) return

     setAgenticStatus('planning')
     setAgenticPhaseLocal('analyzing')
     setAgenticPlanLocal(null)
     setAgenticLogsLocal([])
     setAgenticAgentsLocal([])
     setAgenticErrorMsgLocal('')
     setAgenticElapsedLocal(0)

     try {
        const response = await fetch('/api/opencode/agentic/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName,
            flowId,
            recipe,
            zones,
            repeatableSlides,
            summaryMode: agenticSummaryMode,
            summaryPrompt: agenticSummaryPrompt,
            contentPrompt: agenticContentPrompt,
            customInput: agenticCustomInput,
            selectedFiles,
            sliceOutputTemplate,
          }),
        })
      if (!response.ok) throw new Error(`Server error ${response.status}`)

      for await (const { type, data } of readSSE(response)) {
        switch (type) {
          case 'phase':
            setAgenticPhaseLocal(data)
            break
          case 'log':
            setAgenticLogsLocal(prev => [...prev, data])
            break
           case 'plan': {
             const planData = JSON.parse(data)
             setAgenticPlanLocal(planData)
             setAgenticStatus('confirming')
             break
           }
          case 'error':
             setAgenticStatus('error')
             setAgenticErrorMsgLocal(data)
             break
         }
       }
     } catch (err) {
       setAgenticStatus('error')
       setAgenticErrorMsgLocal(err.message)
     }
    }, [isAgenticActive, projectName, recipe, zones, repeatableSlides, agenticSummaryMode, agenticSummaryPrompt, agenticContentPrompt, selectedFiles, setAgenticStatus])

  // Agentic: Phase 2 — user accepted, call /run SSE stream
  const handleAgenticAccept = useCallback(async () => {
    if (!agenticPlanLocal) return

    setAgenticStatus('running')
    setAgenticPhaseLocal('generating')
    setAgenticLogsLocal([])
    setAgenticAgentsLocal([])
    setAgenticElapsedLocal(0)

    try {
         const response = await fetch('/api/opencode/agentic/run', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             projectName,
             flowId,
             zones,
             repeatableSlides,
             instances: agenticPlanLocal.instances,
             instanceNames: agenticPlanLocal.instanceNames,
             contentPrompt: agenticContentPrompt,
             customInput: agenticCustomInput,
           }),
         })

      if (!response.ok) throw new Error(`Server error ${response.status}`)

      for await (const { type, data } of readSSE(response)) {
        switch (type) {
          case 'phase':
            setAgenticPhaseLocal(data)
            break
          case 'log':
            setAgenticLogsLocal(prev => [...prev, data])
            break
          case 'agents':
            setAgenticAgentsLocal(JSON.parse(data))
            break
          case 'agent_update': {
            const u = JSON.parse(data)
            setAgenticAgentsLocal(prev =>
              prev.map(a => a.id === u.id ? { ...a, state: u.state } : a)
            )
            break
          }
          case 'done':
            setAgenticStatus('done')
            handleJsonChange(data)
            saveAgenticJsonResponseToFlow(data)
            setToast({ message: 'JSON generated — review and apply when ready', type: 'success' })
            break
          case 'error':
            setAgenticStatus('error')
            setAgenticErrorMsgLocal(data)
            break
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
         setAgenticStatus('error')
         setAgenticErrorMsgLocal(err.message)
       }
     }
    }, [agenticPlanLocal, projectName, recipe, zones, repeatableSlides, agenticContentPrompt, selectedFiles, handleJsonChange, saveAgenticJsonResponseToFlow, setToast, setAgenticStatus])

  // Agentic: Cancel/reset
  const handleAgenticCancel = () => {
    setAgenticStatus('idle')
    setAgenticPhaseLocal('')
    setAgenticPlanLocal(null)
    setAgenticLogsLocal([])
    setAgenticAgentsLocal([])
    setAgenticErrorMsgLocal('')
    setAgenticElapsedLocal(0)
  }

  // Agentic: Timer
  useEffect(() => {
    if (agenticStatus === 'running') {
      const timer = setInterval(() => setAgenticElapsedLocal(e => e + 1), 1000)
      return () => clearInterval(timer)
    }
  }, [agenticStatus])

  // Agentic: Log auto-scroll
  const agenticLogEndRef = useRef(null)
  useEffect(() => {
    agenticLogEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [agenticLogsLocal])

  const currentPhaseIdx = phaseIndex(agenticPhaseLocal)

  return (
    <div className="app">
      <AppHeader
        title={projectName}
        subtitle={`${totalCount} zone${totalCount !== 1 ? 's' : ''} · Generate content with AI`}
        debugContext={debugContext}
      />
      <Breadcrumbs step={step} canNavigateTo={canNavigateTo} navigateTo={navigateTo} flow="html" />

      {/* Success flash banner */}
      {applySuccess && (
        <div className="apply-success-banner">
          <span className="apply-success-icon">✓</span>
          <span className="apply-success-text">Slides applied successfully! Taking you to preview…</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="recipe-tabs">
        <button
          className={`recipe-tab ${activeTab === 'manual' ? 'active' : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          <span aria-hidden="true">✏️</span> Manual Generation
        </button>
        <button
          className={`recipe-tab ${activeTab === 'agentic' ? 'active' : ''}`}
          onClick={() => setActiveTab('agentic')}
        >
          <span aria-hidden="true">⚡</span> Agentic Generation
        </button>
      </div>

      {/* Manual tab panel */}
      {activeTab === 'manual' && (
        <div className="recipe-tab-panel">
          <div className="html-recipe-layout">

        {/* ── Left: Recipe panel ─────────────────────────────────────────── */}
        <div className="html-recipe-left">
          <div className="html-recipe-panel">
            <div className="html-recipe-panel-header">
              <h3>Recipe Prompt</h3>
            </div>

            <div className="html-recipe-global-prompt">
              <label className="html-recipe-global-label">
                Global guidance
                <span className="html-recipe-global-sub">Optional context prepended to the recipe</span>
              </label>
              <textarea
                className="html-recipe-global-input"
                rows={2}
                value={globalPrompt}
                onChange={e => {
                  setGlobalPrompt(e.target.value)
                  onRecipeStateChange?.({ globalPrompt: e.target.value })
                }}
                placeholder='e.g. "Use formal language. Focus on EMEA market data."'
              />
            </div>

            <button
              className="btn btn-secondary html-recipe-generate-btn"
              onClick={handleGenerateRecipe}
              disabled={loadingRecipe}
            >
              {loadingRecipe ? 'Generating…' : recipe ? <><span aria-hidden="true">↻</span> Regenerate recipe</> : 'Generate recipe'}
            </button>

            {recipe ? (
              <div className="recipe-collapsible-wrapper">
                <div className={`recipe-collapsible${recipeExpanded ? ' expanded' : ''}${recipe ? ' has-content' : ''}`}>
                  <div className="html-recipe-area-wrapper">
                    <button className="copy-btn" onClick={handleCopyRecipe} aria-label="Copy recipe to clipboard"><span aria-hidden="true">⧉</span></button>
                    <div className="html-recipe-area">{recipe}</div>
                  </div>
                </div>
                <button
                  className={`recipe-expand-btn${recipeExpanded ? ' is-expanded' : ''}`}
                  onClick={() => setRecipeExpanded(v => !v)}
                  aria-label={recipeExpanded ? 'Collapse recipe prompt' : 'Expand recipe prompt'}
                >
                  <span className="expand-chevron" aria-hidden="true">▼</span>
                  {recipeExpanded ? 'Collapse' : 'View full recipe'}
                </button>
              </div>
            ) : (
              <div className="html-recipe-empty">
                <p>Click "Generate recipe" to build the AI prompt from your {zones.length} zone{zones.length !== 1 ? 's' : ''}.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: JSON response panel ─────────────────────────────────── */}
        <div className="html-recipe-right">
          <div className="html-recipe-panel">
             <div className="html-recipe-panel-header">
               <h3>JSON Response</h3>
             </div>

             <div className="recipe-collapsible-wrapper">
               <div className={`recipe-collapsible${jsonExpanded ? ' expanded' : ''}${jsonInput ? ' has-content' : ''}`}>
                 <div className="html-recipe-json-wrapper">
                   {jsonInput && (
                     <button className="copy-btn" onClick={handleCopyJson} aria-label="Copy JSON to clipboard">
                       <span aria-hidden="true">⧉</span>
                     </button>
                   )}
                   <textarea
                     className={`json-input${validation?.valid === false ? ' has-error' : ''}`}
                     value={jsonInput}
                     onChange={e => handleJsonChange(e.target.value)}
                     placeholder='Paste the AI response JSON here…'
                     spellCheck={false}
                   />
                 </div>
               </div>
               {jsonInput && (
                 <button
                   className={`recipe-expand-btn${jsonExpanded ? ' is-expanded' : ''}`}
                   onClick={() => setJsonExpanded(v => !v)}
                   aria-label={jsonExpanded ? 'Collapse JSON response' : 'Expand JSON response'}
                 >
                   <span className="expand-chevron" aria-hidden="true">▼</span>
                   {jsonExpanded ? 'Collapse' : 'View full response'}
                 </button>
               )}
             </div>

            {/* Validation feedback */}
            {validation?.valid === false && (
              <div className="validation-status invalid">
                <strong>
                  {validation.error ||
                    (validation.missingFields?.length > 0
                      ? `Missing ${validation.missingFields.length} required field${validation.missingFields.length !== 1 ? 's' : ''}`
                      : 'Invalid JSON')}
                </strong>
                {validation.missingFields?.length > 0 && (
                  <ul className="html-recipe-missing-fields">
                    {validation.missingFields.slice(0, 8).map(f => (
                      <li key={f}>{f}</li>
                    ))}
                    {validation.missingFields.length > 8 && (
                      <li>…and {validation.missingFields.length - 8} more</li>
                    )}
                  </ul>
                )}
              </div>
            )}
            {validation?.valid === true && (
              <div className="validation-status valid">
                ✓ {validation.foundFields?.length ?? 0} fields
                {validation.instanceCount > 0 && ` · ${validation.instanceCount} slide instance${validation.instanceCount > 1 ? 's' : ''}`}
              </div>
            )}

            <div className="html-recipe-actions">
              <button className="btn btn-link" onClick={onBack}>
                <span aria-hidden="true">←</span> Back to template
              </button>
              <button
                className="btn btn-primary"
                onClick={handleApply}
                disabled={!validation?.valid || applying}
              >
                {applying ? 'Applying…' : <><span aria-hidden="true">→</span> Apply content</>}
              </button>
            </div>
          </div>
        </div>
          </div>
        </div>
      )}

      {/* Agentic tab panel */}
      {activeTab === 'agentic' && (
        <div className="recipe-tab-panel">
          <div className="agentic-tab-layout">
            {/* A. Context Files Panel */}
            <div className="context-files-panel">
              <div className="context-files-header">
                <h4>Context Files</h4>
                {contextFiles.length > 0 && (
                  <div className="context-files-controls">
                    <button
                      className="context-files-link"
                      onClick={handleSelectAllFiles}
                    >
                      {selectedFiles.length === contextFiles.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                )}
              </div>

              {loadingContextFiles ? (
                <div className="context-files-loading">Loading context files…</div>
              ) : contextFiles.length === 0 ? (
                <div className="context-files-empty">
                  <p>No context files found. Add files to the 'AI Context' folder in your project.</p>
                </div>
              ) : (
                <div className="context-files-list">
                  {contextFiles.map(file => (
                    <div key={file.filename} className="context-file-row">
                      <label className="context-file-label">
                        <input
                          type="checkbox"
                          checked={selectedFiles.includes(file.filename)}
                          onChange={() => handleToggleFile(file.filename)}
                          className="context-file-checkbox"
                        />
                        <span className="context-file-name">{file.filename}</span>
                        <span className={getExtBadgeClass(file.filename)}>
                          {file.filename.split('.').pop()?.toLowerCase()}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* B. Slice output template selector */}
            {!usePreviousResponse && (
              <div className="agentic-prompt-section">
                <label htmlFor="sliceOutputTemplate" className="agentic-prompt-label">
                  Slice output template
                  <span className="agentic-prompt-hint agentic-prompt-hint--required">Required</span>
                </label>
                <select
                  id="sliceOutputTemplate"
                  className={`agentic-template-select${!sliceOutputTemplate ? ' agentic-template-select--empty' : ''}`}
                  value={sliceOutputTemplate || ''}
                  onChange={e => {
                    const val = e.target.value || null
                    setSliceOutputTemplate(val)
                    saveSliceOutputTemplateToFlow(val)
                  }}
                  disabled={isAgenticActive || agenticStatus === 'confirming'}
                >
                  <option value="">— Select a template —</option>
                  {sliceTemplates.map(t => (
                    <option key={t.filename} value={t.filename} title={t.description}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* C. Custom Prompt Textarea (hidden if using previous response) */}
             {!usePreviousResponse && (
               <div className="agentic-prompt-section">
                 <label htmlFor="agenticCustomInput" className="agentic-prompt-label">
                   What should the AI generate?
                 </label>
                 <textarea
                   id="agenticCustomInput"
                   className="agentic-prompt-textarea"
                   value={agenticCustomInput}
                   onChange={(e) => handleAgenticCustomInputChange(e.target.value)}
                   disabled={isAgenticActive || agenticStatus === 'confirming'}
                   placeholder="Describe the slides you want — tone, focus, number of instances, anything specific…"
                 />
               </div>
             )}

            {/* C. Generate with AI button + inline agentic UI (hidden if using previous response) */}
            {!usePreviousResponse && (
              <div className="agentic-generate-section">
                 <button
                   className={`agentic-generate-btn ${isAgenticActive ? 'running' : ''}`}
                   onClick={isAgenticActive ? undefined : handleAgenticGenerate}
                   disabled={isAgenticActive || agenticStatus === 'confirming' || !sliceOutputTemplate}
                   title={!sliceOutputTemplate ? 'Select a slice output template first' : undefined}
                 >
                  {agenticStatus === 'planning' ? 'Analysing…' :
                   agenticStatus === 'running' ? 'Generating…' :
                   '✦ Generate with AI'}
                </button>
                {!sliceOutputTemplate && agenticStatus === 'idle' && (
                  <span className="agentic-template-required-hint">Select a slice output template to enable generation</span>
                )}

                {agenticStatus === 'running' && (
                  <span className={agenticCss.timer}>{agenticElapsedLocal}s</span>
                )}
              </div>
            )}

            {/* Phase stepper (hidden if using previous response) */}
            {!usePreviousResponse && (agenticStatus === 'planning' || agenticStatus === 'confirming' || agenticStatus === 'running' || agenticStatus === 'done') && (
              <div className={agenticCss.stepper}>
                {PHASES.map((p, i) => {
                  const isDone = (agenticStatus === 'confirming' && i <= 1)
                              || (currentPhaseIdx > i && agenticStatus !== 'confirming')
                              || agenticStatus === 'done'
                  const isActive = currentPhaseIdx === i && (agenticStatus === 'planning' || agenticStatus === 'running')
                  return (
                    <div key={p.id} className={agenticCss.stepItem}>
                      <div className={`${agenticCss.stepDot} ${isDone ? agenticCss.done : ''} ${isActive ? agenticCss.active : ''}`}>
                        {isDone ? '✓' : i + 1}
                      </div>
                      <span className={`${agenticCss.stepLabel} ${isDone ? agenticCss.done : ''} ${isActive ? agenticCss.active : ''}`}>
                        {p.label}
                      </span>
                      {i < PHASES.length - 1 && (
                        <div className={`${agenticCss.stepConnector} ${isDone ? agenticCss.done : ''}`} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Confirmation card (hidden if using previous response) */}
            {!usePreviousResponse && agenticStatus === 'confirming' && agenticPlanLocal && (
              <div className={agenticCss.confirmCard}>
                <div className={agenticCss.confirmHeader}>
                  <span className={agenticCss.confirmIcon}>◎</span>
                  <span className={agenticCss.confirmTitle}>Review generated content</span>
                </div>

                {agenticPlanLocal.rationale && (
                  <p className={agenticCss.confirmRationale}>{agenticPlanLocal.rationale}</p>
                )}

                {agenticPlanLocal.contextSlices && Object.keys(agenticPlanLocal.contextSlices).length > 0 ? (
                    <div className={agenticCss.reviewTableWrapper}>
                      <ContentReviewTable
                        contextSlices={agenticPlanLocal.contextSlices}
                        instanceNames={agenticPlanLocal.instanceNames || []}
                      />
                   </div>
                 ) : (
                   <div className={agenticCss.confirmRationale} style={{fontStyle:'italic', color: 'var(--color-warning, #b45309)'}}>
                     <strong style={{fontStyle:'normal'}}>No data preview available.</strong>
                     {' '}The orchestrator could not extract context slices
                     {agenticPlanLocal.rationale ? ` (reason: ${agenticPlanLocal.rationale})` : ''}.
                     {' '}Generation will still proceed using the full context files — check the Activity log for details.
                   </div>
                 )}

                <div className={agenticCss.confirmActions}>
                  <button className={agenticCss.acceptBtn} onClick={handleAgenticAccept}>
                    Accept &amp; Generate
                  </button>
                  <button className={agenticCss.cancelBtn} onClick={handleAgenticCancel}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Agent chips (hidden if using previous response) */}
            {!usePreviousResponse && agenticAgentsLocal.length > 0 && (
              <div className={agenticCss.chipsSection}>
                <div className={agenticCss.chipsLabel}>Agents</div>
                <div className={agenticCss.chips}>
                  {agenticAgentsLocal.map(agent => (
                    <div key={agent.id} className={`${agenticCss.chip} ${agenticCss[agent.state]}`}>
                      {agent.state === 'running' && <div className={agenticCss.chipSpinner} />}
                      {agent.state === 'done' && '✓ '}
                      {agent.state === 'error' && '✕ '}
                      {agent.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity log — shown as soon as planning starts (hidden if using previous response) */}
            {!usePreviousResponse && (agenticStatus === 'planning' || agenticStatus === 'running' || agenticStatus === 'done' || agenticStatus === 'error') && (
              <div className={agenticCss.logSection}>
                <div className={agenticCss.logLabel}>Activity</div>
                <div className={agenticCss.log}>
                  {agenticLogsLocal.length === 0 ? (
                    <span className={agenticCss.logWaiting}>Connecting to AI…</span>
                  ) : (
                    agenticLogsLocal.map((line, i) => (
                      <span key={i} className={`${agenticCss.logLine} ${i === agenticLogsLocal.length - 1 ? agenticCss.latest : ''}`}>
                        {line}{'\n'}
                      </span>
                    ))
                  )}
                  <span ref={agenticLogEndRef} />
                </div>
              </div>
            )}

            {/* Success banner (hidden if using previous response) */}
            {!usePreviousResponse && agenticStatus === 'done' && (
              <div className={agenticCss.successBanner}>
                <span>✓</span>
                <span>JSON generated and pasted into the Response field. Review and apply when ready.</span>
              </div>
            )}

            {/* Error banner (hidden if using previous response) */}
            {!usePreviousResponse && agenticStatus === 'error' && (
              <div className={agenticCss.errorBanner}>
                <strong>Generation failed</strong>
                <pre className={agenticCss.errorDetail}>{agenticErrorMsgLocal}</pre>
                <div className={agenticCss.errorActions}>
                  <button className={agenticCss.resetBtn} onClick={handleAgenticCancel}>Try again</button>
                  <button className={agenticCss.copyBtn} onClick={() => navigator.clipboard.writeText(agenticErrorMsgLocal)}>Copy error</button>
                </div>
              </div>
            )}

            {/* Use previous AI response toggle (when response exists) */}
            {project?.agenticJsonResponse && (
              <div className="agentic-previous-response-toggle">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={usePreviousResponse}
                    onChange={(e) => setUsePreviousResponse(e.target.checked)}
                    className="toggle-checkbox"
                  />
                  <span className="toggle-text">Use previous AI response</span>
                </label>
              </div>
            )}

             {/* Previous response panel (when toggle is ON) */}
             {usePreviousResponse && project?.agenticJsonResponse && (
               <div className="agentic-previous-response-panel">
                 <h4>Previous AI Response</h4>
                 <div className="json-code-block">
                   <pre><code>{JSON.stringify(project.agenticJsonResponse, null, 2)}</code></pre>
                 </div>
                 <div className="agentic-previous-response-actions">
                   <button className="btn btn-link" onClick={onBack}>
                     <span aria-hidden="true">←</span> Back to template
                   </button>
                   <button
                     className="btn btn-primary"
                     onClick={async () => {
                       setApplying(true)
                        try {
                          const res = await fetch('/api/html-flow/apply-content', {
                            method:  'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body:    JSON.stringify({ projectName, flowId, jsonString: typeof project.agenticJsonResponse === 'string' ? project.agenticJsonResponse : JSON.stringify(project.agenticJsonResponse) }),
                          })
                         if (!res.ok) throw new Error(`Server error ${res.status}`)
                         const data = await res.json()
                         if (!data.ok) throw new Error(data.error || 'Apply failed')
                         onApplied({ outputFile: data.outputFile, previewHtml: data.previewHtml, roundId: data.roundId, slideCount: data.slideCount ?? 1, slideNames: data.slideNames ?? [] })
                       } catch (err) {
                         setToast({ message: 'Apply failed: ' + err.message, type: 'error' })
                         setApplying(false)
                       }
                     }}
                     disabled={applying}
                   >
                     {applying ? 'Applying…' : <><span aria-hidden="true">→</span> Proceed to Preview</>}
                   </button>
                 </div>
               </div>
             )}

            {/* D. JSON output + Apply (shared with Manual tab, hidden if using previous response) */}
            {jsonInput && !usePreviousResponse && (
              <div className="agentic-json-section">
                <h4>JSON Response</h4>
                <div className="html-recipe-json-wrapper">
                  <textarea
                    className={`json-input${validation?.valid === false ? ' has-error' : ''}`}
                    value={jsonInput}
                    onChange={e => handleJsonChange(e.target.value)}
                    placeholder="JSON will appear here after generation…"
                    spellCheck={false}
                  />
                </div>

                {validation?.valid === false && (
                  <div className="validation-status invalid">
                    <strong>
                      {validation.error ||
                        (validation.missingFields?.length > 0
                          ? `Missing ${validation.missingFields.length} required field${validation.missingFields.length !== 1 ? 's' : ''}`
                          : 'Invalid JSON')}
                    </strong>
                    {validation.missingFields?.length > 0 && (
                      <ul className="html-recipe-missing-fields">
                        {validation.missingFields.slice(0, 8).map(f => (
                          <li key={f}>{f}</li>
                        ))}
                        {validation.missingFields.length > 8 && (
                          <li>…and {validation.missingFields.length - 8} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
                {validation?.valid === true && (
                  <div className="validation-status valid">
                    ✓ {validation.foundFields?.length ?? 0} fields
                    {validation.instanceCount > 0 && ` · ${validation.instanceCount} slide instance${validation.instanceCount > 1 ? 's' : ''}`}
                  </div>
                )}

                <div className="html-recipe-actions">
                  <button className="btn btn-link" onClick={onBack}>
                    <span aria-hidden="true">←</span> Back to template
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleApply}
                    disabled={!validation?.valid || applying}
                  >
                    {applying ? 'Applying…' : <><span aria-hidden="true">→</span> Apply content</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
