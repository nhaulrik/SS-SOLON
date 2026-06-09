import { useState, useCallback, useEffect } from 'react'
import Toast                from './components/Toast.jsx'
import ProjectLandingStep   from './steps/ProjectLandingStep.jsx'
import ProjectDashboardStep from './steps/ProjectDashboardStep.jsx'
import HtmlUploadStep       from './steps/HtmlUploadStep.jsx'
import HtmlRecipeStep       from './steps/HtmlRecipeStep.jsx'
import HtmlPreviewStep      from './steps/HtmlPreviewStep.jsx'
import HtmlMetadataStep     from './steps/HtmlMetadataStep.jsx'

const ALL_STEPS = [
  'project-landing',
  'project-dashboard',
  'html-upload',
  'html-recipe',
  'html-preview',
  'html-metadata',
]

export default function App() {
  const [appName, setAppName] = useState('Slide Studio')

  useEffect(() => {
    fetch('/api/app-info')
      .then(r => r.ok ? r.json() : null)
      .then(info => { if (info?.name) { setAppName(info.name); document.title = info.name } })
      .catch(() => {})
  }, [])

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

  const handleBackToHtmlUpload = useCallback(() => {
    navigateTo('html-upload')
  }, [navigateTo])

  // ── HTML flow state ────────────────────────────────────────────
  const [htmlUploadSession, setHtmlUploadSession] = useState(null)
  // { templateId, fileName, slideCount, trees, selections, previewHtml, rawHtml }

  const [pendingFlowName, setPendingFlowName] = useState(null)

  const [htmlProject, setHtmlProject] = useState(null)
  // { projectName, flowId, zones, selections, repeatableSlides, fullSlideGeneration }

  const [htmlApplied, setHtmlApplied] = useState(null)
  // { outputFile, previewHtml, roundId, slideCount }

  const [skippedSlides, setSkippedSlides] = useState([])

  // ── AI response tracking (for debug context) ────────────────────
  const [htmlAiResponse, setHtmlAiResponse] = useState(null)

  // ── Agentic generation state (persists across all navigation) ──────────────
  const [agenticStatus,       setAgenticStatus]       = useState('idle')
  const [agenticPhase,        setAgenticPhase]        = useState('')
  const [agenticLogs,         setAgenticLogs]         = useState([])
  const [agenticAgents,       setAgenticAgents]       = useState([])
  const [agenticErrorMsg,     setAgenticErrorMsg]     = useState('')
  const [agenticElapsed,      setAgenticElapsed]      = useState(0)
  const [agenticContentPrompt,  setAgenticContentPrompt]  = useState('')
  const [agenticPlan,           setAgenticPlan]           = useState(null)

  // ── Preview → recipe regeneration request ─────────────────────────────────
  const [highlightedAgent, setHighlightedAgent] = useState(null)
  // { id: 'slideKey_N', label: 'Instance label' } | null

  // ── Global toast ───────────────────────────────────────────────
  const [toast, setToast] = useState(null)

  const handleRequestRegenerate = useCallback((outputSlideIdx) => {
    if (!agenticPlan?.instances || !htmlProject) {
      setToast({ message: 'Generation plan not available — re-run generation first', type: 'error' })
      return
    }
    const zones = htmlProject.zones ?? []
    const repeatableSlides = htmlProject.repeatableSlides ?? []
    const templateSlideCount = zones.length > 0
      ? Math.max(...zones.map(z => z.slideIndex))
      : repeatableSlides.reduce((m, rs) => Math.max(m, rs.slideIndex), 0)

    const repByTemplateIdx = new Map(repeatableSlides.map(rs => [rs.slideIndex, rs]))
    let outputIdx = 0
    let agentId = null
    outer: for (let t = 1; t <= templateSlideCount; t++) {
      if (repByTemplateIdx.has(t)) {
        const rs = repByTemplateIdx.get(t)
        const count = agenticPlan.instances[rs.key] ?? 0
        for (let i = 0; i < count; i++) {
          if (outputIdx === outputSlideIdx) { agentId = `${rs.key}_${i}`; break outer }
          outputIdx++
        }
      } else {
        if (outputIdx === outputSlideIdx) break outer // block slide — no agent
        outputIdx++
      }
    }

    if (!agentId) {
      setToast({ message: 'This is a fixed slide and cannot be individually regenerated', type: 'info' })
      return
    }
    const agentEntry = agenticPlan.agentPlan?.find(a => a.id === agentId)
    setHighlightedAgent({ id: agentId, label: agentEntry?.label ?? agentId })
    navigateTo('html-recipe')
  }, [agenticPlan, htmlProject, navigateTo, setToast])

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
      slideNames:  result.slideNames ?? [],
    })
    // Load skipped slides from project metadata
    setSkippedSlides(htmlProject?._metadata?.skippedSlides ?? [])
    navigateTo('html-preview')
  }, [navigateTo, htmlProject])

  const handlePreviewHtmlChange = useCallback((newHtml) => {
    setHtmlApplied(prev => ({
      ...prev,
      previewHtml: newHtml,
    }))
  }, [])

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

  const handleHtmlAiResponseChange = useCallback((aiResponse) => {
    setHtmlAiResponse(aiResponse)
  }, [])

  // ── canNavigateTo guard ────────────────────────────────────────
  const canNavigateTo = useCallback((s) => {
    if (s === 'project-landing')   return true
    if (s === 'project-dashboard') return !!currentProjectName
    if (s === 'html-upload')       return step === 'html-recipe' || !!currentFlowId
    if (s === 'html-recipe')       return !!htmlProject
    if (s === 'html-preview')      return !!(htmlProject && htmlApplied)
    if (s === 'html-metadata')     return !!(htmlProject && htmlApplied)
    return false
  }, [htmlProject, htmlApplied, step, currentProjectName, currentFlowId])

  // ── Debug context ──────────────────────────────────────────────
  const debugContext = {
    timestamp:  new Date().toISOString(),
    step,
    uploadSession: htmlUploadSession
      ? {
          templateId:       htmlUploadSession.templateId,
          fileName:         htmlUploadSession.fileName,
          slideCount:       htmlUploadSession.slideCount,
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

  const handleNewFlow = useCallback((flowName) => {
    setCurrentFlowId(null)
    setHtmlUploadSession(null)
    setHtmlProject(null)
    setHtmlApplied(null)
    setPendingFlowName(flowName || null)
    navigateTo('html-upload')
  }, [navigateTo])

  // ── Header wrapper ─────────────────────────────────────────────
  const AppHeader = ({ children }) => (
    <div className="app">
      <header>
        <div>
          <h1>{appName}</h1>
          <div className="header-actions">
            <a href="/docs.html" target="_blank" rel="noopener noreferrer" className="docs-link">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="7" />
                <path d="M8 5v6M5 8h6" />
              </svg>
              Docs
            </a>
          </div>
        </div>
      </header>
      {children}
    </div>
  )

  if (step === 'project-landing') {
    return (
      <AppHeader>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <ProjectLandingStep
          appName={appName}
          onProjectSelected={handleProjectSelected}
          setToast={setToast}
        />
      </AppHeader>
    )
  }

  if (step === 'project-dashboard' && currentProjectName) {
    return (
      <AppHeader>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <ProjectDashboardStep
          projectName={currentProjectName}
          onFlowSelected={handleFlowSelected}
          onNewFlow={handleNewFlow}
          onBackToProjects={handleBackToProjects}
          setToast={setToast}
        />
      </AppHeader>
    )
  }

  if (step === 'html-upload') {
    return (
      <AppHeader>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <HtmlUploadStep
          {...sharedProps}
          appName={appName}
          initialSession={htmlUploadSession}
          onSessionChange={setHtmlUploadSession}
          onProjectCreated={handleHtmlProjectCreated}
          onBack={currentProjectName ? () => navigateTo('project-dashboard') : handleBackToProjects}
          setToast={setToast}
          currentProjectName={currentProjectName}
          currentFlowId={currentFlowId}
          pendingFlowName={pendingFlowName}
        />
      </AppHeader>
    )
  }

  if (step === 'html-recipe' && htmlProject) {
    return (
      <AppHeader>
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
             onAiResponseChange={handleHtmlAiResponseChange}
             setToast={setToast}
             debugContext={debugContext}
            // Agentic state
            agenticStatus={agenticStatus}
            agenticPhase={agenticPhase}
            agenticLogs={agenticLogs}
            agenticAgents={agenticAgents}
            agenticErrorMsg={agenticErrorMsg}
            agenticElapsed={agenticElapsed}
            agenticContentPrompt={agenticContentPrompt}
            agenticPlan={agenticPlan}
            // Agentic setters
            setAgenticStatus={setAgenticStatus}
            setAgenticPhase={setAgenticPhase}
            setAgenticLogs={setAgenticLogs}
            setAgenticAgents={setAgenticAgents}
            setAgenticErrorMsg={setAgenticErrorMsg}
            setAgenticElapsed={setAgenticElapsed}
            setAgenticContentPrompt={setAgenticContentPrompt}
            setAgenticPlan={setAgenticPlan}
            // Preview-initiated regeneration
            highlightedAgent={highlightedAgent}
            onHighlightCleared={() => setHighlightedAgent(null)}
          />
      </AppHeader>
    )
  }

    if (step === 'html-preview' && htmlProject && htmlApplied) {
      return (
        <AppHeader>
          <Toast toast={toast} onDismiss={() => setToast(null)} />
          <HtmlPreviewStep
            projectName={currentProjectName}
            flowName={htmlProject.name || currentFlowId}
            templateFilename={htmlProject.templateFilename || currentProjectName}
            applied={htmlApplied}
            flowId={currentFlowId}
            step={step}
            canNavigateTo={canNavigateTo}
            navigateTo={navigateTo}
            onBack={handleBackToHtmlRecipe}
            onNext={handlePreviewNext}
            onPreviewHtmlChange={handlePreviewHtmlChange}
            setToast={setToast}
            debugContext={debugContext}
            repeatableSlides={htmlProject?.repeatableSlides ?? []}
            onRequestRegenerate={handleRequestRegenerate}
          />
        </AppHeader>
      )
    }

    if (step === 'html-metadata' && htmlProject && htmlApplied) {
      return (
        <AppHeader>
          <Toast toast={toast} onDismiss={() => setToast(null)} />
          <HtmlMetadataStep
            projectName={currentProjectName}
            flowName={htmlProject.name || currentFlowId}
            templateFilename={htmlProject.templateFilename || currentProjectName}
            flowId={currentFlowId}
            applied={htmlApplied}
            slideNames={htmlApplied?.slideNames ?? []}
            step={step}
            canNavigateTo={canNavigateTo}
            navigateTo={navigateTo}
            onBack={() => navigateTo('html-preview')}
            onFinish={handleMetadataFinish}
            setToast={setToast}
            debugContext={debugContext}
            skippedSlides={skippedSlides}
          />
        </AppHeader>
      )
    }

  return null
}
