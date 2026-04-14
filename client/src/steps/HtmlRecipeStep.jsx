/**
 * HtmlRecipeStep — Stage 2 of the HTML Visual Flow.
 *
 * Shows the AI recipe prompt, accepts the JSON response, validates it
 * against the zone list, and on success applies the content to the
 * HTML template (generating a patched output file).
 *
 * Layout mirrors RecipeStep.jsx from the PPTX flow.
 */

import { useRef, useState, useCallback } from 'react'
import AppHeader   from '../components/AppHeader.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'

export default function HtmlRecipeStep({
  project,          // { chainId, projectName, zones, templatePath }
  step,
  canNavigateTo,
  navigateTo,
  onBack,           // () => void — back to zone review (start over)
  onApplied,        // ({ outputFile, previewHtml, roundId, slideCount }) => void — advance to preview
  onRecipeChange,   // (recipeString) => void — lifts recipe to App for debug context
  setToast,
  debugContext,
}) {
  const { chainId, projectName, selections = [], zones = [] } = project
  // Use selections for display counts; zones are used server-side for recipe/validate/apply

  // ── Recipe ────────────────────────────────────────────────────────────────
  const [recipe,        setRecipe]        = useState('')
  const [globalPrompt,  setGlobalPrompt]  = useState('')
  const [loadingRecipe, setLoadingRecipe] = useState(false)

  // ── JSON response ─────────────────────────────────────────────────────────
  const [jsonInput,   setJsonInput]   = useState('')
  const [validation,  setValidation]  = useState(null)   // { valid, error, missingFields }
  const [applying,    setApplying]    = useState(false)

  const validateTimerRef = useRef(null)

  // ── Generate recipe ───────────────────────────────────────────────────────
  const handleGenerateRecipe = useCallback(async () => {
    setLoadingRecipe(true)
    try {
      const res = await fetch('/api/html-flow/generate-recipe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chainId, globalPrompt }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed to generate recipe')
      setRecipe(data.recipe)
      onRecipeChange?.(data.recipe)
    } catch (err) {
      setToast({ message: 'Recipe generation failed: ' + err.message, type: 'error' })
    } finally {
      setLoadingRecipe(false)
    }
  }, [chainId, globalPrompt, setToast])

  // ── Validate JSON (debounced) ─────────────────────────────────────────────
  const validateJson = useCallback(async (value) => {
    if (!value.trim()) { setValidation(null); return }
    try {
      const res = await fetch('/api/html-flow/validate-json', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chainId, jsonString: value }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setValidation(data)
    } catch (err) {
      setValidation({ valid: false, error: 'Validation failed: ' + err.message })
    }
  }, [chainId])

  const handleJsonChange = useCallback((value) => {
    setJsonInput(value)
    clearTimeout(validateTimerRef.current)
    validateTimerRef.current = setTimeout(() => validateJson(value), 400)
  }, [validateJson])

  // ── Apply content ─────────────────────────────────────────────────────────
  const handleApply = useCallback(async () => {
    if (!validation?.valid || applying) return
    setApplying(true)
    try {
      const res = await fetch('/api/html-flow/apply-content', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chainId, jsonString: jsonInput }),
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
  }, [chainId, jsonInput, validation, applying, onApplied, setToast])

  // ── Copy helpers ──────────────────────────────────────────────────────────
  const handleCopyRecipe = useCallback(() => {
    navigator.clipboard.writeText(recipe)
    setToast({ message: 'Recipe copied!', type: 'success' })
  }, [recipe, setToast])

  const handleCopyJson = useCallback(() => {
    navigator.clipboard.writeText(jsonInput)
    setToast({ message: 'JSON copied!', type: 'success' })
  }, [jsonInput, setToast])

  const displaySels    = selections.length ? selections : zones
  const blockZoneCount = displaySels.filter(z => z.zoneType === 'block').length
  const leafZoneCount  = displaySels.filter(z => z.zoneType !== 'block').length
  const totalCount     = displaySels.length

  return (
    <div className="app">
      <AppHeader
        title={projectName}
        subtitle={`${totalCount} zones · ${blockZoneCount > 0 ? `${blockZoneCount} block${blockZoneCount > 1 ? 's' : ''} · ` : ''}Generate content with AI`}
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

            {/* Global prompt */}
            <div className="html-recipe-global-prompt">
              <label className="html-recipe-global-label">
                Global guidance
                <span className="html-recipe-global-sub">Optional context prepended to the recipe</span>
              </label>
              <textarea
                className="html-recipe-global-input"
                rows={2}
                value={globalPrompt}
                onChange={e => setGlobalPrompt(e.target.value)}
                placeholder='e.g. "Use formal language. Focus on EMEA market data."'
              />
            </div>

            <button
              className="btn btn-secondary html-recipe-generate-btn"
              onClick={handleGenerateRecipe}
              disabled={loadingRecipe}
            >
              {loadingRecipe ? 'Generating…' : recipe ? '↻ Regenerate recipe' : 'Generate recipe'}
            </button>

            {recipe ? (
              <div className="html-recipe-area-wrapper">
                <button className="copy-btn" onClick={handleCopyRecipe} title="Copy to clipboard">⧉</button>
                <div className="html-recipe-area">{recipe}</div>
              </div>
            ) : (
              <div className="html-recipe-empty">
                <p>Click "Generate recipe" to build the AI prompt from your {zones.length} zones.</p>
                {blockZoneCount > 0 && (
                  <p className="html-recipe-empty-note">
                    {blockZoneCount} block zone{blockZoneCount > 1 ? 's' : ''} will generate full HTML sections.
                    {leafZoneCount > 0 && ` ${leafZoneCount} leaf zone${leafZoneCount > 1 ? 's' : ''} will fill individual values.`}
                  </p>
                )}
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

            <div className="html-recipe-json-wrapper">
              <button className="copy-btn" onClick={handleCopyJson} title="Copy to clipboard">⧉</button>
              <textarea
                className={`json-input${validation?.valid === false ? ' has-error' : ''}`}
                value={jsonInput}
                onChange={e => handleJsonChange(e.target.value)}
                placeholder='Paste the AI response JSON here…'
                spellCheck={false}
              />
            </div>

            {/* Validation feedback */}
            {validation?.valid === false && (
              <div className="validation-status invalid">
                <strong>{validation.error || 'Invalid JSON'}</strong>
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
                JSON is valid — {validation.foundFields?.length ?? 0} fields found
                {validation.instanceCount > 0 && `, ${validation.instanceCount} slide instance${validation.instanceCount > 1 ? 's' : ''}`}
              </div>
            )}

            <div className="html-recipe-actions">
              <button className="btn btn-link" onClick={onBack}>
                ← Back to template
              </button>
              <button
                className="btn btn-primary"
                onClick={handleApply}
                disabled={!validation?.valid || applying}
              >
                {applying ? 'Applying…' : 'Apply content →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
