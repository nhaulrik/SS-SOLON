import { useState, useCallback } from 'react'
import Toast           from './components/Toast.jsx'
import FlowSelectStep  from './steps/FlowSelectStep.jsx'
import HtmlUploadStep  from './steps/HtmlUploadStep.jsx'
import HtmlRecipeStep  from './steps/HtmlRecipeStep.jsx'
import HtmlPreviewStep from './steps/HtmlPreviewStep.jsx'

const ALL_STEPS = ['flow-select', 'html-upload', 'html-recipe', 'html-preview']

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

  // ── HTML flow state ────────────────────────────────────────────
  // htmlUploadSession persists the upload/tree state so back-navigation
  // from recipe or preview restores the tree without re-uploading.
  const [htmlUploadSession, setHtmlUploadSession] = useState(null)
  // { templateId, fileName, slideCount, trees, selections, previewHtml, rawHtml, projectName }

  const [htmlProject, setHtmlProject] = useState(null)  // { chainId, projectName, zones, templatePath }
  const [htmlApplied, setHtmlApplied] = useState(null)  // { outputFile, previewHtml, roundId }
  const [htmlRecipe,  setHtmlRecipe]  = useState('')    // last generated recipe string

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

  // ── Global toast ───────────────────────────────────────────────
  const [toast, setToast] = useState(null)

  // ── canNavigateTo guard ────────────────────────────────────────
  const canNavigateTo = useCallback((s) => {
    if (s === 'flow-select')  return true
    if (s === 'html-upload')  return activeFlow === 'html'
    if (s === 'html-recipe')  return !!(htmlProject)
    if (s === 'html-preview') return !!(htmlProject && htmlApplied)
    return false
  }, [activeFlow, htmlProject, htmlApplied])

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
          hasPreview: !!htmlApplied.previewHtml,
        }
      : null,
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
          onBack={() => navigateTo('html-upload')}
          onApplied={handleHtmlApplied}
          onRecipeChange={setHtmlRecipe}
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
          setToast={setToast}
          debugContext={debugContext}
        />
      </>
    )
  }

  return null
}
