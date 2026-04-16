# Development Backlog — SOLON Slide Studio

**Last Updated**: 2026-04-17  
**Current Status**: Full project/flow/export workflow complete. Navigation and step structure finalised.  
**Active Branch**: `project-makeover`

---

## Current Sprint Status

### ✅ Completed (2026-04-16 – 2026-04-17)
- **Project & Flow Persistence** ✅ COMPLETE
  - Projects created by name from the landing page (`POST /api/projects`)
  - Flows created from the project dashboard ("New Flow" → upload step)
  - Project context always injected from dashboard — no project selector inside the upload step
  - Existing flows load from dashboard with zones intact (no re-upload required)
  - `NO_ZONES` false positive suppressed when flow already has saved selections

- **Navigation & Step Structure** ✅ COMPLETE
  - Landing → create project → Dashboard (hub)
  - Dashboard → New Flow → Upload/Zones → Recipe → Preview → Metadata → Dashboard
  - Dashboard → Open existing flow → Upload/Zones (load-flow) → Recipe → Preview → Metadata → Dashboard
  - "Finish" on the Metadata step returns to the project dashboard

- **Metadata & Export Step** ✅ COMPLETE
  - New `HtmlMetadataStep` (step 4 of HTML flow)
  - Per-slide metadata: slideId, name, type
  - "Export N Slides" triggers versioned export to `exports/` directory
  - Export history panel with per-slide download and ZIP download
  - Export removed from Preview step — Preview is now view-only

- **Legacy Removal** ✅ COMPLETE
  - Removed all `chainId`-based server code paths
  - Removed `project.json` manifests, `templates/` directories, `zones.json` files
  - Removed `generation-manager`, `structure-manager`, `package-manager`, `relationship-manager`
  - Removed packaging/relationship UI components and old dialog components
  - Projects discovered by filesystem scan only

- **Block-Only Zones Refactor** ✅ COMPLETE
  - All zones unified under block-only model (`type: 'block'`, `data-block` attributes)
  - JSON format: `{ blocks: {...} }` — no legacy `static` format
  - Ignored zones listed explicitly in recipe ("ZONES TO PRESERVE" section)

### 🎯 Next Steps (Immediate)
1. **Merge to main**: PR review and merge of `project-makeover` branch
2. **Test cleanup**: E2E and unit tests still reference `chainId`, old endpoints, `save-project` — needs a pass
3. **Phase 2.1 - Critical Features** (2–3 weeks):
   - [ ] Full-Slide Content Generation
   - [ ] Auto-Expand to Show Assigned Zones
4. **Phase 2.2 - Advanced Zone Management** (3–4 weeks):
   - Bulk zone operations
   - Zone templates & presets
   - Conditional zones
5. **Phase 3**: Recipe Intelligence (AI suggestions, LLM integration)
6. **Phase 4**: Output & Export (PDF, PPTX)

---

## Table of Contents

1. [Roadmap & Phases](#roadmap--phases)
2. [Current Architecture](#current-architecture)
3. [Known Issues & Technical Debt](#known-issues--technical-debt)
4. [Feature Backlog](#feature-backlog)
5. [Performance & Optimization](#performance--optimization)
6. [Infrastructure & DevOps](#infrastructure--devops)
7. [Documentation & Support](#documentation--support)

---

## Roadmap & Phases

### Phase 1: Foundation ✅ COMPLETE
**Status**: Shipped  
**Scope**: HTML Visual Flow core workflow (upload → zones → recipe → apply → preview)

- [x] DOM tree extraction and zone assignment UI
- [x] Recipe generation from zones
- [x] JSON validation for AI responses
- [x] Content application (HTML patching)
- [x] Multi-slide preview with scroll-snap navigation
- [x] Repeatable slides with unique/non-unique zones
- [x] HTML editor with live preview
- [x] Debug context modal
- [x] Accessibility audit (WCAG AA)
- [x] Focus trapping for modals

**Metrics**: 245 unit tests, 93 E2E tests (100% passing)

#### Phase 1.1: Block-Only Zones Refactor ✅ COMPLETE
**Status**: Shipped (2026-04-15)  
**Scope**: Simplify zone model by removing leaf zones, focusing on block-only zones

- [x] Remove all leaf zone UI components and state management
- [x] Remove zone type selector modal
- [x] Remove conflict detection system
- [x] Update data model: all zones now have `type: 'block'` and use `data-block` attributes
- [x] Update recipe builder to exclude ignored zones with explicit preservation instructions
- [x] Remove backward compatibility code
- [x] Update all 245 unit tests
- [x] Fix all 93 E2E tests (html-flow, html-preview-step, html-ignore-zones, html-repeatable, etc.)
- [x] Implement ignored zones preservation in recipe (explicit "ZONES TO PRESERVE" section)
- [x] Update test fixtures to use new recipe format (blocks instead of static)

**Key Changes**:
- JSON format simplified: `{ blocks: {...} }` for non-repeatable zones
- Ignored zones explicitly listed in recipe to prevent AI from modifying them
- Removed ~400 lines of backward compatibility code
- All zone types unified under block-only model

**Metrics**: 245 unit tests ✅, 93 E2E tests ✅ (100% passing)

---

### Phase 2: Advanced Zone Management
**Status**: Planned  
**Est. Effort**: 2–3 weeks  
**Dependencies**: Phase 1 complete

#### 2.1 Bulk Zone Operations
- [ ] Multi-select zones across slides
- [ ] Bulk rename zones with refactoring
- [ ] Bulk delete with conflict resolution
- [ ] Copy/paste zones between slides
- [ ] Undo/redo for zone edits

**Why**: Users with 50+ zones need efficient bulk operations. Current UI is one-at-a-time.

#### 2.2 Zone Templates & Presets
- [ ] Save zone configurations as reusable templates
- [ ] Quick-apply templates to new slides
- [ ] Template library (built-in + custom)
- [ ] Export/import zone templates

**Why**: Reduces repetition for projects with consistent slide patterns (e.g., "Title + Body + Footer").

#### 2.3 Conditional Zones
- [ ] Mark zones as optional/required
- [ ] Conditional rendering based on data presence
- [ ] Validation rules per zone (min length, regex, etc.)
- [ ] Show/hide zones in UI based on conditions

**Why**: Some zones may not apply to all slides (e.g., "chart_data" only on data slides).

#### 2.4 Zone History & Versioning
- [ ] Track zone edits with timestamps
- [ ] Revert to previous zone configurations
- [ ] Diff view between versions
- [ ] Zone audit log

**Why**: Helps users recover from accidental bulk changes.

---

### Phase 3: Recipe Intelligence & Content Generation
**Status**: Planned  
**Est. Effort**: 3–4 weeks  
**Dependencies**: Phase 1 complete, Phase 2 optional

#### 3.1 AI-Powered Zone Key Suggestions
- [ ] Auto-suggest zone keys based on element content
- [ ] Learn from user naming patterns
- [ ] Batch rename suggestions
- [ ] Keyboard shortcut to accept suggestion

**Why**: Reduces manual typing for zone naming.

#### 3.2 Recipe History & Management
- [ ] Save generated recipes with timestamps
- [ ] Compare recipes across versions
- [ ] Reuse previous recipes (template library)
- [ ] Recipe validation history

**Why**: Users iterate on recipes; history helps track what worked.

#### 3.3 Direct LLM Integration
- [ ] OpenAI API integration
- [ ] Anthropic Claude API integration
- [ ] Generic LLM provider abstraction
- [ ] API key management (secure storage)
- [ ] Rate limiting & quota tracking

**Why**: Eliminates copy/paste workflow; one-click generation.

#### 3.4 Batch Content Generation
- [ ] Queue multiple projects for generation
- [ ] Async generation with progress tracking
- [ ] Batch error handling & retry logic
- [ ] Generation history & analytics

**Why**: Power users need to generate 10+ projects at once.

#### 3.5 Generation Presets & Workflows
- [ ] Save generation settings (model, temperature, max tokens)
- [ ] Quick-apply presets to new projects
- [ ] A/B test different prompts
- [ ] Template prompts for common scenarios

**Why**: Users develop preferences; presets save time.

---

### Phase 4: Output & Export
**Status**: Planned  
**Est. Effort**: 2–3 weeks  
**Dependencies**: Phase 1 complete

#### 4.1 PDF Export
- [ ] Client-side PDF rendering (html2pdf or Puppeteer)
- [ ] Preserve styling and fonts
- [ ] Multi-page PDF from multi-slide output
- [ ] Custom page sizes (A4, Letter, 16:9, etc.)

**Why**: PDF is the primary output format for Visual Flow.

#### 4.2 PPTX Export (Best-Effort)
- [ ] Convert HTML slides to PPTX
- [ ] Preserve layout and styling where possible
- [ ] Embed images and fonts
- [ ] Handle limitations gracefully

**Why**: Some users need PPTX for further editing.

#### 4.3 HTML Export
- [ ] Export raw HTML output
- [ ] Self-contained HTML (no external dependencies)
- [ ] Responsive HTML for web viewing

**Why**: For web-based presentations or archival.

#### 4.4 Download Management
- [ ] Batch download multiple outputs
- [ ] ZIP archive for multi-slide exports
- [ ] Direct S3/cloud storage uploads
- [ ] Email delivery option

**Why**: Convenience for users with many projects.

---

### Phase 5: Collaboration & Sharing
**Status**: Planned  
**Est. Effort**: 3–4 weeks  
**Dependencies**: Phase 1 complete, database integration

#### 5.1 Project Sharing & Permissions
- [ ] Share projects with team members (view/edit/admin)
- [ ] Role-based access control (RBAC)
- [ ] Public/private project visibility
- [ ] Shareable links with expiration

**Why**: Teams need to collaborate on slide decks.

#### 5.2 Comments & Annotations
- [ ] Comment on specific zones
- [ ] Mention team members (@user)
- [ ] Comment threads with resolution
- [ ] Notification system

**Why**: Feedback loops for iterative content refinement.

#### 5.3 Version Control & Diff
- [ ] Track project versions with snapshots
- [ ] Diff view between versions (zones, content, recipes)
- [ ] Rollback to previous version
- [ ] Merge conflicts for collaborative editing

**Why**: Users need to track changes and collaborate safely.

#### 5.4 Activity Log & Audit Trail
- [ ] Full audit log of all changes
- [ ] Who changed what, when, why
- [ ] Compliance-friendly export
- [ ] Retention policies

**Why**: Enterprise users need accountability.

---

### Phase 6: Analytics & Insights
**Status**: Planned  
**Est. Effort**: 2–3 weeks  
**Dependencies**: Phase 1 complete, database integration

#### 6.1 Usage Analytics
- [ ] Track projects created, zones assigned, content generated
- [ ] Time-to-completion metrics
- [ ] Popular zone patterns
- [ ] User activity dashboard

**Why**: Understand how users work; identify pain points.

#### 6.2 Content Quality Metrics
- [ ] Track AI generation quality (user ratings)
- [ ] Common AI errors or patterns
- [ ] Zone-level success rates
- [ ] Prompt effectiveness analysis

**Why**: Improve recipe quality over time.

#### 6.3 Performance Monitoring
- [ ] Generation time per project
- [ ] API latency and error rates
- [ ] User-facing performance metrics
- [ ] Bottleneck identification

**Why**: Optimize system performance based on real usage.

---

## Current Architecture

### Tech Stack
- **Frontend**: React 18 + Vite
- **Backend**: Node.js Express
- **Testing**: Vitest (unit), Playwright (E2E)
- **Styling**: CSS modules + design tokens (dark theme)
- **Fonts**: Geist (UI), JetBrains Mono (code)
- **State Management**: React hooks

### Directory Structure
```
SOLON/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── steps/          # Page-level step components
│   │   ├── utils/          # Helpers (slidePreview, etc.)
│   │   ├── index.css       # Global styles + design tokens
│   │   └── App.jsx         # Main app router + step navigation
│   ├── index.html
│   └── package.json
├── server/                 # Express backend
│   ├── lib/                # project-manager, export-manager
│   ├── routes/             # html-flow.js, projects.js
│   ├── projects/           # Persisted project data (gitignored)
│   │   └── <projectName>/
│   │       └── flows/
│   │           └── <flowId>/
│   │               ├── flow.json
│   │               ├── template.html
│   │               ├── output-*.html
│   │               └── exports/
│   ├── config.js
│   └── index.js
├── e2e/                    # Playwright E2E tests
└── backlog.md              # This file
```

### Key Components

#### Frontend Steps
- **ProjectLandingStep**: List all projects; inline "New Project" form creates project by name
- **ProjectDashboardStep**: List flows for a project; "New Flow" starts a new flow; open or delete per flow
- **HtmlUploadStep**: Drop HTML file (new flow) or load existing flow; DOM tree with zone assignment; "Next →"
- **HtmlRecipeStep**: Generate recipe, paste AI JSON, validate, apply content
- **HtmlPreviewStep**: Multi-slide iframe preview; "Next →" proceeds to metadata
- **HtmlMetadataStep**: Per-slide metadata (slideId, name, type); export to slides; export history; "Finish" → dashboard

#### Frontend Sub-Components
- **HtmlTreePanel**: Visual DOM tree with zone assignment UI
- **HtmlEditorPanel**: CodeMirror editor with live preview
- **ExportHistoryPanel**: List past exports for a flow with download/delete
- **DebugContextModal**: Full state snapshot for debugging

#### Backend Endpoints
- **POST /api/projects**: Create a new project directory
- **GET /api/projects**: List all projects
- **GET /api/projects/:name**: Load project with flows
- **DELETE /api/projects/:name**: Delete project
- **GET/PATCH/DELETE /api/projects/:name/flows/:flowId**: Flow operations
- **POST/GET /api/projects/:name/flows/:flowId/exports**: Create or list exports
- **GET/.../exports/:id/...**: Download slides or ZIP
- **DELETE/.../exports/:id**: Delete export
- **POST /api/html-flow/upload-template**: Parse HTML, create flow inside existing project
- **GET /api/html-flow/load-flow**: Load existing flow with saved selections
- **PATCH /api/html-flow/update-selections**: Persist zone edits to flow.json
- **POST /api/html-flow/generate-recipe**: Build AI prompt from zones
- **POST /api/html-flow/validate-json**: Validate AI JSON response against zones
- **POST /api/html-flow/apply-content**: Patch HTML with AI content, save output

### Data Flow
```
Project Landing
    ↓ "New Project" (name input) → POST /api/projects
Project Dashboard  (empty)
    ↓ "New Flow"
HtmlUploadStep  [upload path]
    — drop HTML file → POST /upload-template (creates flow in project)
    — assign zones in DOM tree
    — "Next →"
    ↓
  OR

Project Landing → open project → Project Dashboard → "Open Flow"
HtmlUploadStep  [load-flow path]
    — GET /load-flow → template + saved zones restored
    — "Next →"
    ↓

HtmlRecipeStep
    — generate recipe prompt
    — paste AI JSON, validate, apply content
    ↓
HtmlPreviewStep
    — multi-slide iframe preview
    — "Next →"
    ↓
HtmlMetadataStep
    — assign slideId / name / type per slide
    — "Export N Slides" → versioned export
    — "Finish" → Project Dashboard
```

---

## Known Issues & Technical Debt

### P0: Critical
- None currently

### P1: High Priority

#### State Management Scalability
**Issue**: React hooks-based state management (useState/useCallback) works for current scope but will become unwieldy with collaboration features.  
**Impact**: As features grow (comments, real-time sync, undo/redo), component prop drilling increases.  
**Solution**: Consider Zustand or Redux when Phase 5 (Collaboration) begins.  
**Effort**: Medium (refactor ~3 days)

#### Database Integration
**Issue**: Data is persisted as JSON files on the local filesystem.  
**Impact**: No multi-user support; no query/indexing; not suitable for cloud deployment as-is.  
**Solution**: Add PostgreSQL + migrations for projects, zones, versions, audit logs.  
**Effort**: Large (1–2 weeks)  
**Blocking**: Phases 5 & 6

#### File Storage
**Issue**: Output files stored on local disk; not scalable for multi-instance deployment.  
**Impact**: Can't scale horizontally; files lost if server restarts.  
**Solution**: Integrate S3 (or equivalent) for file storage.  
**Effort**: Medium (3–5 days)  
**Blocking**: Production deployment

#### API Authentication & Authorization
**Issue**: No authentication; any user can access any project.  
**Impact**: Security risk; no user isolation.  
**Solution**: Add JWT auth + RBAC middleware.  
**Effort**: Medium (1 week)  
**Blocking**: Production deployment, Phase 5

### P2: Medium Priority

#### CSS Token Completeness
**Issue**: Some hardcoded rgba() values remain (46 instances) due to prior circular token references.  
**Impact**: Design system not fully leveraged; harder to maintain consistency.  
**Solution**: Audit and consolidate all colors into token variables.  
**Effort**: Small (2–3 days)

#### Keyboard Navigation Coverage
**Issue**: Some UI elements lack full keyboard support (e.g., tree expand/collapse via arrow keys).  
**Impact**: Power users and accessibility advocates may find workflow slow.  
**Solution**: Add arrow key navigation to tree, Tab cycling through slides, etc.  
**Effort**: Small (2–3 days)

#### Error Handling Consistency
**Issue**: Error messages vary in tone and clarity; some errors are silent.  
**Impact**: Users confused about what went wrong.  
**Solution**: Standardize error messages; add error boundary for uncaught exceptions.  
**Effort**: Small (2–3 days)

#### Performance: Image Optimization
**Issue**: Large HTML templates with images can slow parsing.  
**Impact**: Upload time increases; preview rendering sluggish.  
**Solution**: Lazy-load images in preview; optimize template size validation.  
**Effort**: Small (2–3 days)

#### Documentation
**Issue**: Only spec documents; no user guide, API docs, or deployment guide.  
**Impact**: Hard for new contributors or users to onboard.  
**Solution**: Create README, API docs (OpenAPI), deployment guide, user tutorial.  
**Effort**: Medium (1 week)

---

## Feature Backlog

### High Priority (Next Sprint)

#### Zone Conflict Resolution UI
**Description**: When a user selects a block zone that contains leaf zones, show a warning and offer to auto-resolve (remove descendants).  
**Why**: Currently conflicts are silently resolved on the backend; users don't know what happened.  
**Effort**: Small (1–2 days)  
**Acceptance Criteria**:
- [ ] Conflict detection in AssignmentPanel
- [ ] Warning modal with "auto-resolve" button
- [ ] Confirmation of removed zones
- [ ] E2E test for conflict flow

#### Recipe Improvements
**Description**: Enhance recipe generation with better formatting, examples, and guidance.  
**Why**: Users struggle to understand what JSON structure to return.  
**Effort**: Small (2–3 days)  
**Acceptance Criteria**:
- [ ] Add "Example JSON" section to recipe
- [ ] Highlight required vs optional fields
- [ ] Add copy-to-clipboard for example
- [ ] E2E test for recipe display

#### Zone Type Inference
**Description**: Auto-detect zone type (text/number/image) from HTML attributes and element context.  
**Why**: Currently defaults to "text"; users must manually override.  
**Effort**: Small (1–2 days)  
**Acceptance Criteria**:
- [ ] Detect `<img>` tags → image type
- [ ] Detect `<input type="number">` → number type
- [ ] Detect `data-type` attribute → use that
- [ ] Unit tests for inference logic

#### Slide Thumbnails in Zone Panel
**Description**: Show small thumbnail previews of each slide in the tree panel.  
**Why**: Large templates are hard to navigate without visual context.  
**Effort**: Medium (3–4 days)  
**Acceptance Criteria**:
- [ ] Thumbnail generation from previewHtml
- [ ] Thumbnails in slide tabs
- [ ] Lazy-load thumbnails
- [ ] E2E test for navigation

#### Ignore/Exclude Zones (Critical)
**Description**: Allow users to mark elements as "ignored" so they will NOT receive AI-generated content, even if a parent element is marked for generation.  
**Why**: Users often need to generate content for a large section but keep specific sub-elements original (e.g., generate a section but preserve a logo or disclaimer).  
**Use Case**: User marks a `<div class="hero-section">` for block zone generation, but wants to keep `<img class="logo">` inside it unchanged.  
**Effort**: Medium (3–4 days)  
**Acceptance Criteria**:
- [ ] Add "Ignore" button to AssignmentPanel (alongside Assign/Edit)
- [ ] Mark ignored elements with visual indicator in tree (e.g., strikethrough, muted color)
- [ ] Include ignored elements in zone data structure (`ignored: true`)
- [ ] Recipe generation skips ignored zones
- [ ] HTML patching respects ignored zones (never patch them)
- [ ] Ignored status persists in project chain.json
- [ ] Can unignore elements (toggle behavior)
- [ ] E2E test: mark parent for generation, ignore child, verify child unchanged
- [ ] Unit tests for conflict resolution (ignored child under generated parent)

#### Full-Slide Content Generation (Critical)
**Description**: Allow users to mark an entire slide for AI generation, generating all content at once based on the existing structure.  
**Why**: Users want to generate a completely new instance or variant of a slide while keeping the same layout and zone structure.  
**Use Case**: User has a "Product Card" slide template with zones for title, description, image, price. They want to generate 5 completely different product cards from the same template.  
**Effort**: Medium (2–3 days)  
**Acceptance Criteria**:
- [ ] Add "Generate Full Slide" button in slide control bar
- [ ] Generates a recipe that includes ALL zones on the slide
- [ ] User pastes AI JSON with all zones filled
- [ ] Validation ensures all zones are present
- [ ] Apply content fills the entire slide at once
- [ ] Works with repeatable slides (each instance generated fully)
- [ ] E2E test: generate full slide, verify all zones filled
- [ ] Unit test: recipe generation includes all slide zones

#### Auto-Expand to Show Assigned Zones (Critical)
**Description**: When loading an HTML file, automatically expand tree nodes to reveal which elements already have zones assigned.  
**Why**: Users need immediate visual feedback on what's already configured, especially when re-opening a project.  
**Use Case**: User uploads an HTML file that already has `data-zone` attributes. The tree should expand to show these pre-assigned zones without clicking manually.  
**Effort**: Small (1–2 days)  
**Acceptance Criteria**:
- [ ] On tree load, detect all nodes with pre-existing zones (data-zone, data-block, data-label-for)
- [ ] Auto-expand parent nodes to reveal assigned zones
- [ ] Highlight/badge assigned zones in the tree
- [ ] Scroll to first assigned zone (optional, nice-to-have)
- [ ] Works with repeatable slides
- [ ] E2E test: upload file with data-zone attrs, verify tree auto-expands
- [ ] Unit test: tree expansion logic for pre-assigned zones

---

### Medium Priority (Later)

#### Zone Search & Filter
**Description**: Search zones by key, hint, or content; filter by type.  
**Why**: Projects with 50+ zones need a way to find specific zones.  
**Effort**: Small (2–3 days)

#### Keyboard Shortcuts Cheat Sheet
**Description**: Modal showing all keyboard shortcuts (Ctrl+/, etc.).  
**Why**: Power users want to work faster.  
**Effort**: Small (1–2 days)

#### Project Templates
**Description**: Pre-built HTML templates for common scenarios (presentation, report, proposal).  
**Why**: Lowers barrier to entry for new users.  
**Effort**: Medium (3–5 days)

#### Batch Zone Assignment
**Description**: Assign the same zone key to multiple elements at once.  
**Why**: Some templates have repeated elements (e.g., 5 bullets).  
**Effort**: Medium (3–4 days)

---

### Low Priority (Backlog)

#### Dark Mode Toggle
**Description**: Add light mode option (currently dark-only).  
**Why**: Some users prefer light mode; good accessibility option.  
**Effort**: Medium (2–3 days)

#### Internationalization (i18n)
**Description**: Support multiple languages (en, de, fr, etc.).  
**Why**: Expand to European market.  
**Effort**: Large (1–2 weeks)

#### Mobile Responsive Design
**Description**: Make the UI work on tablets and phones.  
**Why**: Users may want to review projects on mobile.  
**Effort**: Large (2–3 weeks)

---

## Performance & Optimization

### Current Metrics
- **Page Load**: ~1.2s (Vite dev mode)
- **HTML Parse**: <100ms (typical 1–2MB template)
- **Tree Render**: <50ms (typical 100–200 nodes)
- **Preview Render**: <200ms (typical 3–5 slides)
- **Recipe Generation**: <50ms

### Optimization Opportunities

#### 1. Code Splitting
- [ ] Lazy-load HtmlEditorPanel (CodeMirror is 500KB+)
- [ ] Separate route bundles (flow-select, html-upload, etc.)
- [ ] Estimated savings: 30–40% initial bundle size

#### 2. Memoization
- [ ] Memoize recipe generation (currently regenerates on every keystroke)
- [ ] Memoize tree node rendering (already done with React.memo)
- [ ] Memoize preview HTML generation

#### 3. Image Optimization
- [ ] Lazy-load preview iframes
- [ ] Compress template images on upload
- [ ] Generate responsive image sizes

#### 4. Backend Optimization
- [ ] Cache zone extraction for repeated uploads
- [ ] Optimize HTML parsing (currently uses node-html-parser)
- [ ] Add request rate limiting

---

## Infrastructure & DevOps

### Current Setup
- **Local Development**: `npm run dev` (concurrent server + client)
- **Testing**: `npm test` (unit), `npm run test:e2e:html` (E2E)
- **Build**: `npm run build` (Vite client build)
- **Deployment**: Not yet (in-memory only)

### Deployment Readiness Checklist
- [ ] Database integration (PostgreSQL)
- [ ] File storage (S3 or equivalent)
- [ ] Authentication (JWT + RBAC)
- [ ] Environment configuration (.env, secrets)
- [ ] Docker containerization
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Monitoring & logging (error tracking, metrics)
- [ ] Backup & disaster recovery
- [ ] Load testing & capacity planning

---

## Documentation & Support

### Current Documentation
- ✅ SPEC-visual-flow.md — Architecture & zone model
- ✅ SPEC-repeatable-slides.md — Repeatable slide details
- ✅ .impeccable.md — Design system & accessibility

### Missing Documentation
- [ ] **README.md** — Project overview, quick start, architecture diagram
- [ ] **API.md** — OpenAPI spec for all endpoints
- [ ] **CONTRIBUTING.md** — Development workflow, PR process, code style
- [ ] **DEPLOYMENT.md** — Production setup, configuration, troubleshooting
- [ ] **USER_GUIDE.md** — Step-by-step tutorial for end users
- [ ] **CHANGELOG.md** — Version history and release notes
- [ ] **TROUBLESHOOTING.md** — Common issues and solutions

### Help & Support
- [ ] FAQ page in UI
- [ ] Video tutorials (YouTube)
- [ ] Email support template
- [ ] Community forum or Slack channel
- [ ] Bug report template (GitHub Issues)

---

## How to Use This Backlog

### For Planning
1. Pick a phase from the roadmap
2. Break down features into tasks (estimate effort)
3. Assign to sprint (1–2 weeks)
4. Track progress in GitHub Issues or project board

### For Prioritization
- **P0**: Critical bugs, blocking issues
- **P1**: High-impact features, technical debt
- **P2**: Nice-to-have improvements
- **P3**: Long-term vision, nice-to-haves

### For Tracking
- Create GitHub Issues for each task
- Link to this backlog
- Use labels: `backlog`, `phase-2`, `performance`, `accessibility`, etc.
- Close issues when complete with PR reference

### For Communication
- Share this backlog with stakeholders
- Update quarterly as priorities shift
- Reference in sprint planning meetings
- Include in release notes

---

## Notes for Future Development

### Design System
- Keep using Geist + JetBrains Mono
- Maintain dark theme as primary
- Expand color palette only if needed (currently sufficient)
- Document any new design patterns in .impeccable.md

### Testing Strategy
- Maintain 100% E2E coverage for critical paths
- Add unit tests for business logic (zone validation, recipe generation)
- Consider property-based testing for HTML parsing edge cases

### Code Quality
- Use ESLint + Prettier for consistency
- Require code review for all PRs
- Keep components small and focused
- Document complex algorithms with comments

### User Research
- Conduct user interviews before major features
- A/B test new UI patterns
- Monitor error logs for pain points
- Gather feature requests systematically

---

**End of Backlog**  
Last reviewed: 2026-04-15  
Next review: 2026-05-15
