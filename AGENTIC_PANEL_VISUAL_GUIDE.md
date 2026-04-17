# AgenticPanel Architecture - Visual Guide

## Component Hierarchy

```
App.jsx (Root)
├── Toast (global)
└── Conditional Rendering (ONE at a time):
    ├── ProjectLandingStep
    ├── ProjectDashboardStep
    ├── HtmlUploadStep
    ├── HtmlRecipeStep
    │   ├── AppHeader
    │   ├── Breadcrumbs
    │   ├── [Recipe panel]
    │   ├── [JSON response panel]
    │   └── AgenticPanel ← MOUNTED HERE
    ├── HtmlPreviewStep
    └── HtmlMetadataStep
```

---

## State Hierarchy

```
App.jsx (PERSISTENT STATE)
│
├─ Navigation State
│  ├─ step: 'html-recipe' (current)
│  └─ animDir: 'forward' | 'backward'
│
├─ Project State
│  ├─ currentProjectName: string
│  ├─ currentFlowId: string
│  ├─ htmlProject: { projectName, flowId, zones, selections, repeatableSlides }
│  ├─ htmlUploadSession: { templateId, fileName, slideCount, trees, ... }
│  ├─ htmlApplied: { outputFile, previewHtml, roundId, slideCount }
│  └─ pendingFlowName: string
│
├─ Recipe State (PRESERVED ACROSS NAVIGATION)
│  └─ htmlRecipeState: {
│      recipe: string,
│      globalPrompt: string,
│      jsonInput: string,
│      recipeGenerationId: string
│    }
│
├─ AI Response State (PRESERVED ACROSS NAVIGATION)
│  └─ htmlAiResponse: { raw, validated, validationResult }
│
└─ UI State
   └─ toast: { message, type }

    ↓ (props down)
    
HtmlRecipeStep (LOCAL + PARENT PROPS)
│
├─ From App.jsx Props:
│  ├─ project: { zones, selections, repeatableSlides }
│  ├─ projectName: string
│  ├─ flowId: string
│  ├─ recipeState: { recipe, globalPrompt, jsonInput }
│  ├─ navigateTo, canNavigateTo, step
│  └─ setToast
│
├─ Local State (LOST ON UNMOUNT):
│  ├─ recipe: string (initialized from recipeState.recipe)
│  ├─ globalPrompt: string (initialized from recipeState.globalPrompt)
│  ├─ loadingRecipe: boolean
│  ├─ jsonInput: string (initialized from recipeState.jsonInput)
│  ├─ validation: object
│  ├─ applying: boolean
│  ├─ viewMode: 'edit' | 'preview'
│  ├─ shouldAutoPreview: boolean
│  └─ validateTimerRef: ref
│
└─ Callbacks (update App.jsx):
   ├─ onRecipeStateChange(updates) → App.jsx.setHtmlRecipeState()
   ├─ onAiResponseChange(response) → App.jsx.setHtmlAiResponse()
   ├─ onApplied(result) → App.jsx.setHtmlApplied() + navigateTo('html-preview')
   └─ onBack() → navigateTo('html-upload')

    ↓ (props down)
    
AgenticPanel (LOCAL STATE ONLY - DESTROYED ON UNMOUNT)
│
├─ Props (read-only):
│  ├─ projectName: string
│  ├─ recipe: string
│  ├─ zones: array
│  ├─ repeatableSlides: array
│  └─ onJsonReady: callback
│
├─ Local State (ALL LOST ON UNMOUNT):
│  ├─ status: 'idle' | 'planning' | 'confirming' | 'running' | 'done' | 'error'
│  ├─ phase: 'analyzing' | 'planning' | 'generating' | 'assembling'
│  ├─ logs: string[] (activity log)
│  ├─ agents: object[] (agent status)
│  ├─ plan: object (plan from /agentic/plan)
│  ├─ errorMsg: string
│  ├─ elapsed: number (seconds)
│  ├─ summaryMode: 'use' | 'regenerate'
│  └─ customPrompt: string
│
├─ Refs (ALL LOST ON UNMOUNT):
│  ├─ logEndRef: ref
│  ├─ timerRef: ref
│  └─ abortRef: ref
│
└─ Callbacks (update parent):
   └─ onJsonReady(json) → HtmlRecipeStep.handleJsonChange(json)
```

---

## Navigation Flow

```
START: App.jsx (step = 'project-landing')
│
├─ ProjectLandingStep
│  └─ User selects project
│     └─ onProjectSelected(projectName)
│        └─ App.jsx.handleProjectSelected()
│           ├─ setCurrentProjectName(projectName)
│           └─ navigateTo('project-dashboard')
│
├─ ProjectDashboardStep (step = 'project-dashboard')
│  ├─ User selects existing flow
│  │  └─ onFlowSelected(flowId)
│  │     └─ App.jsx.handleFlowSelected()
│  │        ├─ setCurrentFlowId(flowId)
│  │        └─ navigateTo('html-upload')
│  │
│  └─ User creates new flow
│     └─ onNewFlow(flowName)
│        └─ App.jsx.handleNewFlow()
│           ├─ Reset all state
│           ├─ setPendingFlowName(flowName)
│           └─ navigateTo('html-upload')
│
├─ HtmlUploadStep (step = 'html-upload')
│  ├─ User uploads HTML file
│  ├─ User makes selections
│  └─ User creates project
│     └─ onProjectCreated(project)
│        └─ App.jsx.handleHtmlProjectCreated()
│           ├─ setHtmlProject(project)
│           ├─ setCurrentProjectName(project.projectName)
│           ├─ setCurrentFlowId(project.flowId)
│           └─ navigateTo('html-recipe')
│
├─ HtmlRecipeStep (step = 'html-recipe')
│  │
│  ├─ AgenticPanel MOUNTED HERE
│  │  │
│  │  ├─ User clicks "Generate with AI"
│  │  │  └─ handleGenerate()
│  │  │     ├─ setStatus('planning')
│  │  │     ├─ API /api/opencode/agentic/plan (SSE)
│  │  │     └─ setStatus('confirming')
│  │  │
│  │  ├─ User clicks "Accept & Generate"
│  │  │  └─ handleAccept()
│  │  │     ├─ setStatus('running')
│  │  │     ├─ API /api/opencode/agentic/run (SSE)
│  │  │     ├─ onJsonReady(generatedJson)
│  │  │     └─ setStatus('done')
│  │  │
│  │  └─ User clicks "Cancel"
│  │     └─ handleCancel()
│  │        └─ setStatus('idle')
│  │
│  ├─ User manually edits JSON
│  │  └─ jsonInput is updated
│  │     └─ validation runs
│  │
│  ├─ User clicks "Back to template"
│  │  └─ onBack()
│  │     └─ App.jsx.handleBackToHtmlUpload()
│  │        ├─ HtmlRecipeStep UNMOUNTED
│  │        ├─ AgenticPanel UNMOUNTED (STATE DESTROYED)
│  │        └─ navigateTo('html-upload')
│  │
│  └─ User clicks "Apply content"
│     └─ handleApply()
│        ├─ API /api/html-flow/apply-content
│        ├─ onApplied(result)
│        └─ App.jsx.handleHtmlApplied()
│           ├─ setHtmlApplied(result)
│           ├─ HtmlRecipeStep UNMOUNTED
│           ├─ AgenticPanel UNMOUNTED (STATE DESTROYED)
│           └─ navigateTo('html-preview')
│
├─ HtmlPreviewStep (step = 'html-preview')
│  ├─ User reviews content
│  │
│  ├─ User clicks "Back to recipe"
│  │  └─ onBack()
│  │     └─ App.jsx.handleBackToHtmlRecipe()
│  │        ├─ setHtmlApplied(null)
│  │        └─ navigateTo('html-recipe')
│  │           └─ HtmlRecipeStep RE-MOUNTED
│  │              └─ AgenticPanel RE-MOUNTED (FRESH STATE)
│  │
│  └─ User clicks "Next"
│     └─ onNext()
│        └─ App.jsx.handlePreviewNext()
│           └─ navigateTo('html-metadata')
│
└─ HtmlMetadataStep (step = 'html-metadata')
   ├─ User assigns metadata
   │
   ├─ User clicks "Back"
   │  └─ navigateTo('html-preview')
   │
   └─ User clicks "Finish"
      └─ onFinish()
         └─ App.jsx.handleMetadataFinish()
            ├─ setHtmlApplied(null)
            ├─ setCurrentProjectName(null)
            ├─ setCurrentFlowId(null)
            └─ navigateTo('project-dashboard')
```

---

## AgenticPanel Lifecycle

```
MOUNTED: HtmlRecipeStep rendered, step === 'html-recipe'
    ↓
Initial State:
- status = 'idle'
- phase = ''
- logs = []
- agents = []
- plan = null
- errorMsg = ''
- elapsed = 0
- summaryMode = 'use'
- customPrompt = ''
    ↓
User Interaction: View recipe (prop), Click "Generate with AI"
    ↓
Phase 1: Planning
- status = 'planning'
- phase = 'analyzing'
- Fetch /agentic/plan
- Stream events (SSE)
- Append logs
- Update phase
    ↓
Confirmation:
- status = 'confirming'
- Display plan card
- User reviews agents
    ↓
    ├─ Cancel ──→ handleCancel()
    │            setStatus('idle')
    │            Reset all state
    │            [IDLE STATE - ready for next attempt]
    │
    └─ Accept ──→ handleAccept()
                 status = 'running'
                 Fetch /agentic/run
                 Stream events
                 Update phase
                 Update agents
                 Update logs
                    ↓
                 Generation Done
                 status = 'done'
                 onJsonReady(json)
                 HtmlRecipeStep updates jsonInput
                    ↓
                 User Reviews JSON:
                 - Can edit manually
                 - Can regenerate
                 - Can apply content
                    ↓
                 User Navigates Away:
                 - Clicks Back
                 - Clicks Apply
                 - Clicks Breadcrumb
                    ↓
UNMOUNTED: HtmlRecipeStep unmounted, step !== 'html-recipe'
STATE DESTROYED:
- status = undefined
- phase = undefined
- logs = undefined
- agents = undefined
- plan = undefined
- errorMsg = undefined
- elapsed = undefined
- summaryMode = undefined
- customPrompt = undefined
- All refs garbage collected
    ↓
User Returns to html-recipe Step (e.g., from Preview)
    ↓
RE-MOUNTED: HtmlRecipeStep rendered again
AgenticPanel starts FRESH with initial state
```

---

## Data Flow: JSON Generation

```
User clicks "Generate with AI"
    ↓
AgenticPanel.handleGenerate()
    ↓
POST /api/opencode/agentic/plan
    ↓
Server streams SSE events:
- event: phase → setPhase('analyzing')
- event: log → appendLog(message)
- event: plan → setPlan(data), setStatus('confirming')
    ↓
User reviews plan and clicks "Accept & Generate"
    ↓
AgenticPanel.handleAccept()
    ↓
POST /api/opencode/agentic/run
    ↓
Server streams SSE events:
- event: phase → setPhase('generating')
- event: log → appendLog(message)
- event: agents → setAgents(data)
- event: agent_update → updateAgent(id, state)
- event: done →
  ├─ setStatus('done')
  ├─ onJsonReady(generatedJson)
  │  └─ HtmlRecipeStep.handleJsonChange(json)
  │     ├─ setJsonInput(json)
  │     ├─ onRecipeStateChange({ jsonInput: json })
  │     │  └─ App.jsx.setHtmlRecipeState({ jsonInput: json })
  │     ├─ validateJson(json)
  │     │  └─ POST /api/html-flow/validate-json
  │     │     └─ setValidation(result)
  │     └─ setShouldAutoPreview(true)
  │        └─ Auto-switch to preview mode
  └─ setToast({ message: '...', type: 'success' })
    ↓
User reviews JSON in textarea
    ↓
User clicks "Apply content"
    ↓
HtmlRecipeStep.handleApply()
    ↓
POST /api/html-flow/apply-content
    ↓
onApplied(result)
    ↓
App.jsx.handleHtmlApplied()
    ↓
setHtmlApplied(result)
navigateTo('html-preview')
    ↓
HtmlRecipeStep UNMOUNTED
AgenticPanel UNMOUNTED (STATE DESTROYED)
HtmlPreviewStep MOUNTED
```

---

## Key Points Summary

1. **One Step at a Time**
   - App.jsx conditionally renders only one step
   - Switching steps unmounts old, mounts new

2. **AgenticPanel is Ephemeral**
   - Mounted inside HtmlRecipeStep
   - Destroyed when leaving html-recipe
   - No state persistence across navigation

3. **Parent State is Persistent**
   - App.jsx holds htmlRecipeState
   - Survives navigation away and back
   - Recipe, globalPrompt, jsonInput are preserved

4. **State Flows Down, Updates Flow Up**
   - Parent passes state as props
   - Child updates parent via callbacks
   - Grandparent state survives navigation

5. **No Direct State Sharing**
   - AgenticPanel doesn't access App.jsx state
   - Communication is via props and callbacks
   - HtmlRecipeStep acts as intermediary

6. **Fresh Start on Return**
   - If user navigates away and back
   - AgenticPanel is re-mounted with fresh state
   - Previous generation attempts are lost
   - But recipe, globalPrompt, jsonInput are restored from App.jsx
