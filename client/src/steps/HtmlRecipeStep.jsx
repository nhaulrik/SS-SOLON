/**
 * HtmlRecipeStep — Stage 2 of the HTML Visual Flow.
 *
 * Shows the AI recipe prompt, accepts the JSON response, validates it
 * against the zone list, and on success applies the content to the
 * HTML template (generating a patched output file).
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import AppHeader     from '../components/AppHeader.jsx'
import Breadcrumbs   from '../components/Breadcrumbs.jsx'
import AgenticPanel  from '../components/AgenticPanel.jsx'

// ── JSON syntax highlighter ────────────────────────────────────────────────────
// Tokenises pretty-printed JSON and wraps tokens in typed spans.
// Input must be already HTML-escaped before calling.
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightJson(raw) {
  let pretty
  try {
    pretty = JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return escapeHtml(raw)
  }
  return escapeHtml(pretty).replace(
    /(&quot;(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\&])*&quot;(\s*:)?|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (match === 'true' || match === 'false') return `<span class="jt-bool">${match}</span>`
      if (match === 'null')                       return `<span class="jt-null">${match}</span>`
      if (/^-?\d/.test(match))                    return `<span class="jt-num">${match}</span>`
      if (match.endsWith(':'))                    return `<span class="jt-key">${match}</span>`
      return `<span class="jt-str">${match}</span>`
    }
  )
}

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
  agenticCustomPrompt,
  agenticPlan,
  // Agentic setter props
  setAgenticStatus,
  setAgenticPhase,
  setAgenticLogs,
  setAgenticAgents,
  setAgenticErrorMsg,
  setAgenticElapsed,
  setAgenticSummaryMode,
  setAgenticCustomPrompt,
  setAgenticPlan,
}) {
  const { selections = [], zones = [], repeatableSlides = [] } = project

  // ── Recipe ────────────────────────────────────────────────────────────────
  const [recipe,        setRecipe]        = useState(recipeState.recipe)
  const [globalPrompt,  setGlobalPrompt]  = useState(recipeState.globalPrompt)
  const [loadingRecipe, setLoadingRecipe] = useState(false)

  // ── JSON response ─────────────────────────────────────────────────────────
  const [jsonInput,  setJsonInput]  = useState(recipeState.jsonInput)
  const [validation, setValidation] = useState(null)
  const [applying,   setApplying]   = useState(false)
  const [viewMode,   setViewMode]   = useState('edit')   // 'edit' | 'preview'
  const [shouldAutoPreview, setShouldAutoPreview] = useState(false)

  // Auto-switch to preview when JSON becomes valid and auto-preview is requested
  useEffect(() => {
    if (validation?.valid && shouldAutoPreview) {
      setViewMode('preview')
      setShouldAutoPreview(false)
    }
  }, [validation?.valid, shouldAutoPreview])

  const validateTimerRef = useRef(null)

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
        body:    JSON.stringify({ projectName, flowId, jsonString: jsonInput }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Apply failed')
      onApplied({ outputFile: data.outputFile, previewHtml: data.previewHtml, roundId: data.roundId, slideCount: data.slideCount ?? 1 })
    } catch (err) {
      setToast({ message: 'Apply failed: ' + err.message, type: 'error' })
    } finally {
      setApplying(false)
    }
  }, [projectName, flowId, jsonInput, validation, applying, onApplied, setToast])

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

  return (
    <div className="app">
      <AppHeader
        title={projectName}
        subtitle={`${totalCount} zone${totalCount !== 1 ? 's' : ''} · Generate content with AI`}
        debugContext={debugContext}
      />
      <Breadcrumbs step={step} canNavigateTo={canNavigateTo} navigateTo={navigateTo} flow="html" />

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
              <div className="html-recipe-area-wrapper">
                <button className="copy-btn" onClick={handleCopyRecipe} aria-label="Copy recipe to clipboard"><span aria-hidden="true">⧉</span></button>
                <div className="html-recipe-area">{recipe}</div>
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

              {/* Edit / Preview toggle — shown only when there's content */}
              {jsonInput.trim() && (
                <div className="json-view-tabs">
                  <button
                    className={`json-view-tab${viewMode === 'edit' ? ' active' : ''}`}
                    onClick={() => setViewMode('edit')}
                  >
                    Edit
                  </button>
                  <button
                    className={`json-view-tab${viewMode === 'preview' ? ' active' : ''}`}
                    onClick={() => setViewMode('preview')}
                  >
                    Preview
                  </button>
                </div>
              )}
            </div>

            <div className="html-recipe-json-wrapper">
              <button className="copy-btn" onClick={handleCopyJson} aria-label="Copy JSON to clipboard">
                <span aria-hidden="true">⧉</span>
              </button>

              {/* Edit mode — plain textarea */}
              {viewMode === 'edit' && (
                <textarea
                  className={`json-input${validation?.valid === false ? ' has-error' : ''}`}
                  value={jsonInput}
                  onChange={e => handleJsonChange(e.target.value)}
                  placeholder='Paste the AI response JSON here…'
                  spellCheck={false}
                />
              )}

              {/* Preview mode — syntax-highlighted, line-numbered */}
              {viewMode === 'preview' && (
                <div className="json-preview-pane">
                  {(() => {
                    let pretty
                    try { pretty = JSON.stringify(JSON.parse(jsonInput), null, 2) } catch { pretty = jsonInput }
                    const lines = highlightJson(jsonInput).split('\n')
                    return lines.map((html, i) => (
                      <div key={i} className="json-preview-line">
                        <span className="json-preview-ln">{i + 1}</span>
                        <span dangerouslySetInnerHTML={{ __html: html || ' ' }} />
                      </div>
                    ))
                  })()}
                </div>
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

      <AgenticPanel
        projectName={projectName}
        recipe={recipe}
        zones={zones}
        repeatableSlides={repeatableSlides}
        // State props
        status={agenticStatus}
        phase={agenticPhase}
        logs={agenticLogs}
        agents={agenticAgents}
        errorMsg={agenticErrorMsg}
        elapsed={agenticElapsed}
        summaryMode={agenticSummaryMode}
        customPrompt={agenticCustomPrompt}
        plan={agenticPlan}
        // Setter callbacks
        setStatus={setAgenticStatus}
        setPhase={setAgenticPhase}
        setLogs={setAgenticLogs}
        setAgents={setAgenticAgents}
        setErrorMsg={setAgenticErrorMsg}
        setElapsed={setAgenticElapsed}
        setSummaryMode={setAgenticSummaryMode}
        setCustomPrompt={setAgenticCustomPrompt}
        setPlan={setAgenticPlan}
        onJsonReady={(json) => {
          handleJsonChange(json)
          setShouldAutoPreview(true)
          setToast({ message: 'JSON generated — review and apply when ready', type: 'success' })
        }}
      />
    </div>
  )
}
