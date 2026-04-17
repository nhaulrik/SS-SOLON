# SOLON Navigation & AgenticPanel Architecture Analysis

## Overview
The SOLON project uses a **step-based navigation system** managed by the root `App.jsx` component. Each step is a full-page component that is conditionally rendered based on the current `step` state. AgenticPanel is mounted/unmounted with its parent step component.

---

## 1. Tab/Step Switching Mechanism

### Main Navigation Container: `App.jsx` (Root Level)

**Location:** `C:\source\SOLON\client\src\App.jsx`

#### Step Definition (Lines 10-17)
```jsx
const ALL_STEPS = [
  'project-landing',
  'project-dashboard',
  'html-upload',
  'html-recipe',
  'html-preview',
  'html-metadata',
]
```

#### Step State Management (Lines 21-29)
```jsx
const [step,    setStep]    = useState('project-landing')
const [animDir, setAnimDir] = useState('forward')

const navigateTo = useCallback((newStep) => {
  const curr = ALL_STEPS.indexOf(step)
  const next = ALL_STEPS.indexOf(newStep)
  setAnimDir(next >= curr ? 'forward' : 'backward')
  setStep(newStep)
}, [step])
```

**Key Points:**
- `step` state holds the current step identifier
- `navigateTo()` callback function handles all step transitions
- Animation direction is determined by step order (forward/backward)
- All steps are rendered conditionally using `if (step === '...')` blocks

#### Conditional Step Rendering (Lines 188-297)

The App.jsx renders steps as mutually exclusive conditional blocks:

```jsx
if (step === 'project-landing') {
  return <ProjectLandingStep ... />
}

if (step === 'project-dashboard' && currentProjectName) {
  return <ProjectDashboardStep ... />
}

if (step === 'html-upload') {
  return <HtmlUploadStep ... />
}

if (step === 'html-recipe' && htmlProject) {
  return <HtmlRecipeStep ... />
}

if (step === 'html-preview' && htmlProject && htmlApplied) {
  return <HtmlPreviewStep ... />
}

if (step === 'html-metadata' && htmlProject && htmlApplied) {
  return <HtmlMetadataStep ... />
}
```

**Only ONE step component is rendered at a time.**

---

## 2. AgenticPanel Mount/Unmount Behavior

### Location: `HtmlRecipeStep.jsx`

**File:** `C:\source\SOLON\client\src\steps\HtmlRecipeStep.jsx`

#### AgenticPanel Rendering (Lines 327-337)

AgenticPanel is rendered **inside HtmlRecipeStep**:

```jsx
<AgenticPanel
  projectName={projectName}
  recipe={recipe}
  zones={zones}
  repeatableSlides={repeatableSlides}
  onJsonReady={(json) => {
    handleJsonChange(json)
    setShouldAutoPreview(true)
    setToast({ message: 'JSON generated — review and apply when ready', type: 'success' })
  }}
/>
```

### Mount/Unmount Lifecycle

**AgenticPanel is DESTROYED when:**
1. User navigates away from `html-recipe` step
2. The parent `HtmlRecipeStep` component is unmounted
3. This happens when `step !== 'html-recipe'` in App.jsx

**AgenticPanel is CREATED when:**
1. User navigates to `html-recipe` step
2. HtmlRecipeStep is mounted (conditional render)
3. AgenticPanel re-mounts from scratch with fresh state

**IMPORTANT:** AgenticPanel's internal state is **NOT preserved** across navigation:
- All state variables reset to initial values
- `status`, `phase`, `logs`, `agents`, `plan`, etc. are lost
- The component starts fresh every time it mounts

---

## 3. State Management Across Tab Switches

### Parent-Level State (App.jsx)

**State preserved across navigation:**

```jsx
// Lines 58-80 in App.jsx

// HTML upload session state
const [htmlUploadSession, setHtmlUploadSession] = useState(null)
// { templateId, fileName, slideCount, trees, selections, previewHtml, rawHtml }

// Project state
const [htmlProject, setHtmlProject] = useState(null)
// { projectName, flowId, zones, selections, repeatableSlides, fullSlideGeneration }

// Applied content state
const [htmlApplied, setHtmlApplied] = useState(null)
// { outputFile, previewHtml, roundId, slideCount }

// Recipe state (PRESERVED across navigation)
const [htmlRecipeState, setHtmlRecipeState] = useState({
  recipe:             '',
  globalPrompt:       '',
  jsonInput:          '',
  recipeGenerationId: null,
})

// AI response tracking
const [htmlAiResponse, setHtmlAiResponse] = useState(null)
```

### Flow of State to Child Steps

#### To HtmlRecipeStep (Lines 234-255)
```jsx
if (step === 'html-recipe' && htmlProject) {
  return (
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
      recipeState={htmlRecipeState}  // <-- PRESERVED STATE
      setToast={setToast}
      debugContext={debugContext}
    />
  )
}
```

#### State Preservation Pattern (Lines 117-123)
```jsx
const handleHtmlRecipeStateChange = useCallback((updates) => {
  setHtmlRecipeState(prev => ({ ...prev, ...updates }))
}, [])

const handleHtmlAiResponseChange = useCallback((aiResponse) => {
  setHtmlAiResponse(aiResponse)
}, [])
```

**How state is preserved:**
1. Parent App.jsx holds state variables for the entire flow
2. Child steps receive this state as props
3. Child steps call parent callbacks (`onRecipeStateChange`, etc.) to update parent state
4. When navigating away and back, parent state is still intact
5. Child step is re-mounted with the same parent state values

### State Lifecycle per Step

| Step | State Preserved from Parent | Component-Level State | Notes |
|------|----------------------------|----------------------|-------|
| html-upload | htmlUploadSession | Internal upload state | Session synced up to parent |
| html-recipe | htmlRecipeState, htmlAiResponse | Recipe, globalPrompt, jsonInput | Preserved across nav |
| html-preview | htmlApplied | currentSlide | Lost on nav away |
| html-metadata | htmlApplied | metadata | Lost on nav away |

---

## 4. Parent Components Holding AgenticPanel State

### Direct Parent: HtmlRecipeStep

**File:** `C:\source\SOLON\client\src\steps\HtmlRecipeStep.jsx`

#### HtmlRecipeStep's Local State (Lines 58-80)
```jsx
// ── Recipe state ────────────────────────────────────────────────────────────
const [recipe,        setRecipe]        = useState(recipeState.recipe)
const [globalPrompt,  setGlobalPrompt]  = useState(recipeState.globalPrompt)
const [loadingRecipe, setLoadingRecipe] = useState(false)

// ── JSON response ───────────────────────────────────────────────────────────
const [jsonInput,  setJsonInput]  = useState(recipeState.jsonInput)
const [validation, setValidation] = useState(null)
const [applying,   setApplying]   = useState(false)
const [viewMode,   setViewMode]   = useState('edit')   // 'edit' | 'preview'
const [shouldAutoPreview, setShouldAutoPreview] = useState(false)
```

#### How AgenticPanel Receives Data

AgenticPanel receives **read-only props** from HtmlRecipeStep:
```jsx
<AgenticPanel
  projectName={projectName}      // from App.jsx
  recipe={recipe}                // local state in HtmlRecipeStep
  zones={zones}                  // from htmlProject (App.jsx)
  repeatableSlides={repeatableSlides}  // from htmlProject (App.jsx)
  onJsonReady={(json) => { ... }}      // callback to update HtmlRecipeStep's jsonInput
/>
```

#### AgenticPanel State Flow

```
App.jsx (root state)
  ↓ (props)
HtmlRecipeStep (local state + parent props)
  ↓ (props)
AgenticPanel (local state only)
  ↑ (callback onJsonReady)
HtmlRecipeStep (updates jsonInput)
  ↑ (callback onRecipeStateChange)
App.jsx (updates htmlRecipeState)
```

### Grandparent: App.jsx

**File:** `C:\source\SOLON\client\src\App.jsx`

App.jsx holds the **persistent state** that survives navigation:

- `htmlRecipeState` (Lines 72-77) — preserved across tab switches
- `htmlAiResponse` (Line 80) — preserved across tab switches
- `htmlProject` (Line 63) — passed to HtmlRecipeStep
- `currentProjectName`, `currentFlowId` — passed to HtmlRecipeStep

---

## 5. Navigation Flow Diagram

```
App.jsx (step state machine)
├── if step === 'project-landing'
│   └── ProjectLandingStep
│       └── onProjectSelected → navigateTo('project-dashboard')
│
├── if step === 'project-dashboard'
│   └── ProjectDashboardStep
│       ├── onFlowSelected → navigateTo('html-upload')
│       └── onNewFlow → navigateTo('html-upload')
│
├── if step === 'html-upload'
│   └── HtmlUploadStep
│       ├── onProjectCreated → navigateTo('html-recipe')
│       └── onBack → navigateTo('project-dashboard')
│
├── if step === 'html-recipe' && htmlProject
│   └── HtmlRecipeStep
│       ├── AgenticPanel (MOUNTED HERE)
│       │   └── onJsonReady → handleJsonChange()
│       ├── onApplied → navigateTo('html-preview')
│       └── onBack → navigateTo('html-upload')
│
├── if step === 'html-preview'
│   └── HtmlPreviewStep
│       ├── onNext → navigateTo('html-metadata')
│       └── onBack → navigateTo('html-recipe')
│
└── if step === 'html-metadata'
    └── HtmlMetadataStep
        ├── onFinish → navigateTo('project-dashboard')
        └── onBack → navigateTo('html-preview')
```

---

## 6. Key Files & Line References

### Navigation Control
| File | Lines | Purpose |
|------|-------|---------|
| App.jsx | 10-17 | Step definitions |
| App.jsx | 21-29 | Step state & navigateTo() |
| App.jsx | 188-297 | Conditional step rendering |

### State Management
| File | Lines | Purpose |
|------|-------|---------|
| App.jsx | 58-80 | HTML flow state variables |
| App.jsx | 72-77 | htmlRecipeState (preserved) |
| App.jsx | 117-123 | State update callbacks |
| App.jsx | 125-134 | canNavigateTo guard function |

### AgenticPanel Integration
| File | Lines | Purpose |
|------|-------|---------|
| HtmlRecipeStep.jsx | 327-337 | AgenticPanel rendering |
| HtmlRecipeStep.jsx | 58-80 | HtmlRecipeStep local state |
| HtmlRecipeStep.jsx | 126-131 | handleJsonChange callback |
| AgenticPanel.jsx | 60-202 | Component definition & state |
| AgenticPanel.jsx | 104-141 | Phase 1: planning (SSE) |
| AgenticPanel.jsx | 145-191 | Phase 2: running (SSE) |

---

## 7. State Destruction & Recreation

### When AgenticPanel is Destroyed

```jsx
// In App.jsx, when step changes from 'html-recipe' to anything else:
if (step === 'html-recipe' && htmlProject) {
  // HtmlRecipeStep (and AgenticPanel inside it) is rendered
} else {
  // HtmlRecipeStep is NOT rendered
  // AgenticPanel is UNMOUNTED and destroyed
  // All its state is lost
}
```

### What Survives Navigation Away from html-recipe

**Preserved in App.jsx:**
- `htmlRecipeState` — the recipe, globalPrompt, jsonInput
- `htmlAiResponse` — the AI response metadata
- `htmlProject` — the zones and selections
- `htmlApplied` — the applied content (if any)

**Lost in HtmlRecipeStep:**
- `recipe`, `globalPrompt`, `jsonInput` (local copies)
- `validation`, `applying`, `viewMode`
- All AgenticPanel state

### What Happens on Return to html-recipe

1. HtmlRecipeStep is re-mounted
2. It initializes from `recipeState` prop (from App.jsx)
3. AgenticPanel is re-mounted with fresh state
4. The recipe, globalPrompt, jsonInput are restored
5. But AgenticPanel's generation progress is lost

---

## 8. Guard Function: canNavigateTo()

**Location:** App.jsx, Lines 125-134

```jsx
const canNavigateTo = useCallback((s) => {
  if (s === 'project-landing')   return true
  if (s === 'project-dashboard') return !!currentProjectName
  if (s === 'html-upload')       return step === 'html-recipe' || !!currentFlowId
  if (s === 'html-recipe')       return !!htmlProject
  if (s === 'html-preview')      return !!(htmlProject && htmlApplied)
  if (s === 'html-metadata')     return !!(htmlProject && htmlApplied)
  return false
}, [htmlProject, htmlApplied, step, currentProjectName, currentFlowId])
```

This prevents invalid navigation (e.g., jumping to html-recipe without a project).

---

## Summary

### Tab/Step Switching
- **Mechanism:** Conditional rendering in App.jsx based on `step` state
- **Control:** `navigateTo()` callback passed to all steps
- **Only one step is rendered at a time**

### AgenticPanel Mount/Unmount
- **Mounted:** When HtmlRecipeStep is rendered (step === 'html-recipe')
- **Unmounted:** When navigating away from html-recipe
- **State:** Completely destroyed on unmount (fresh on each mount)
- **Parent:** HtmlRecipeStep (direct parent), App.jsx (grandparent)

### State Preservation
- **Parent-held state:** htmlRecipeState, htmlAiResponse, htmlProject, htmlApplied
- **Step-level state:** Lost when step unmounts
- **AgenticPanel state:** Lost when HtmlRecipeStep unmounts
- **Pattern:** Parent state + callbacks = persistent data across navigation

### Data Flow
```
App.jsx (persistent state)
  ↓ props
HtmlRecipeStep (local state + parent props)
  ↓ props
AgenticPanel (local state only)
  ↑ callbacks
HtmlRecipeStep (updates via callbacks)
  ↑ callbacks
App.jsx (updates persistent state)
```
