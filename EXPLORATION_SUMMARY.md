# SOLON Navigation & AgenticPanel Exploration - Summary

## Task Completed

You asked to explore the navigation/tab structure in the SOLON project to understand:
1. How tabs/steps are switched (main navigation/step container)
2. When AgenticPanel is mounted/unmounted (destroyed on tab switch?)
3. How state is managed across tab switches
4. Parent components that hold state for AgenticPanel

All questions have been answered with file paths and line numbers.

---

## Documents Created

Three comprehensive reference documents have been created in `C:\source\SOLON`:

### 1. **NAVIGATION_AND_AGENTIC_PANEL_ANALYSIS.md**
   - Detailed technical analysis of the entire architecture
   - Complete state hierarchy
   - Mount/unmount lifecycle
   - State preservation patterns
   - Data flow diagrams
   - Guard function documentation

### 2. **AGENTIC_PANEL_REFERENCE.md**
   - Quick reference with exact file paths and line numbers
   - State flow diagram
   - Navigation paths
   - Key integration points
   - Debug context information
   - Summary table

### 3. **AGENTIC_PANEL_QUICK_ANSWERS.md**
   - Direct answers to your 4 questions
   - File paths and line numbers
   - State flow diagrams
   - Key insights
   - When to update/reset AgenticPanel

### 4. **AGENTIC_PANEL_VISUAL_GUIDE.md**
   - Component hierarchy visualization
   - State hierarchy tree
   - Navigation flow diagram
   - AgenticPanel lifecycle diagram
   - JSON generation data flow

---

## Quick Answers

### 1. How Tabs/Steps Are Switched

**File:** `C:\source\SOLON\client\src\App.jsx`

**Mechanism:**
- Lines 10-17: Define 6 steps in ALL_STEPS array
- Lines 21-29: Step state and navigateTo() callback
- Lines 188-297: Conditional rendering (only one step at a time)

**How it works:**
```jsx
const [step, setStep] = useState('project-landing')
const navigateTo = useCallback((newStep) => {
  const curr = ALL_STEPS.indexOf(step)
  const next = ALL_STEPS.indexOf(newStep)
  setAnimDir(next >= curr ? 'forward' : 'backward')
  setStep(newStep)
}, [step])
```

When `step` changes, the entire component tree is re-rendered:
- Old step component unmounts
- New step component mounts
- All child components are affected

---

### 2. AgenticPanel Mount/Unmount

**File:** `C:\source\SOLON\client\src\steps\HtmlRecipeStep.jsx` (Lines 327-337)

**Answer: YES - AgenticPanel is completely destroyed when switching tabs**

**Lifecycle:**
- **Mounted:** Only when `step === 'html-recipe'` in App.jsx
- **Unmounted:** When navigating away from html-recipe
  - User clicks "Back to template" → navigates to html-upload
  - User clicks "Apply content" → navigates to html-preview
  - Any other navigation away

**Destruction Details:**
- HtmlRecipeStep is unmounted → AgenticPanel is unmounted
- ALL AgenticPanel state is destroyed:
  - status, phase, logs, agents, plan, errorMsg, elapsed
  - summaryMode, customPrompt
  - All refs (logEndRef, timerRef, abortRef)

**On Return:**
- AgenticPanel is re-mounted with fresh state
- No memory of previous generation attempts
- But parent state (recipe, globalPrompt, jsonInput) is restored

---

### 3. State Management Across Tab Switches

**File:** `C:\source\SOLON\client\src\App.jsx` (Lines 58-80)

**State that SURVIVES navigation:**
```jsx
// Lines 72-77 - Preserved across navigation
const [htmlRecipeState, setHtmlRecipeState] = useState({
  recipe:             '',
  globalPrompt:       '',
  jsonInput:          '',
  recipeGenerationId: null,
})

// Line 80 - Preserved across navigation
const [htmlAiResponse, setHtmlAiResponse] = useState(null)

// Line 63 - Project state
const [htmlProject, setHtmlProject] = useState(null)

// Line 66 - Applied content state
const [htmlApplied, setHtmlApplied] = useState(null)
```

**State that is LOST on navigation:**
- HtmlRecipeStep's local state
- AgenticPanel's state (ALL OF IT)
- Any component-specific UI state

**How Preservation Works:**
1. Parent (App.jsx) holds persistent state
2. Child (HtmlRecipeStep) receives state as props
3. Child updates parent via callbacks (onRecipeStateChange, onAiResponseChange)
4. Navigation away and back: parent state survives, child state is lost
5. Child re-initializes from parent state

---

### 4. Parent Components Holding AgenticPanel State

**Two Levels of Parents:**

#### Direct Parent: HtmlRecipeStep
**File:** `C:\source\SOLON\client\src\steps\HtmlRecipeStep.jsx`

State it holds for AgenticPanel:
- `recipe` (line 59) - passed as prop
- `zones` (line 56, from project) - passed as prop
- `repeatableSlides` (line 56, from project) - passed as prop
- `jsonInput` (line 64) - updated via onJsonReady() callback
- `validation` (line 65) - updated after JSON generation
- `viewMode` (line 67) - switches to preview mode
- `shouldAutoPreview` (line 68) - auto-switches view

#### Grandparent: App.jsx
**File:** `C:\source\SOLON\client\src\App.jsx`

State it holds for HtmlRecipeStep (and thus AgenticPanel):
- `htmlRecipeState` (lines 72-77) - persistent recipe state
- `htmlAiResponse` (line 80) - persistent AI response metadata
- `htmlProject` (line 63) - contains zones and selections
- `currentProjectName` (line 34) - passed to AgenticPanel via HtmlRecipeStep

**State Flow:**
```
App.jsx (persistent)
  ↓ props
HtmlRecipeStep (local + parent props)
  ↓ props
AgenticPanel (local only)
  ↑ callbacks
HtmlRecipeStep (updates)
  ↑ callbacks
App.jsx (updates persistent state)
```

---

## File Reference Summary

### Core Navigation
| File | Lines | Purpose |
|------|-------|---------|
| App.jsx | 10-17 | Step definitions |
| App.jsx | 21-29 | Step state & navigateTo() |
| App.jsx | 188-297 | Conditional rendering |

### State Management
| File | Lines | Purpose |
|------|-------|---------|
| App.jsx | 58-80 | HTML flow state |
| App.jsx | 72-77 | htmlRecipeState (preserved) |
| App.jsx | 80 | htmlAiResponse (preserved) |
| App.jsx | 117-123 | State callbacks |
| App.jsx | 125-134 | canNavigateTo() guard |

### AgenticPanel Integration
| File | Lines | Purpose |
|------|-------|---------|
| HtmlRecipeStep.jsx | 40-55 | Component props |
| HtmlRecipeStep.jsx | 58-80 | Local state |
| HtmlRecipeStep.jsx | 327-337 | AgenticPanel rendering |
| AgenticPanel.jsx | 60 | Component definition |
| AgenticPanel.jsx | 62-73 | State variables |
| AgenticPanel.jsx | 104-141 | handleGenerate() - Phase 1 |
| AgenticPanel.jsx | 145-191 | handleAccept() - Phase 2 |

---

## Key Insights

### 1. One Step at a Time
- Only one step component is rendered at a time
- Switching steps completely unmounts the old step
- New step is mounted fresh

### 2. AgenticPanel is Ephemeral
- Completely destroyed when leaving html-recipe
- Fresh state every time it mounts
- No persistence of generation attempts

### 3. Parent State is Persistent
- App.jsx holds state for the entire flow
- htmlRecipeState and htmlAiResponse survive navigation
- Recipe, globalPrompt, jsonInput are preserved

### 4. State Flows Down, Updates Flow Up
- Parent passes state as props
- Child updates parent via callbacks
- Grandparent state survives navigation

### 5. No Direct State Sharing
- AgenticPanel doesn't access App.jsx state directly
- Communication is via props and callbacks
- HtmlRecipeStep acts as intermediary

---

## If You Need to Preserve AgenticPanel State

Currently, AgenticPanel state is destroyed when navigating away. If you need to preserve it:

1. Move AgenticPanel state to App.jsx
2. Pass state as props to HtmlRecipeStep
3. Pass state as props to AgenticPanel
4. Update AgenticPanel callbacks to update App.jsx state
5. Modify HtmlRecipeStep to pass through state

Example:
```jsx
// In App.jsx
const [agenticPanelState, setAgenticPanelState] = useState({
  status: 'idle',
  phase: '',
  logs: [],
  agents: [],
  plan: null,
  // ... other state
})

// Pass to HtmlRecipeStep
<HtmlRecipeStep
  agenticPanelState={agenticPanelState}
  onAgenticStateChange={setAgenticPanelState}
  ...
/>

// Pass to AgenticPanel
<AgenticPanel
  panelState={agenticPanelState}
  onStateChange={onAgenticStateChange}
  ...
/>
```

---

## Navigation Path Summary

```
project-landing
    ↓
project-dashboard
    ↓
html-upload
    ↓
html-recipe (AGENTIC PANEL HERE)
    ├─ Back → html-upload
    └─ Apply → html-preview
        ↓
    html-preview
        ├─ Back → html-recipe (AgenticPanel remounts fresh)
        └─ Next → html-metadata
            ↓
        html-metadata
            ├─ Back → html-preview
            └─ Finish → project-dashboard
```

---

## All Step Components

1. **ProjectLandingStep** - Select or create project
2. **ProjectDashboardStep** - View flows, create new flow
3. **HtmlUploadStep** - Upload HTML, make selections
4. **HtmlRecipeStep** - Generate recipe, use AgenticPanel, apply content
5. **HtmlPreviewStep** - Review output, navigate slides
6. **HtmlMetadataStep** - Assign slide metadata, export

---

## Conclusion

The SOLON project uses a **root-level step state machine** (App.jsx) to manage navigation. AgenticPanel is mounted inside HtmlRecipeStep and is completely destroyed when navigating away. State is managed via a parent-held persistent state pattern, with callbacks for child-to-parent communication.

All relevant file paths and line numbers have been documented in the reference files for easy navigation and implementation.
