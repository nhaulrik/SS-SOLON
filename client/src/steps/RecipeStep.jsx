import { useRef } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'

export default function RecipeStep({
  recipe,
  jsonInput,
  setJsonInput,
  validation,
  setValidation,
  tags,
  repeatableSlides,
  propagations,
  step,
  canNavigateTo,
  navigateTo,
  stepAnimClass,
  generatePreview,
  setToast
}) {
  const validateTimeoutRef = useRef(null)

  const handleJsonChange = async (value) => {
    setJsonInput(value)

    if (!value.trim()) {
      setValidation({ valid: null })
      return
    }

    try {
      const res = await fetch('/api/validate-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonString: value, tags, repeatableSlides, propagations })
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const result = await res.json()
      setValidation(result)
    } catch (err) {
      setValidation({ valid: false, error: 'Validation failed: ' + err.message })
    }
  }

  const handleCopyRecipe = () => {
    navigator.clipboard.writeText(recipe)
    setToast({ message: 'Recipe copied!', type: 'success' })
  }

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonInput)
    setToast({ message: 'JSON copied!', type: 'success' })
  }

  return (
    <div className="app">
      <AppHeader title="Recipe + JSON" subtitle="Copy the recipe prompt for the AI, then paste the JSON response" />
      <Breadcrumbs step={step} canNavigateTo={canNavigateTo} navigateTo={navigateTo} />

      <div className={stepAnimClass}>
        <div className="recipe-json-layout">
          <div className="recipe-panel">
            <h3>Recipe Prompt</h3>
            <div className="recipe-area-wrapper">
              <button className="copy-btn" onClick={handleCopyRecipe} title="Copy to clipboard">⧉</button>
              <div className="recipe-area">{recipe}</div>
            </div>
          </div>

          <div className="json-panel">
            <h3>JSON Response</h3>
            <div className="json-input-wrapper">
              <button className="copy-btn" onClick={handleCopyJson} title="Copy to clipboard">⧉</button>
              <textarea
                className={`json-input ${validation?.valid === false ? 'has-error' : ''}`}
                value={jsonInput}
                onChange={e => {
                  const v = e.target.value
                  setJsonInput(v)
                  // Debounce server-side validation
                  clearTimeout(validateTimeoutRef.current)
                  validateTimeoutRef.current = setTimeout(() => handleJsonChange(v), 300)
                }}
                placeholder='{"static": {...}, "slides": {...}}'
              />
            </div>

            {validation?.valid === false && (
              <div className="validation-status invalid">
                {validation.error || 'Invalid JSON'}
              </div>
            )}

            <div className="actions">
              <button
                className="btn btn-primary"
                onClick={generatePreview}
                disabled={!validation?.valid}
              >
                Preview &amp; Generate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
