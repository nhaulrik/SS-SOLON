---
name: workflow
description: Enforces the project's mandatory change checklist. Use proactively after every implementation — new features, bug fixes, refactors, or any modification to server or client code. Covers e2e test coverage, regression safety, best practices, and documentation.
version: 1.0.0
user-invocable: true
---

## PURPOSE

After every change — no matter how small — run through this checklist before considering the work done. These are non-negotiable quality gates, not suggestions.

---

## 1. E2E TEST COVERAGE

Ask: **does this change affect user-visible behaviour?**

- If yes, check whether an existing e2e test already covers it. If not, determine whether a new test is warranted.
- Write a new e2e test **only** when the behaviour is meaningful enough to protect — e.g. a new user flow, a fixed regression, a critical rendering path. Do not write tests for trivial or purely cosmetic changes.
- Do not accumulate tests for their own sake. Every test must earn its place by protecting something real.
- Place tests in `e2e/` following the existing naming convention (`<feature>.spec.js`).
- Run the relevant test suite after writing to confirm it passes: `npx playwright test <file>`.

## 2. REGRESSION SAFETY

Before marking work done:

- Run the full e2e suite: `npx playwright test --workers=4 --reporter=line`
- If any test fails, determine whether it is:
  - A **pre-existing failure** (document it, do not introduce new failures on top of it), or
  - A **regression caused by this change** — fix it before finishing.
- Run unit/integration tests where applicable: `npm test`
- Manually verify the affected flow in the browser if the change touches rendering, layout, or interaction.

## 3. BEST PRACTICES

Every change must meet these standards:

**Code quality**
- No `console.log` / debug output left in production paths.
- No commented-out dead code.
- No unused imports or variables.
- Follow the existing code style — naming conventions, file structure, module patterns.

**Server (Node / Express)**
- Parser changes must be verified against the actual PPTX file (`product_catalog.pptx`) using a debug script before shipping.
- All new fields added to parsed slide elements must be passed through the full pipeline: parser → API response → client state → renderer.
- Regex patterns handling XML must account for both self-closing (`<tag/>`) and open/close (`<tag>...</tag>`) forms.
- Coordinate values from OOXML are in EMU — always divide by `slideWidth` / `slideHeight` to normalise to [0, 1] before sending to the client. Never clamp dimensions that should be thin (e.g. accent bars).

**Client (React)**
- `SlidePreview` is the single source of truth for slide rendering. Do not duplicate coordinate normalisation logic elsewhere.
- Bounds received from the server are already normalised [0, 1] — multiply by 100 for `%` values. Never re-normalise.
- CSS `aspect-ratio` must not be hardcoded to `16/9` anywhere — always derive it from actual slide dimensions.
- `container-type: inline-size` must only be on the `.slide-preview-canvas` wrapper; the inner `.slide-preview-stage` fills it with `position: absolute; inset: 0`.
- The click overlay (`.slide-overlay`) must be a sibling of `.slide-preview-stage` inside `.slide-preview-canvas`, passed via the `overlay` prop — never positioned relative to an outer wrapper.

## 4. DOCUMENTATION

- If the change adds, removes, or alters a user-facing feature, update `docs/` accordingly.
- If the change modifies the data contract between server and client (new fields on slide elements, new API endpoints, changed response shapes), note it in the relevant section of the docs.
- If the change introduces a new architectural pattern or constraint (e.g. a new rendering rule, a new parser convention), add a comment in the code and update docs so future contributors understand the intent.
- Do not create documentation for its own sake — update only what is affected.
