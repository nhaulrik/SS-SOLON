# AgenticPanel Architecture - Quick Answers

## Your Questions Answered

---

## 1. How tabs/steps are switched (find the main navigation/step container)

### Answer: App.jsx (Root Component)

**File:** `C:\source\SOLON\client\src\App.jsx`

**Step Switching Mechanism:**
- **Lines 21-29:** Step state and navigateTo() callback
  ```jsx
  const [step, setStep] = useState('project-landing')
  const navigateTo = useCallback((newStep) => {
    const curr = ALL_STEPS.indexOf(step)
    const next = ALL_STEPS.indexOf(newStep)
    setAnimDir(next >= curr ? 'forward' : 'backward')
    setStep(newStep)
  }, [step])
  ```

- **Lines 188-297:** Conditional rendering of steps
  - Only ONE step component is rendered at a time
  - Each step is an `if (step === 'step-name')` block
  - When step changes, old step is unmounted, new step is mounted

**All 6 Steps:**
1. project-landing
2. project-dashboard
3. html-upload
4. html-recipe ← **AgenticPanel is here**
5. html-preview
6. html-metadata

---

## 2. When AgenticPanel is mounted/unmounted (does it get destroyed when switching tabs?)

### Answer: YES - Completely Destroyed

**File:** `C:\source\SOLON\client\src\steps\HtmlRecipeStep.jsx` (Lines 327-337)

**AgenticPanel is mounted ONLY inside HtmlRecipeStep:**
```jsx
<AgenticPanel
  projectName={projectName}
  recipe={recipe}
  zones={zones}
  repeatableSlides={repeatableSlides}
  onJsonReady={(json) => { ... }}
/>
```

**Lifecycle:**
- **Mounted:** When `step === 'html-recipe'` in App.jsx (line 234)
- **Unmounted:** When user navigates away from html-recipe
  - User clicks "Back to template" → navigates to html-upload
  - User clicks "Apply content" → navigates to html-preview
  - Any other navigation away from html-recipe

**Destruction:**
- When HtmlRecipeStep unmounts, AgenticPanel unmounts
- ALL AgenticPanel state is destroyed:
  - status, phase, logs, agents, plan, errorMsg, elapsed
  - summaryMode, customPrompt
  - All refs (logEndRef, timerRef, abortRef)

**On Return to html-recipe:**
- HtmlRecipeStep is re-mounted from scratch
- AgenticPanel is re-mounted from scratch
- Fresh state - no memory of previous generation attempts

---

## 3. How state is managed across tab switches

### Answer: Parent-Held State Pattern

**File:** `C:\source\SOLON\client\src\App.jsx` (Lines 58-80)

**State that SURVIVES navigation:**
```jsx
// Lines 72-77 - HTML recipe step state (preserved across navigation)
const [htmlRecipeState, setHtmlRecipeState] = useState({
  recipe:             '',
  globalPrompt:       '',
  jsonInput:          '',
  recipeGenerationId: null,
})

// Line 80 - AI response tracking
const [htmlAiResponse, setHtmlAiResponse] = useState(null)

// Line 63 - Project state
const [htmlProject, setHtmlProject] = useState(null)

// Line 66 - Applied content state
const [htmlApplied, setHtmlApplied] = useState(null)
```

**State that is LOST on navigation:**
- HtmlRecipeStep's local state: recipe, globalPrompt, jsonInput (local copies)
- HtmlRecipeStep's UI state: validation, applying, viewMode, shouldAutoPreview
- **AgenticPanel's state: ALL OF IT** (status, phase, logs, agents, plan, etc.)

**How Preservation Works:**

1. **Parent (App.jsx) holds state**
   - `htmlRecipeState` contains recipe, globalPrompt, jsonInput
   - `htmlAiResponse` contains AI response metadata

2. **Child (HtmlRecipeStep) receives state as props**
   - Initialized from `recipeState` prop (line 52)
   - Creates local copies for UI manipulation (lines 59-68)

3. **Child updates parent via callbacks**
   - `onRecipeStateChange()` - updates htmlRecipeState in App.jsx (lines 117-119)
   - `onAiResponseChange()` - updates htmlAiResponse in App.jsx (lines 121-123)

4. **Navigation away and back**
   - Parent state is intact
   - Child is re-mounted with same parent state
   - Child re-initializes from parent state
   - Lost child state is re-initialized to defaults

**Example Flow:**
```
1. User generates recipe
   → HtmlRecipeStep.recipe = "..."
   → onRecipeChange(recipe)
   → App.jsx.htmlRecipe = "..."

2. User navigates to html-upload
   → HtmlRecipeStep unmounts (recipe lost locally)
   → App.jsx.htmlRecipe still = "..."

3. User navigates back to html-recipe
   → HtmlRecipeStep re-mounts
   → Receives recipeState prop with recipe = "..."
   → Local recipe = recipeState.recipe
   → Recipe is restored!
```

---

## 4. Are there any parent components that hold state for AgenticPanel?

### Answer: YES - Two Levels

**Direct Parent:** `HtmlRecipeStep.jsx`
- **File:** `C:\source\SOLON\client\src\steps\HtmlRecipeStep.jsx`
- **State it holds for AgenticPanel:**
  - `recipe` (line 59) - passed as prop to AgenticPanel
  - `zones` (line 56, from project prop) - passed to AgenticPanel
  - `repeatableSlides` (line 56, from project prop) - passed to AgenticPanel
  - `jsonInput` (line 64) - updated via AgenticPanel.onJsonReady()
  - `validation` (line 65) - updated after AgenticPanel generates JSON
  - `viewMode` (line 67) - switches to preview after JSON is generated
  - `shouldAutoPreview` (line 68) - auto-switches to preview mode

- **How it holds state:**
  - AgenticPanel receives `recipe`, `zones`, `repeatableSlides` as read-only props
  - AgenticPanel calls `onJsonReady(json)` callback when generation completes
  - HtmlRecipeStep receives JSON and updates `jsonInput` via `handleJsonChange()`
  - HtmlRecipeStep updates parent App.jsx via `onRecipeStateChange()`

**Grandparent:** `App.jsx`
- **File:** `C:\source\SOLON\client\src\App.jsx`
- **State it holds for HtmlRecipeStep (and thus AgenticPanel):**
  - `htmlRecipeState` (lines 72-77) - persistent recipe state
  - `htmlAiResponse` (line 80) - persistent AI response metadata
  - `htmlProject` (line 63) - contains zones and selections
  - `currentProjectName` (line 34) - passed to AgenticPanel via HtmlRecipeStep

- **How it holds state:**
  - Passes `recipeState` prop to HtmlRecipeStep
  - Passes `project` prop to HtmlRecipeStep (contains zones)
  - Passes `currentProjectName` prop to HtmlRecipeStep
  - Receives updates via `onRecipeStateChange()` and `onAiResponseChange()`
  - Preserves state across navigation

**State Flow Diagram:**
```
App.jsx (PERSISTENT)
  ├─ htmlRecipeState { recipe, globalPrompt, jsonInput }
  ├─ htmlAiResponse
  ├─ htmlProject { zones, selections, ... }
  └─ currentProjectName
       ↓ (props)
HtmlRecipeStep (LOCAL + PARENT PROPS)
  ├─ recipe (from htmlRecipeState)
  ├─ globalPrompt (from htmlRecipeState)
  ├─ jsonInput (from htmlRecipeState)
  ├─ zones (from htmlProject)
  ├─ repeatableSlides (from htmlProject)
  ├─ validation (local)
  ├─ viewMode (local)
  ├─ shouldAutoPreview (local)
  └─ [other UI state]
       ↓ (props)
AgenticPanel (LOCAL ONLY)
  ├─ status (idle|planning|confirming|running|done|error)
  ├─ phase (analyzing|planning|generating|assembling)
  ├─ logs (activity log)
  ├─ agents (agent status)
  ├─ plan (plan from /agentic/plan)
  ├─ errorMsg
  ├─ elapsed (timer)
  ├─ summaryMode
  └─ customPrompt
       ↑ (callback onJsonReady)
HtmlRecipeStep (updates jsonInput)
       ↑ (callback onRecipeStateChange)
App.jsx (updates htmlRecipeState)
```

---

## 5. File Paths & Line Numbers Summary

### Navigation Control
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| App.jsx | `C:\source\SOLON\client\src\App.jsx` | 10-17 | Step definitions (ALL_STEPS) |
| App.jsx | `C:\source\SOLON\client\src\App.jsx` | 21-29 | Step state & navigateTo() |
| App.jsx | `C:\source\SOLON\client\src\App.jsx` | 188-297 | Conditional step rendering |

### State Management
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| App.jsx | `C:\source\SOLON\client\src\App.jsx` | 58-80 | HTML flow state variables |
| App.jsx | `C:\source\SOLON\client\src\App.jsx` | 72-77 | htmlRecipeState (PRESERVED) |
| App.jsx | `C:\source\SOLON\client\src\App.jsx` | 80 | htmlAiResponse (PRESERVED) |
| App.jsx | `C:\source\SOLON\client\src\App.jsx` | 117-123 | State update callbacks |
| App.jsx | `C:\source\SOLON\client\src\App.jsx` | 125-134 | canNavigateTo() guard |
| HtmlRecipeStep | `C:\source\SOLON\client\src\steps\HtmlRecipeStep.jsx` | 40-55 | Component props |
| HtmlRecipeStep | `C:\source\SOLON\client\src\steps\HtmlRecipeStep.jsx` | 58-80 | Local state variables |
| HtmlRecipeStep | `C:\source\SOLON\client\src\steps\HtmlRecipeStep.jsx` | 126-131 | handleJsonChange() |

### AgenticPanel Integration
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| HtmlRecipeStep | `C:\source\SOLON\client\src\steps\HtmlRecipeStep.jsx` | 327-337 | AgenticPanel rendering |
| AgenticPanel | `C:\source\SOLON\client\src\components\AgenticPanel.jsx` | 60 | Component definition |
| AgenticPanel | `C:\source\SOLON\client\src\components\AgenticPanel.jsx` | 62-73 | State variables |
| AgenticPanel | `C:\source\SOLON\client\src\components\AgenticPanel.jsx` | 104-141 | handleGenerate() - Phase 1 |
| AgenticPanel | `C:\source\SOLON\client\src\components\AgenticPanel.jsx` | 145-191 | handleAccept() - Phase 2 |
| AgenticPanel | `C:\source\SOLON\client\src\components\AgenticPanel.jsx` | 193-202 | handleCancel() - reset |

---

## Key Insights

### 1. AgenticPanel is Ephemeral
- Completely destroyed when leaving html-recipe step
- No state is preserved between generations
- Fresh start every time user returns to html-recipe

### 2. Parent State is Persistent
- App.jsx holds state for the entire flow
- htmlRecipeState, htmlAiResponse survive navigation
- Recipe, globalPrompt, jsonInput are preserved
- AI response metadata is preserved

### 3. State Flows Down, Updates Flow Up
```
App.jsx (root state)
  ↓ props
HtmlRecipeStep (local state + parent props)
  ↓ props
AgenticPanel (local state only)
  ↑ callbacks (onJsonReady)
HtmlRecipeStep (updates local state)
  ↑ callbacks (onRecipeStateChange, onAiResponseChange)
App.jsx (updates persistent state)
```

### 4. Navigation is One-Way Down
- Only one step is rendered at a time
- Switching steps unmounts old step completely
- New step is mounted fresh
- Parent state survives, child state is lost

### 5. AgenticPanel Cannot Access Parent State Directly
- AgenticPanel only receives props: projectName, recipe, zones, repeatableSlides
- AgenticPanel has no access to htmlRecipeState or htmlAiResponse
- AgenticPanel updates parent only via onJsonReady() callback
- All other state management is handled by HtmlRecipeStep

---

## When to Update AgenticPanel

If you need to preserve AgenticPanel state across navigation:
1. Move AgenticPanel state to App.jsx
2. Pass state as props to HtmlRecipeStep
3. Pass state as props to AgenticPanel
4. Update AgenticPanel callbacks to update App.jsx state
5. Modify HtmlRecipeStep to pass through state

**Current:** AgenticPanel state is local → destroyed on unmount
**To preserve:** Move state to App.jsx → survives navigation

---

## When to Reset AgenticPanel

AgenticPanel automatically resets when:
1. User navigates away from html-recipe
2. User returns to html-recipe
3. HtmlRecipeStep re-mounts AgenticPanel

No manual reset is needed - the component lifecycle handles it.
