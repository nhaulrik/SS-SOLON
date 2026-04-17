# AgenticPanel Documentation Index

This index provides quick access to all documentation about the SOLON navigation and AgenticPanel architecture.

---

## Quick Start

**Start here if you want quick answers:**
- Read: `AGENTIC_PANEL_QUICK_ANSWERS.md`
- Time: 5-10 minutes
- Contains direct answers to the 4 main questions

---

## Documentation Files

### 1. **AGENTIC_PANEL_QUICK_ANSWERS.md** (Start Here)
   - Direct answers to your 4 questions
   - File paths and line numbers
   - State flow diagrams
   - Key insights
   - When to update/reset AgenticPanel
   - **Best for:** Quick reference and understanding

### 2. **AGENTIC_PANEL_REFERENCE.md** (Technical Reference)
   - Exact file locations and line numbers
   - State flow diagram with code examples
   - Navigation paths
   - Key integration points
   - Debug context information
   - Summary tables
   - **Best for:** Implementation and debugging

### 3. **AGENTIC_PANEL_VISUAL_GUIDE.md** (Architecture Overview)
   - Component hierarchy visualization
   - State hierarchy tree
   - Navigation flow diagram
   - AgenticPanel lifecycle diagram
   - JSON generation data flow
   - Key points summary
   - **Best for:** Understanding the big picture

### 4. **NAVIGATION_AND_AGENTIC_PANEL_ANALYSIS.md** (Deep Dive)
   - Comprehensive technical analysis
   - Complete state hierarchy
   - Mount/unmount lifecycle
   - State preservation patterns
   - Data flow diagrams
   - Guard function documentation
   - State destruction & recreation
   - **Best for:** Complete understanding and advanced work

### 5. **EXPLORATION_SUMMARY.md** (This Session's Summary)
   - Summary of the exploration
   - Quick answers
   - File reference summary
   - Key insights
   - Navigation path summary
   - All step components
   - **Best for:** Session recap

---

## Navigation by Use Case

### I want to understand how navigation works
1. Read: AGENTIC_PANEL_QUICK_ANSWERS.md - Section 1
2. Read: AGENTIC_PANEL_VISUAL_GUIDE.md - Navigation Flow section
3. Reference: AGENTIC_PANEL_REFERENCE.md - Navigation Control table

### I want to understand AgenticPanel's lifecycle
1. Read: AGENTIC_PANEL_QUICK_ANSWERS.md - Section 2
2. Read: AGENTIC_PANEL_VISUAL_GUIDE.md - AgenticPanel Lifecycle section
3. Reference: NAVIGATION_AND_AGENTIC_PANEL_ANALYSIS.md - Section 7

### I want to preserve AgenticPanel state across navigation
1. Read: AGENTIC_PANEL_QUICK_ANSWERS.md - Section 3 & 4
2. Read: NAVIGATION_AND_AGENTIC_PANEL_ANALYSIS.md - Section 3
3. Read: EXPLORATION_SUMMARY.md - "If You Need to Preserve AgenticPanel State"

### I want to understand state management
1. Read: AGENTIC_PANEL_QUICK_ANSWERS.md - Section 3 & 4
2. Read: AGENTIC_PANEL_VISUAL_GUIDE.md - State Hierarchy section
3. Reference: AGENTIC_PANEL_REFERENCE.md - State Management table

### I want to debug a navigation issue
1. Reference: AGENTIC_PANEL_REFERENCE.md - File Locations & line numbers
2. Read: NAVIGATION_AND_AGENTIC_PANEL_ANALYSIS.md - Section 6
3. Reference: AGENTIC_PANEL_QUICK_ANSWERS.md - File Paths & Line Numbers Summary

### I want to add a new feature to AgenticPanel
1. Read: AGENTIC_PANEL_REFERENCE.md - Key Integration Points section
2. Read: AGENTIC_PANEL_VISUAL_GUIDE.md - Data Flow: JSON Generation section
3. Reference: NAVIGATION_AND_AGENTIC_PANEL_ANALYSIS.md - Section 4

---

## Key File Paths

### Root Navigation
- **App.jsx**: `C:\source\SOLON\client\src\App.jsx`
  - Step definitions: Lines 10-17
  - Step state: Lines 21-29
  - Conditional rendering: Lines 188-297

### AgenticPanel Integration
- **HtmlRecipeStep.jsx**: `C:\source\SOLON\client\src\steps\HtmlRecipeStep.jsx`
  - AgenticPanel rendering: Lines 327-337
  - Local state: Lines 58-80
  - Props: Lines 40-55

- **AgenticPanel.jsx**: `C:\source\SOLON\client\src\components\AgenticPanel.jsx`
  - Component definition: Line 60
  - State variables: Lines 62-73
  - handleGenerate(): Lines 104-141
  - handleAccept(): Lines 145-191

### State Management
- **App.jsx**: `C:\source\SOLON\client\src\App.jsx`
  - HTML flow state: Lines 58-80
  - htmlRecipeState: Lines 72-77
  - htmlAiResponse: Line 80
  - State callbacks: Lines 117-123
  - canNavigateTo(): Lines 125-134

---

## Quick Reference Tables

### The 6 Steps
| Step | File | Purpose |
|------|------|---------|
| project-landing | ProjectLandingStep.jsx | Select or create project |
| project-dashboard | ProjectDashboardStep.jsx | View flows, create new |
| html-upload | HtmlUploadStep.jsx | Upload HTML, make selections |
| html-recipe | HtmlRecipeStep.jsx | Generate recipe, use AgenticPanel |
| html-preview | HtmlPreviewStep.jsx | Review output, navigate slides |
| html-metadata | HtmlMetadataStep.jsx | Assign metadata, export |

### State Preservation
| State | Preserved? | Location | Lines |
|-------|-----------|----------|-------|
| htmlRecipeState | YES | App.jsx | 72-77 |
| htmlAiResponse | YES | App.jsx | 80 |
| htmlProject | YES | App.jsx | 63 |
| htmlApplied | YES | App.jsx | 66 |
| HtmlRecipeStep local state | NO | HtmlRecipeStep.jsx | 58-80 |
| AgenticPanel state | NO | AgenticPanel.jsx | 62-73 |

### Component Hierarchy
```
App.jsx (ROOT)
└── Conditional Rendering (one at a time)
    ├── ProjectLandingStep
    ├── ProjectDashboardStep
    ├── HtmlUploadStep
    ├── HtmlRecipeStep
    │   └── AgenticPanel (MOUNTED HERE)
    ├── HtmlPreviewStep
    └── HtmlMetadataStep
```

---

## State Flow Summary

```
App.jsx (PERSISTENT STATE)
  ├─ htmlRecipeState { recipe, globalPrompt, jsonInput }
  ├─ htmlAiResponse
  ├─ htmlProject { zones, selections, ... }
  └─ currentProjectName, currentFlowId
       ↓ props
HtmlRecipeStep (LOCAL + PARENT PROPS)
  ├─ recipe (from htmlRecipeState)
  ├─ globalPrompt (from htmlRecipeState)
  ├─ jsonInput (from htmlRecipeState)
  ├─ zones (from htmlProject)
  ├─ validation (local, lost on unmount)
  ├─ viewMode (local, lost on unmount)
  └─ [other UI state]
       ↓ props
AgenticPanel (LOCAL ONLY)
  ├─ status (lost on unmount)
  ├─ phase (lost on unmount)
  ├─ logs (lost on unmount)
  ├─ agents (lost on unmount)
  ├─ plan (lost on unmount)
  └─ [other local state]
       ↑ callbacks
HtmlRecipeStep (updates)
       ↑ callbacks
App.jsx (updates persistent state)
```

---

## The 4 Main Questions & Answers

### 1. How tabs/steps are switched?
**Answer:** App.jsx uses conditional rendering based on `step` state.
- Lines 21-29: Step state and navigateTo() callback
- Lines 188-297: Conditional rendering of steps
- Only one step is rendered at a time

### 2. When AgenticPanel is mounted/unmounted?
**Answer:** AgenticPanel is mounted inside HtmlRecipeStep and destroyed when navigating away.
- Mounted: When step === 'html-recipe'
- Unmounted: When navigating away from html-recipe
- State: Completely destroyed on unmount

### 3. How state is managed across tab switches?
**Answer:** Parent-held persistent state pattern.
- App.jsx holds persistent state (htmlRecipeState, htmlAiResponse)
- Child steps receive state as props
- Child updates parent via callbacks
- Navigation away: parent state survives, child state lost

### 4. Parent components holding AgenticPanel state?
**Answer:** Two levels of parents.
- Direct parent: HtmlRecipeStep (holds recipe, zones, jsonInput, validation, etc.)
- Grandparent: App.jsx (holds htmlRecipeState, htmlAiResponse, htmlProject)

---

## Navigation Examples

### From html-recipe to html-preview
```
User clicks "Apply content"
  ↓
HtmlRecipeStep.handleApply()
  ↓
API /api/html-flow/apply-content
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

### Returning to html-recipe from html-preview
```
User clicks "Back to recipe"
  ↓
HtmlPreviewStep.onBack()
  ↓
App.jsx.handleBackToHtmlRecipe()
  ↓
setHtmlApplied(null)
navigateTo('html-recipe')
  ↓
HtmlPreviewStep UNMOUNTED
HtmlRecipeStep RE-MOUNTED
AgenticPanel RE-MOUNTED (FRESH STATE)
  ↓
HtmlRecipeStep initializes from recipeState prop
  ↓
recipe, globalPrompt, jsonInput are restored
```

---

## AgenticPanel Lifecycle

```
MOUNTED (step === 'html-recipe')
  ↓
Initial State (status = 'idle')
  ↓
User clicks "Generate with AI"
  ↓
Phase 1: Planning (status = 'planning')
  ├─ API /agentic/plan
  └─ User reviews plan
  ↓
User clicks "Accept & Generate"
  ↓
Phase 2: Running (status = 'running')
  ├─ API /agentic/run
  └─ onJsonReady(json)
  ↓
User navigates away
  ↓
UNMOUNTED (all state destroyed)
```

---

## When to Use Each Document

| Document | Use When | Time |
|----------|----------|------|
| AGENTIC_PANEL_QUICK_ANSWERS.md | Need quick answers | 5-10 min |
| AGENTIC_PANEL_REFERENCE.md | Need exact line numbers | 10-15 min |
| AGENTIC_PANEL_VISUAL_GUIDE.md | Need to understand architecture | 15-20 min |
| NAVIGATION_AND_AGENTIC_PANEL_ANALYSIS.md | Need deep understanding | 30+ min |
| EXPLORATION_SUMMARY.md | Want session recap | 5-10 min |

---

## Common Questions

**Q: Will AgenticPanel state be preserved if I navigate away?**
A: No. AgenticPanel is completely destroyed. But parent state (recipe, globalPrompt, jsonInput) is preserved.

**Q: Can I access App.jsx state directly from AgenticPanel?**
A: No. Communication is via props and callbacks only.

**Q: What happens if I navigate back to html-recipe?**
A: HtmlRecipeStep and AgenticPanel are re-mounted fresh. Recipe and other parent state are restored.

**Q: How do I preserve AgenticPanel state across navigation?**
A: Move state to App.jsx and pass it as props. See EXPLORATION_SUMMARY.md section "If You Need to Preserve AgenticPanel State".

**Q: Which component controls navigation?**
A: App.jsx via the `navigateTo()` callback passed to all steps.

**Q: Can I navigate directly to any step?**
A: No. The `canNavigateTo()` guard function (App.jsx lines 125-134) prevents invalid navigation.

---

## Quick Links to Line Numbers

- Step definitions: App.jsx:10-17
- Step state: App.jsx:21-29
- Conditional rendering: App.jsx:188-297
- htmlRecipeState: App.jsx:72-77
- htmlAiResponse: App.jsx:80
- State callbacks: App.jsx:117-123
- canNavigateTo(): App.jsx:125-134
- HtmlRecipeStep props: HtmlRecipeStep.jsx:40-55
- HtmlRecipeStep local state: HtmlRecipeStep.jsx:58-80
- AgenticPanel rendering: HtmlRecipeStep.jsx:327-337
- AgenticPanel definition: AgenticPanel.jsx:60
- AgenticPanel state: AgenticPanel.jsx:62-73
- handleGenerate(): AgenticPanel.jsx:104-141
- handleAccept(): AgenticPanel.jsx:145-191

---

## Summary

You now have complete documentation of the SOLON navigation and AgenticPanel architecture with:
- ✓ File paths and line numbers for all key components
- ✓ State flow diagrams and hierarchies
- ✓ Navigation paths and examples
- ✓ AgenticPanel lifecycle and mount/unmount behavior
- ✓ State preservation patterns
- ✓ Visual guides and reference tables

Choose the document that best fits your needs and refer back to this index as needed.
