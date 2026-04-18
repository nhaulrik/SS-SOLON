# SOLON Slide Studio - Agent Guidelines

**SOLON Slide Studio** is a slide content generation tool. Users upload HTML templates, assign content zones via a DOM tree UI, generate AI recipes, paste AI JSON responses, preview outputs, assign per-slide metadata (including hierarchical relationships), and export slides.


- Persist AI JSON responses and generations inside `flow.json`.
- In `HtmlMetadataStep`: Add a user-friendly **drag-and-drop tree view** where all slides (regardless of template) start at root. Users can create parent-child hierarchies (e.g. Car Manufacturers → Car Models).
- **Package / Export** feature is independent: "Package" button exports the tree structure + relationships to a user-named folder inside the project. Launchable directly from the **Project Dashboard**.
- Remove all obsolete features: "replace file", "edit HTML", chain-based sessions, separate `zones.json`, `project.json` manifests, old packaging/relationship components.

## Architecture Overview

**Backend**
- Entry: `server/index.js` (Express)
- Routes: `server/routes/projects.js` and `server/routes/html-flow.js`
- Helpers: `server/lib/project-manager.js`, `server/lib/export-manager.js`
- Key endpoints support project listing/creation, flow loading, zone selections, recipe generation, JSON validation, content apply, and exports.

**Frontend**
- React app with step-based flow:
1. ProjectLandingStep
2. ProjectDashboardStep
3. HtmlEdit (DOM tree + zone assignment)
4. HtmlRecipeStep (recipe + JSON paste/apply)
5. HtmlPreviewStep
6. HtmlMetadataStep (metadata + new tree-based relationships + export)
- State lives in `flow.json._metadata` (selections, zones, trees, repeatableSlides, fullSlideGeneration, etc.).


## Agent Usage Rules (Strict – for maximum efficiency)

Always start by talking to `@orchestrator`.  
It will output a short **Plan** and delegate implementation exclusively to fast Haiku sub-agents.

### Available Sub-Agents

- `@haiku-html` — Pure HTML template fixes (e.g. NO_ZONES validation → wrap each slide in `<section>`). Return **only** the corrected HTML, no extra text.
- `@haiku-ui` — React/UI changes: layouts, scrolling behavior, default heights + expand, button removal, alignment, drag-and-drop tree view, making "generate full slide" active by default, improved relationship UI.
- `@haiku-logic` — Backend & project logic: Project/Flow system, file/folder structure, JSON persistence, Package export functionality, hierarchy/relationship logic.
- `@haiku-frontend` — General frontend tasks not covered by ui or html.

### Guidelines for All Agents

**Do**
- Keep changes minimal, clean, and reliable.
- Prefer filesystem persistence.
- Store outputs and AI responses meaningfully inside project/flow folders.

**Don't**
- Re-introduce removed features.
- Add unnecessary files or complexity.
- Perform implementation directly — always follow delegation from orchestrator.
- Produce long or verbose responses.

## Development Workflow

1. Describe the task to `@orchestrator`.
2. It creates a minimal plan and delegates to the right `@haiku-*` agent.
3. After changes, use read/bash tools only when necessary for verification.

This setup ensures token-efficient, focused work while staying aligned with SOLON’s new Project-based architecture.

Start every task by respecting the current `flow.json` structure and filesystem layout.