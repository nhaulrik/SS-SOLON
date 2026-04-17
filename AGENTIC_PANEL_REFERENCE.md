# AgenticPanel Architecture - Quick Reference

## File Locations

```
C:\source\SOLON\
├── client\src\
│   ├── App.jsx                              [ROOT NAVIGATION CONTROL]
│   ├── steps\
│   │   ├── HtmlRecipeStep.jsx              [AGENTIC PANEL PARENT]
│   │   ├── HtmlUploadStep.jsx
│   │   ├── HtmlPreviewStep.jsx
│   │   ├── HtmlMetadataStep.jsx
│   │   ├── ProjectLandingStep.jsx
│   │   └── ProjectDashboardStep.jsx
│   └── components\
│       ├── AgenticPanel.jsx                [AGENTIC PANEL COMPONENT]
│       ├── AgenticPanel.module.css
│       ├── AppHeader.jsx
│       ├── Breadcrumbs.jsx
│       └── [other components...]
```

---

## 1. Main Navigation Container

### File: `C:\source\SOLON\client\src\App.jsx`

#### Step Definition
- **Lines 10-17:** ALL_STEPS array defining the 6 navigation steps

#### Step State Management
- **Line 21:** `const [step, setStep] = useState('project-landing')`
- **Line 22:** `const [animDir, setAnimDir] = useState('forward')`
- **Lines 24-29:** `navigateTo()` callback function

#### Conditional Step Rendering
- **Lines 188-197:** `if (step === 'project-landing')`
- **Lines 200-212:** `if (step === 'project-dashboard')`
- **Lines 215-231:** `if (step === 'html-upload')`
- **Lines 234-255:** `if (step === 'html-recipe')`  ← **AGENTIC PANEL RENDERED HERE**
- **Lines 258-274:** `if (step === 'html-preview')`
- **Lines 277-294:** `if (step === 'html-metadata')`

#### State Variables (Preserved Across Navigation)
- **Line 58:** `const [htmlUploadSession, setHtmlUploadSession]`
- **Line 63:** `const [htmlProject, setHtmlProject]`
- **Line 66:** `const [htmlApplied, setHtmlApplied]`
- **Lines 72-77:** `const [htmlRecipeState, setHtmlRecipeState]` ← **PRESERVED**
- **Line 80:** `const [htmlAiResponse, setHtmlAiResponse]` ← **PRESERVED**

#### State Update Callbacks
- **Lines 117-119:** `handleHtmlRecipeStateChange()` - updates htmlRecipeState
- **Lines 121-123:** `handleHtmlAiResponseChange()` - updates htmlAiResponse
- **Lines 85-92:** `handleHtmlProjectCreated()` - navigates to html-recipe
- **Lines 94-102:** `handleHtmlApplied()` - navigates to html-preview
- **Lines 104-107:** `handleBackToHtmlRecipe()` - clears htmlApplied, navigates back

#### Guard Function
- **Lines 125-134:** `canNavigateTo()` - prevents invalid navigation

---

## 2. AgenticPanel Parent Component

### File: `C:\source\SOLON\client\src\steps\HtmlRecipeStep.jsx`

#### Component Props (from App.jsx)
- **Line 41:** `project` - contains zones, selections, repeatableSlides
- **Line 42:** `projectName` - passed to AgenticPanel
- **Line 43:** `flowId` - passed to AgenticPanel
- **Line 48:** `onApplied()` - callback to App.jsx
- **Line 50:** `onRecipeStateChange()` - callback to App.jsx
- **Line 51:** `onAiResponseChange()` - callback to App.jsx
- **Line 52:** `recipeState` - from App.jsx (preserved state)

#### Local State Variables
- **Line 59:** `const [recipe, setRecipe]` - initialized from recipeState.recipe
- **Line 60:** `const [globalPrompt, setGlobalPrompt]` - initialized from recipeState.globalPrompt
- **Line 61:** `const [loadingRecipe, setLoadingRecipe]`
- **Line 64:** `const [jsonInput, setJsonInput]` - initialized from recipeState.jsonInput
- **Line 65:** `const [validation, setValidation]`
- **Line 66:** `const [applying, setApplying]`
- **Line 67:** `const [viewMode, setViewMode]` - 'edit' | 'preview'
- **Line 68:** `const [shouldAutoPreview, setShouldAutoPreview]`

#### AgenticPanel Rendering
- **Lines 327-337:** AgenticPanel component mount point
  ```jsx
  <AgenticPanel
    projectName={projectName}
    recipe={recipe}
    zones={zones}
    repeatableSlides={repeatableSlides}
    onJsonReady={(json) => {
      handleJsonChange(json)
      setShouldAutoPreview(true)
      setToast({ message: '...', type: 'success' })
    }}
  />
  ```

#### Key Callbacks
- **Lines 126-131:** `handleJsonChange()` - updates jsonInput and triggers validation
- **Lines 81-100:** `handleGenerateRecipe()` - API call to /api/html-flow/generate-recipe
- **Lines 103-124:** `validateJson()` - API call to /api/html-flow/validate-json
- **Lines 134-152:** `handleApply()` - API call to /api/html-flow/apply-content

---

## 3. AgenticPanel Component

### File: `C:\source\SOLON\client\src\components\AgenticPanel.jsx`

#### Component Definition
- **Line 60:** `export default function AgenticPanel({ projectName, recipe, zones, repeatableSlides, onJsonReady })`

#### State Variables (ALL LOCAL - DESTROYED ON UNMOUNT)
- **Line 62:** `const [status, setStatus]` - idle | planning | confirming | running | done | error
- **Line 63:** `const [phase, setPhase]` - analyzing | planning | generating | assembling
- **Line 64:** `const [logs, setLogs]` - activity log entries
- **Line 65:** `const [agents, setAgents]` - agent status array
- **Line 66:** `const [errorMsg, setErrorMsg]` - error message
- **Line 67:** `const [elapsed, setElapsed]` - elapsed time in seconds
- **Line 69:** `const [summaryMode, setSummaryMode]` - 'use' | 'regenerate'
- **Line 70:** `const [customPrompt, setCustomPrompt]` - custom instructions
- **Line 73:** `const [plan, setPlan]` - plan from /agentic/plan endpoint

#### Refs
- **Line 76:** `const logEndRef = useRef(null)` - for auto-scroll
- **Line 77:** `const timerRef = useRef(null)` - for elapsed timer
- **Line 78:** `const abortRef = useRef(null)` - for SSE abort control

#### Key Handlers
- **Lines 104-141:** `handleGenerate()` - Phase 1: calls /api/opencode/agentic/plan
  - Sets status to 'planning'
  - Streams SSE events (phase, log, plan, error)
  - Sets status to 'confirming' when plan received
  
- **Lines 145-191:** `handleAccept()` - Phase 2: calls /api/opencode/agentic/run
  - Sets status to 'running'
  - Streams SSE events (phase, log, agents, agent_update, done, error)
  - Calls `onJsonReady(data)` when done
  
- **Lines 193-202:** `handleCancel()` - resets to idle state

#### SSE Reader
- **Lines 19-43:** `readSSE()` - async generator to parse Server-Sent Events

#### Phase Config
- **Lines 47-52:** PHASES array - analyzing, planning, generating, assembling

---

## 4. State Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        App.jsx (ROOT)                       │
│                                                             │
│  State (PERSISTENT):                                        │
│  • step = 'html-recipe'                                     │
│  • htmlRecipeState = { recipe, globalPrompt, jsonInput }    │
│  • htmlAiResponse = { ... }                                 │
│  • htmlProject = { zones, selections, ... }                 │
│  • currentProjectName, currentFlowId                        │
│                                                             │
│  Callbacks:                                                 │
│  • navigateTo(newStep)                                      │
│  • handleHtmlRecipeStateChange(updates)                     │
│  • handleHtmlAiResponseChange(aiResponse)                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
                        [CONDITIONAL RENDER]
                    if (step === 'html-recipe')
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   HtmlRecipeStep.jsx                        │
│                                                             │
│  Props (from App.jsx):                                      │
│  • projectName, flowId, project { zones, ... }             │
│  • navigateTo, canNavigateTo, step                          │
│  • recipeState { recipe, globalPrompt, jsonInput }          │
│  • onRecipeStateChange, onAiResponseChange                  │
│  • onApplied, onBack, setToast                              │
│                                                             │
│  Local State:                                               │
│  • recipe, globalPrompt, loadingRecipe                      │
│  • jsonInput, validation, applying, viewMode                │
│  • shouldAutoPreview                                        │
│                                                             │
│  Callbacks:                                                 │
│  • handleJsonChange(value)                                  │
│    └─→ setJsonInput(value)                                  │
│    └─→ onRecipeStateChange({ jsonInput: value })            │
│    └─→ [updates App.jsx htmlRecipeState]                    │
│                                                             │
│  • handleApply()                                            │
│    └─→ API /api/html-flow/apply-content                     │
│    └─→ onApplied(result)                                    │
│    └─→ [App.jsx navigates to html-preview]                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
                      [ALWAYS MOUNTED HERE]
┌─────────────────────────────────────────────────────────────┐
│                   AgenticPanel.jsx                          │
│                                                             │
│  Props (from HtmlRecipeStep):                               │
│  • projectName, recipe, zones, repeatableSlides             │
│  • onJsonReady(json)                                        │
│                                                             │
│  State (LOCAL - DESTROYED ON UNMOUNT):                      │
│  • status: idle|planning|confirming|running|done|error      │
│  • phase, logs, agents, plan, errorMsg, elapsed             │
│  • summaryMode, customPrompt                                │
│                                                             │
│  Lifecycle:                                                 │
│  1. User clicks "Generate with AI"                          │
│     └─→ handleGenerate()                                    │
│     └─→ status = 'planning'                                 │
│     └─→ API /api/opencode/agentic/plan (SSE)               │
│     └─→ status = 'confirming' (user reviews plan)           │
│                                                             │
│  2. User clicks "Accept & Generate"                         │
│     └─→ handleAccept()                                      │
│     └─→ status = 'running'                                  │
│     └─→ API /api/opencode/agentic/run (SSE)                │
│     └─→ onJsonReady(generatedJson)                          │
│     └─→ [HtmlRecipeStep.handleJsonChange(json)]             │
│     └─→ [App.jsx htmlRecipeState updated]                   │
│     └─→ [JSON pasted into HtmlRecipeStep's textarea]        │
│                                                             │
│  3. User navigates away (e.g., to html-preview)             │
│     └─→ HtmlRecipeStep UNMOUNTED                            │
│     └─→ AgenticPanel UNMOUNTED                              │
│     └─→ ALL AgenticPanel state DESTROYED                    │
│     └─→ But App.jsx state PRESERVED                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Navigation Paths

### From html-recipe Step

```
HtmlRecipeStep
├── onBack (line 245)
│   └─→ handleBackToHtmlUpload (App.jsx line 53-55)
│       └─→ navigateTo('html-upload')
│           └─→ UNMOUNTS HtmlRecipeStep
│           └─→ UNMOUNTS AgenticPanel
│           └─→ MOUNTS HtmlUploadStep
│
├── onApplied (line 246)
│   └─→ handleHtmlApplied (App.jsx line 94-102)
│       └─→ setHtmlApplied(result)
│       └─→ navigateTo('html-preview')
│           └─→ UNMOUNTS HtmlRecipeStep
│           └─→ UNMOUNTS AgenticPanel
│           └─→ MOUNTS HtmlPreviewStep
│
└── [User clicks "Apply content" button]
    └─→ handleApply() (HtmlRecipeStep line 134-152)
        └─→ API /api/html-flow/apply-content
        └─→ onApplied(result)
        └─→ navigateTo('html-preview')
```

---

## 6. Key Integration Points

### How AgenticPanel Integrates with HtmlRecipeStep

1. **AgenticPanel receives recipe** (HtmlRecipeStep line 329)
   - If recipe is empty, button shows "Generate the recipe first ↑"
   - If recipe exists, button is enabled

2. **User clicks "Generate with AI"**
   - AgenticPanel.handleGenerate() starts planning phase
   - Calls /api/opencode/agentic/plan
   - Streams planning logs and phases
   - Returns a plan for user confirmation

3. **User clicks "Accept & Generate"**
   - AgenticPanel.handleAccept() starts running phase
   - Calls /api/opencode/agentic/run
   - Streams agent updates and logs
   - Returns generated JSON

4. **AgenticPanel calls onJsonReady(json)**
   - HtmlRecipeStep.handleJsonChange(json) is invoked
   - jsonInput is updated
   - Validation is triggered
   - Textarea is populated with JSON
   - Auto-preview switches to preview mode (if enabled)
   - Toast shows "JSON generated — review and apply when ready"

5. **User reviews and clicks "Apply content"**
   - HtmlRecipeStep.handleApply() is called
   - API /api/html-flow/apply-content is invoked
   - Result is passed to App.jsx via onApplied()
   - Navigation to html-preview occurs
   - HtmlRecipeStep (and AgenticPanel) are UNMOUNTED

---

## 7. What Happens When Navigating Away

### Navigation Away from html-recipe

```
User clicks "Back to template" (HtmlRecipeStep line 312)
  ↓
HtmlRecipeStep.onBack() is called
  ↓
App.jsx.handleBackToHtmlUpload() is called
  ↓
navigateTo('html-upload')
  ↓
App.jsx: step = 'html-upload'
  ↓
Conditional render: step !== 'html-recipe'
  ↓
HtmlRecipeStep is UNMOUNTED
  ↓
AgenticPanel is UNMOUNTED
  ↓
AgenticPanel state is DESTROYED:
  ✗ status = 'idle' (lost)
  ✗ phase = '' (lost)
  ✗ logs = [] (lost)
  ✗ agents = [] (lost)
  ✗ plan = null (lost)
  ✗ errorMsg = '' (lost)
  ✗ elapsed = 0 (lost)
  ✗ summaryMode = 'use' (lost)
  ✗ customPrompt = '' (lost)
  ↓
HtmlUploadStep is MOUNTED
```

### What Survives Navigation

In App.jsx:
- ✓ htmlRecipeState = { recipe, globalPrompt, jsonInput }
- ✓ htmlAiResponse = { raw, validated, validationResult }
- ✓ htmlProject = { zones, selections, ... }
- ✓ currentProjectName, currentFlowId

When user navigates back to html-recipe:
- HtmlRecipeStep is re-mounted with preserved state
- recipe, globalPrompt, jsonInput are restored
- AgenticPanel is re-mounted with fresh state (starts over)

---

## 8. Debug Context

### App.jsx debugContext (Lines 137-171)

The debugContext object is passed to all steps for debugging:

```jsx
const debugContext = {
  timestamp:  new Date().toISOString(),
  step,
  uploadSession: { ... },
  project: { ... },
  recipe: htmlRecipe || null,
  applied: { ... },
  aiResponse: htmlAiResponse,
}
```

This is shown in the AppHeader debug modal and helps track state across navigation.

---

## Summary Table

| Aspect | Details |
|--------|---------|
| **Root Navigation** | App.jsx, conditional rendering based on `step` state |
| **AgenticPanel Location** | Inside HtmlRecipeStep (lines 327-337) |
| **AgenticPanel Mount** | When step === 'html-recipe' |
| **AgenticPanel Unmount** | When navigating away from html-recipe |
| **AgenticPanel State Preservation** | NONE - completely destroyed on unmount |
| **Parent State Preservation** | HtmlRecipeStep's local state is lost, but App.jsx state survives |
| **App.jsx Preserved State** | htmlRecipeState, htmlAiResponse, htmlProject, htmlApplied |
| **Key Callback** | onJsonReady() - passes generated JSON to HtmlRecipeStep |
| **Navigation Guard** | canNavigateTo() - prevents invalid step transitions |
| **Total Steps** | 6 (project-landing, project-dashboard, html-upload, html-recipe, html-preview, html-metadata) |
