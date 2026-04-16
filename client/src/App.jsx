import { useState, useCallback } from 'react'
import Toast                from './components/Toast.jsx'
import ProjectLandingStep   from './steps/ProjectLandingStep.jsx'
import ProjectDashboardStep from './steps/ProjectDashboardStep.jsx'
import FlowSelectStep       from './steps/FlowSelectStep.jsx'
import HtmlUploadStep       from './steps/HtmlUploadStep.jsx'
import HtmlRecipeStep       from './steps/HtmlRecipeStep.jsx'
import HtmlPreviewStep      from './steps/HtmlPreviewStep.jsx'
import HtmlMetadataStep     from './steps/HtmlMetadataStep.jsx'

const ALL_STEPS = [
  'project-landing',
  'project-dashboard',
  'flow-select',
  'html-upload',
  'html-recipe',
  'html-preview',
  'html-metadata',
]

export default function App() {
  // ── Step navigation ────────────────────────────────────────────
  const [step,    setStep]    = useState('project-landing')
  const [animDir, setAnimDir] = useState('forward')

  const navigateTo = useCallback((newStep) => {
    const curr = ALL_STEPS.indexOf(step)
    const next = ALL_STEPS.indexOf(newStep)
    setAnimDir(next >= curr ? 'forward' : 'backward')
    setStep(newStep)
  }, [step])

  const stepAnimClass = `step-content step-content-enter-${animDir === 'forward' ? 'right' : 'left'}`

  // ── Project & flow tracking ────────────────────────────────────
  const [currentProjectName, setCurrentProjectName] = useState(null)
  const [currentFlowId,      setCurrentFlowId]      = useState(null)

  const handleProjectSelected = useCallback((projectName) => {
    setCurrentProjectName(projectName)
    navigateTo('project-dashboard')
  }, [navigateTo])

  const handleFlowSelected = useCallback((flowId) => {
    setCurrentFlowId(flowId)
    navigateTo('html-upload')
  }, [navigateTo])

  const handleBackToProjects = useCallback(() => {
    setCurrentProjectName(null)
    setCurrentFlowId(null)
    navigateTo('project-landing')
  }, [navigateTo])

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
    navigateTo('html-upload')
  }, [navigateTo])

  // ── HTML flow state ────────────────────────────────────────────
  const [htmlUploadSession, setHtmlUploadSession] = useState(null)
  // { templateId, fileName, slideCount, trees, selections, previewHtml, rawHtml, projectName }

  const [htmlProject, setHtmlProject] = useState(null)
  // { projectName, flowId, zones, selections, repeatableSlides, fullSlideGeneration }

  const [htmlApplied, setHtmlApplied] = useState(null)
  // { outputFile, previewHtml, roundId, slideCount }

  const [htmlRecipe, setHtmlRecipe] = useState('')

  // ── HTML recipe step state (preserved across navigation) ────────
  const [htmlRecipeState, setHtmlRecipeState] = useState({
    recipe:             '',
    globalPrompt:       '',
    jsonInput:          '',
    recipeGenerationId: null,
  })

  // ── AI response tracking (for debug context) ────────────────────
  const [htmlAiResponse, setHtmlAiResponse] = useState(null)

  // ── Global toast ───────────────────────────────────────────────
  const [toast, setToast] = useState(null)

  const handleHtmlProjectCreated = useCallback((project) => {
    setHtmlProject(project)
    if (project.projectName && project.flowId) {
      setCurrentProjectName(project.projectName)
      setCurrentFlowId(project.flowId)
    }
    navigateTo('html-recipe')
  }, [navigateTo])

  const handleHtmlApplied = useCallback((result) => {
    setHtmlApplied({
      outputFile:  result.outputFile,
      previewHtml: result.previewHtml,
      roundId:     result.roundId,
      slideCount:  result.slideCount,
    })
    navigateTo('html-preview')
  }, [navigateTo])

  const handleBackToHtmlRecipe = useCallback(() => {
    setHtmlApplied(null)
    navigateTo('html-recipe')
  }, [navigateTo])

  const handlePreviewNext = useCallback(() => {
    navigateTo('html-metadata')
  }, [navigateTo])

  const handleMetadataFinish = useCallback(() => {
    navigateTo('project-dashboard')
  }, [navigateTo])

  const handleHtmlRecipeStateChange = useCallback((updates) => {
    setHtmlRecipeState(prev => ({ ...prev, ...updates }))
  }, [])

  const handleHtmlAiResponseChange = useCallback((aiResponse) => {
    setHtmlAiResponse(aiResponse)
  }, [])

  // ── canNavigateTo guard ────────────────────────────────────────
  const canNavigateTo = useCallback((s) => {
    if (s === 'project-landing')   return true
    if (s === 'project-dashboard') return !!currentProjectName
    if (s === 'flow-select')       return true
    if (s === 'html-upload')       return activeFlow === 'html' || step === 'html-recipe' || !!currentFlowId
    if (s === 'html-recipe')       return !!htmlProject
    if (s === 'html-preview')      return !!(htmlProject && htmlApplied)
    if (s === 'html-metadata')     return !!(htmlProject && htmlApplied)
    return false
  }, [activeFlow, htmlProject, htmlApplied, step, currentProjectName, currentFlowId])

  // ── Debug context ──────────────────────────────────────────────
  const debugContext = {
    timestamp:  new Date().toISOString(),
    step,
    activeFlow,
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
    project: htmlProject
      ? {
          projectName:      htmlProject.projectName,
          flowId:           htmlProject.flowId,
          zoneCount:        htmlProject.zones?.length ?? 0,
          zones:            htmlProject.zones ?? [],
          selections:       htmlProject.selections ?? [],
          repeatableSlides: htmlProject.repeatableSlides ?? [],
        }
      : null,
    recipe:  htmlRecipe || null,
    applied: htmlApplied
      ? {
          roundId:    htmlApplied.roundId,
          outputFile: htmlApplied.outputFile,
          outputHtml: htmlApplied.previewHtml ?? '',
        }
      : null,
    aiResponse: htmlAiResponse,
  }

  const sharedProps = { step, canNavigateTo, navigateTo, stepAnimClass, debugContext }

  // ── Step routing ───────────────────────────────────────────────

  const handleNewFlow = useCallback(() => {
    setCurrentFlowId(null)
    setHtmlUploadSession(null)
    setHtmlProject(null)
    setHtmlApplied(null)
    setHtmlRecipe('')
    setHtmlRecipeState({ recipe: '', globalPrompt: '', jsonInput: '', recipeGenerationId: null })
    setActiveFlow('html')
    navigateTo('html-upload')
  }, [navigateTo])

  if (step === 'project-landing') {
    return (
      <>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <ProjectLandingStep
          onProjectSelected={handleProjectSelected}
          setToast={setToast}
        />
      </>
    )
  }

  if (step === 'project-dashboard' && currentProjectName) {
    return (
      <>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <ProjectDashboardStep
          projectName={currentProjectName}
          onFlowSelected={handleFlowSelected}
          onNewFlow={handleNewFlow}
          onBackToProjects={handleBackToProjects}
          setToast={setToast}
        />
      </>
    )
  }

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
          onBack={currentProjectName ? () => navigateTo('project-dashboard') : handleBackToProjects}
          setToast={setToast}
          currentProjectName={currentProjectName}
          currentFlowId={currentFlowId}
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
          projectName={currentProjectName}
          flowId={currentFlowId}
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
          projectName={currentProjectName}
          applied={htmlApplied}
          step={step}
          canNavigateTo={canNavigateTo}
          navigateTo={navigateTo}
          onBack={handleBackToHtmlRecipe}
          onNext={handlePreviewNext}
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
        <HtmlMetadataStep
          projectName={currentProjectName}
          flowId={currentFlowId}
          applied={htmlApplied}
          step={step}
          canNavigateTo={canNavigateTo}
          navigateTo={navigateTo}
          onBack={() => navigateTo('html-preview')}
          onFinish={handleMetadataFinish}
          setToast={setToast}
          debugContext={debugContext}
        />
      </>
    )
  }

  return null
}
