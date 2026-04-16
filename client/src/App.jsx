import { useState, useCallback } from 'react'
import Toast           from './components/Toast.jsx'
import FlowSelectStep  from './steps/FlowSelectStep.jsx'
import HtmlUploadStep  from './steps/HtmlUploadStep.jsx'
import HtmlRecipeStep  from './steps/HtmlRecipeStep.jsx'
import HtmlPreviewStep from './steps/HtmlPreviewStep.jsx'
import MetadataAssignmentStep from './steps/MetadataAssignmentStep.jsx'

const ALL_STEPS = ['flow-select', 'html-upload', 'html-recipe', 'html-preview', 'html-metadata']

export default function App() {
  // ── Step navigation ────────────────────────────────────────────
  const [step,    setStep]    = useState('flow-select')
  const [animDir, setAnimDir] = useState('forward')

  const navigateTo = useCallback((newStep) => {
    const curr = ALL_STEPS.indexOf(step)
    const next = ALL_STEPS.indexOf(newStep)
    setAnimDir(next >= curr ? 'forward' : 'backward')
    setStep(newStep)
  }, [step])

  const stepAnimClass = `step-content step-content-enter-${animDir === 'forward' ? 'right' : 'left'}`

  // ── Flow selection ─────────────────────────────────────────────
  const [activeFlow, setActiveFlow] = useState(null)

  const handleSelectFlow = useCallback((flow) => {
    setActiveFlow(flow)
    if (flow === 'html') navigateTo('html-upload')
  }, [navigateTo])

  const handleBackToFlowSelect = useCallback(() => {
    setActiveFlow(null)
    setHtmlUploadSession(null)
    setHtmlProject(null)
    setHtmlApplied(null)
    setHtmlRecipe('')
    navigateTo('flow-select')
  }, [navigateTo])

  const handleBackToHtmlUpload = useCallback(() => {
    // Preserve htmlUploadSession when going back to upload step
    // (don't clear it, as the user may want to iterate on the project creation)
    navigateTo('html-upload')
  }, [navigateTo])

  // ── HTML flow state ────────────────────────────────────────────
  // htmlUploadSession persists the upload/tree state so back-navigation
  // from recipe or preview restores the tree without re-uploading.
  const [htmlUploadSession, setHtmlUploadSession] = useState(null)
  // { templateId, fileName, slideCount, trees, selections, previewHtml, rawHtml, projectName }

  const [htmlProject, setHtmlProject] = useState(null)  // { chainId, projectName, zones, templatePath }
  const [htmlApplied, setHtmlApplied] = useState(null)  // { outputFile, previewHtml, roundId }
  const [htmlRecipe,  setHtmlRecipe]  = useState('')    // last generated recipe string
  
  // ── HTML recipe step state (preserved across navigation) ────────
  const [htmlRecipeState, setHtmlRecipeState] = useState({
    recipe: '',           // the generated recipe prompt
    globalPrompt: '',     // user's global guidance input
    jsonInput: '',        // user's JSON response input
  })

  // ── AI response tracking (for debug context) ────────────────────
  const [htmlAiResponse, setHtmlAiResponse] = useState(null)
  // { raw, validated, validationResult }

  // ── Global toast (declare early so handlers can use it) ──────────
  const [toast, setToast] = useState(null)

  const handleHtmlProjectCreated = useCallback((project) => {
    setHtmlProject(project)
    navigateTo('html-recipe')
  }, [navigateTo])

  const handleHtmlApplied = useCallback((result) => {
    setHtmlApplied(result)
    navigateTo('html-preview')
  }, [navigateTo])

  const handleBackToHtmlRecipe = useCallback(() => {
    setHtmlApplied(null)
    navigateTo('html-recipe')
  }, [navigateTo])

  const handleMetadataAssignmentStart = useCallback(() => {
    navigateTo('html-metadata')
  }, [navigateTo])

  const handleMetadataSaved = useCallback(async (metadata) => {
    try {
      const response = await fetch('/api/html-flow/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: htmlProject.chainId,
          projectName: htmlProject.projectName,
          slideCount: htmlApplied.slideCount,
          metadata,
        }),
      })

      const result = await response.json()

      if (!result.ok) {
        setToast({ type: 'error', message: result.error })
        return
      }

      setToast({
        type: 'success',
        message: `Project "${result.projectName}" saved with metadata!`,
      })

      // Reset state and go back to flow select
      setActiveFlow(null)
      setHtmlUploadSession(null)
      setHtmlProject(null)
      setHtmlApplied(null)
      setHtmlRecipe('')
      navigateTo('flow-select')
    } catch (err) {
      setToast({ type: 'error', message: err.message })
    }
  }, [htmlProject, htmlApplied, navigateTo, setToast])

  const handleHtmlRecipeStateChange = useCallback((updates) => {
    setHtmlRecipeState(prev => ({ ...prev, ...updates }))
  }, [])

  const handleHtmlAiResponseChange = useCallback((aiResponse) => {
    setHtmlAiResponse(aiResponse)
  }, [])

  // ── canNavigateTo guard ────────────────────────────────────────
  const canNavigateTo = useCallback((s) => {
    if (s === 'flow-select')  return true
    if (s === 'html-upload')  return activeFlow === 'html' || step === 'html-recipe' || step === 'html-metadata'
    if (s === 'html-recipe')  return !!(htmlProject)
    if (s === 'html-preview') return !!(htmlProject && htmlApplied)
    if (s === 'html-metadata') return !!(htmlProject && htmlApplied)
    return false
  }, [activeFlow, htmlProject, htmlApplied, step])

  // ── Debug context ──────────────────────────────────────────────
  const debugContext = {
    timestamp:  new Date().toISOString(),
    step,
    activeFlow,

    // Upload session — tree, selections, repeatable slides, raw HTML source
    uploadSession: htmlUploadSession
      ? {
          templateId:       htmlUploadSession.templateId,
          fileName:         htmlUploadSession.fileName,
          slideCount:       htmlUploadSession.slideCount,
          projectName:      htmlUploadSession.projectName,
          selectionCount:   htmlUploadSession.selections?.length ?? 0,
          selections:       htmlUploadSession.selections ?? [],
          repeatableSlides: htmlUploadSession.repeatableSlides ?? [],
          hasPreview:       !!htmlUploadSession.previewHtml,
          rawHtml:          htmlUploadSession.rawHtml ?? '',
        }
      : null,

    // Created project — zones and chain metadata
    project: htmlProject
      ? {
          chainId:          htmlProject.chainId,
          projectName:      htmlProject.projectName,
          zoneCount:        htmlProject.zones?.length ?? 0,
          zones:            htmlProject.zones ?? [],
          selections:       htmlProject.selections ?? [],
          repeatableSlides: htmlProject.repeatableSlides ?? [],
        }
      : null,

    // Last generated recipe string
    recipe: htmlRecipe || null,

    // Applied result — last output round
    applied: htmlApplied
      ? {
          roundId:    htmlApplied.roundId,
          outputFile: htmlApplied.outputFile,
          outputHtml: htmlApplied.previewHtml ?? '',
        }
      : null,

    // AI response — JSON pasted by user and its validation result
    aiResponse: htmlAiResponse,
  }

  const sharedProps = { step, canNavigateTo, navigateTo, stepAnimClass, debugContext }

  // ── Step routing ───────────────────────────────────────────────

  if (step === 'flow-select') {
    return (
      <>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <FlowSelectStep
          onSelectFlow={handleSelectFlow}
          debugContext={debugContext}
        />
      </>
    )
  }

  if (step === 'html-upload') {
    return (
      <>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <HtmlUploadStep
          {...sharedProps}
          initialSession={htmlUploadSession}
          onSessionChange={setHtmlUploadSession}
          onProjectCreated={handleHtmlProjectCreated}
          onBack={handleBackToFlowSelect}
          setToast={setToast}
        />
      </>
    )
  }

  if (step === 'html-recipe' && htmlProject) {
    return (
      <>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <HtmlRecipeStep
          project={htmlProject}
          step={step}
          canNavigateTo={canNavigateTo}
          navigateTo={navigateTo}
          onBack={handleBackToHtmlUpload}
          onApplied={handleHtmlApplied}
          onRecipeChange={setHtmlRecipe}
          onRecipeStateChange={handleHtmlRecipeStateChange}
          onAiResponseChange={handleHtmlAiResponseChange}
          recipeState={htmlRecipeState}
          setToast={setToast}
          debugContext={debugContext}
        />
      </>
    )
  }

  if (step === 'html-preview' && htmlProject && htmlApplied) {
    return (
      <>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <HtmlPreviewStep
          project={htmlProject}
          applied={htmlApplied}
          step={step}
          canNavigateTo={canNavigateTo}
          navigateTo={navigateTo}
          onBack={handleBackToHtmlRecipe}
          onStartNew={handleBackToFlowSelect}
          onAssignMetadata={handleMetadataAssignmentStart}
          setToast={setToast}
          debugContext={debugContext}
        />
      </>
    )
  }

  if (step === 'html-metadata' && htmlProject && htmlApplied) {
    return (
      <>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <MetadataAssignmentStep
          project={htmlProject}
          applied={htmlApplied}
          step={step}
          canNavigateTo={canNavigateTo}
          navigateTo={navigateTo}
          onBack={() => navigateTo('html-preview')}
          onNext={handleMetadataSaved}
          setToast={setToast}
          debugContext={debugContext}
        />
      </>
    )
  }

  return null
}
