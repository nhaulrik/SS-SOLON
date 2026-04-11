# Spec: Sequential Multi-Patch

**Status**: Draft  
**Author**: nch  
**Date**: 2026-04-10

---

## Problem

AI agents have practical context limits. A PPTX with many tagged elements produces a recipe prompt that is too large to send to an AI in a single call, and the expected JSON response becomes too large to generate reliably. The current workflow forces all content generation into a single round, which breaks for any presentation of realistic size.

Beyond size, different parts of a presentation require fundamentally different kinds of AI work. Generating many repeatable slide instances (e.g., a roadmap with 12 initiative cards) is a different cognitive task from populating precise calculated fields (e.g., revenue figures, dates, a tailored executive summary). Mixing both into one recipe produces a worse result from the AI: the prompt is unfocused, the response schema is complex, and errors in one part invalidate the whole response.

There is also no way to iterate — apply some content, review it, then apply more — without discarding all prior work and regenerating from scratch.

---

## Goal

Allow the same PPTX to be patched multiple times in sequence. Each patch round has a single, focused motivation — either expanding the deck with AI-generated slide instances, or populating specific elements with calculated field values — and produces a correspondingly focused recipe. Patches accumulate; each round builds on the last until the user decides to generate the final downloadable file.

---

## Concepts

### Patch Chain

A **Patch Chain** is the sequence of patch rounds applied to a single PPTX. It starts with the original uploaded file. Each round produces a **checkpoint file** — a fully valid PPTX — that is downloaded to the user's machine and also retained on the server as the base for the next round.

```
original.pptx
    └─► Patch 1 ("Title & Intro")  → deck-patch-1.pptx  ↓ downloaded
            └─► Patch 2 ("Roadmap") → deck-patch-2.pptx  ↓ downloaded
                    └─► [Generate Final File] → deck-patch-3.pptx  ↓ downloaded
```

Every output — intermediate or final — is a downloaded file. There is no separate "final generate" step conceptually; the difference is only that after a checkpoint the UI resets for the next round, whereas "Generate Final File" leaves the UI in the preview state.

### Patch Round

One step in the chain. A patch round has:
- A user-given **name** (e.g., "Title & Intro", "Financial Slides")
- The **base file** it was applied to (original or previous checkpoint)
- Its own set of **tags** (elements targeted this round — typically a subset of all elements)
- Its own **recipe**, **AI JSON input**, and **validation result**
- A **status**: `draft` → `validated` → `applied`

### Checkpoint File

Every time the user clicks **Apply Patch & Continue**, the server produces a new PPTX incorporating all changes from this round on top of the previous base. This file is:

1. **Downloaded immediately** to the user's machine, named `{originalName}-patch-{N}.pptx` (e.g., `deck-patch-1.pptx`)
2. **Retained on the server** inside the chain folder as the base for the next round

The downloaded file is the user's checkpoint. It is a fully valid PPTX — not a proprietary format — so it can be shared, opened in PowerPoint, or re-uploaded into Solon to restart or branch from that point. No special resume mechanism is needed.

### Going Back (Branching via Re-upload)

To return to an earlier point in the chain, the user simply uploads one of their previously downloaded checkpoint files. The app treats it as a fresh upload — a new session starts from that PPTX. Tag configuration from prior rounds is not carried over; the user re-tags the elements they want to change in the new round. This is an intentional trade-off: the PPTX is the state, and re-tagging is typically fast.

### Final Generation

"Generate Final File" is the same as "Apply Patch & Continue" mechanically — it produces and downloads a checkpoint PPTX. The only difference is UI behaviour: instead of resetting to the Tag step, the preview stays visible so the user can review the completed deck. The chain remains open; the user can continue patching from the preview step if they choose.

---

## Patch Patterns

A patch round is not just a "subset of elements" — it has a **motivation** that shapes what the recipe asks the AI to do and what the response JSON looks like. Two primary patterns emerge:

### Pattern A — Slide Expansion

**Motivation**: The AI draws on its contextual knowledge to generate many structured slide instances. The user wants the deck to grow: for example, generating 8 initiative cards from a roadmap template, or producing one detail slide per product area. The AI decides the content and quantity of instances within the constraints the recipe provides.

**What the user configures this round**:
- `repeatableSlides`: which template slides can repeat, their `structureType`, and a `customPrompt` that tells the AI what kind of instances to generate
- Few or no individual element tags — the field values come from the AI's instance data, not from individually tagged elements

**Recipe shape**: Dominated by the `SLIDES` section. Asks the AI to return a JSON object with arrays of typed instances (`{ "initiatives": [ {...}, {...} ] }`). Each instance contains all the field values for one slide copy.

**Result**: The intermediate file has **more slides** than the base — the repeatable template slides have been expanded into N copies with content filled in.

**Example chain usage**:
```
original.pptx  (has 1 "initiative card" template slide)
    └─► Expansion patch: "Generate Roadmap Initiatives"
            → AI returns 10 initiative instances
            → intermediate-1.pptx now has 10 initiative slides
```

---

### Pattern B — Calculated Field Population

**Motivation**: The AI provides precise values for specific, individually identified elements. The user wants particular text boxes, labels, or callouts filled with calculated or tailored content — a revenue figure, an executive summary paragraph, a product name — where the exact wording or value matters and is derived from the AI's reasoning rather than raw input data.

**What the user configures this round**:
- `tags`: individual elements tagged with keys, hints, and `maxChars` constraints
- No new `repeatableSlides` config (the slide structure is already fixed by this point)

**Recipe shape**: Dominated by the `STATIC FIELDS` section. Asks the AI to return a flat JSON map of `key → value` strings. Each value is a precise, constrained piece of content.

**Result**: The intermediate file has the **same slide count** as the base, but specific text elements have been replaced with AI-generated values.

**Example chain usage**:
```
intermediate-1.pptx  (slides exist, some fields still show placeholder text)
    └─► Fields patch: "Populate Executive Summary & Title"
            → AI returns { "exec_summary": "...", "deck_title": "..." }
            → intermediate-2.pptx has those fields filled in
```

---

### Combining Patterns in a Chain

The two patterns are complementary and can appear in any order. Common chain compositions:

| Chain | Round 1 | Round 2 | Round 3 |
|-------|---------|---------|---------|
| Structure-first | Expansion (slide instances) | Calculated fields | — |
| Fields-first | Calculated fields (frame the narrative) | Expansion (bulk content) | — |
| Large deck | Expansion (group slides) | Expansion (detail slides) | Calculated fields |
| Iterative | Expansion | Calculated fields | Expansion (second section) |

A round may also be **mixed** — both `repeatableSlides` and `tags` configured — when the content is genuinely small enough for one AI call. The patterns are guidance, not hard constraints.

---

## User Flow

### Starting a Patch Chain

The flow is identical to today up through the Validate step:

1. Upload PPTX
2. Tag a **subset** of elements (just the ones targeted this round — no need to tag everything upfront)
3. Generate recipe → copy to AI → get JSON back
4. Paste JSON → validate

### The Revised Preview Step (key change)

After validation passes, the current "Generate" step becomes a **choice**:

> **Apply this patch and continue** → applies changes to the current base file, saves an intermediate, resets the workflow so the user can start the next patch round on top of it.
>
> **Generate final file** → applies changes and produces a downloadable PPTX. Same as today's "Generate" button. The chain is not advanced.

Both actions apply the same changes. The difference is only whether the output is an intermediate (continue patching) or a final (download and done).

### After "Apply and Continue"

1. Server applies JSON to the base PPTX, writes `intermediate-N.pptx` to persistent storage.
2. The completed patch round is saved to the patch chain record.
3. The UI resets to the **Tag step**, with the intermediate file loaded as the new base.
4. A **chain indicator** (top of the page) shows all applied rounds so far, e.g.:
   `[✓ Title & Intro] → [✓ Roadmap] → [Patch 3 — in progress]`
5. The user tags a new set of elements, generates a new recipe, and continues.

### After "Generate Final File"

Output PPTX is available for download, same as today. The chain indicator shows all applied rounds plus the final generation step.

### Naming Patches

When the user clicks "Apply and Continue" or "Generate Final File", a prompt asks for a name for this patch round (pre-filled with a default like "Patch 1"). The name is stored with the patch record and shown in the chain indicator. This is how multiple patches on the same PPTX stay distinguishable.

### Restarting from an Earlier Point

The chain indicator is clickable. Clicking an earlier patch round lets the user branch from that point — i.e., discard everything after it and start a new round from that intermediate. This is out of scope for v1 but the data model should support it.

---

## Patch Persistence

### Current State (problem)

Today, patches are saved to `server/patches/{id}-{name}.json`. But the uploaded PPTX lives in `server/temp/` and is not linked to the patch record in a durable way. If the server restarts, the temp file is gone and the patch becomes orphaned.

Multiple patches for the same PPTX are distinguished only by filename match (`patch.pptxFile === templateFile.fileName`), with no notion of ordering or chaining.

### New State

**Checkpoint files** are stored in `server/patch-chains/` (permanent, not temp):
```
server/patch-chains/
  {chainId}/
    original.pptx          ← copy of the uploaded file, taken when chain is created
    sample-patch-1.pptx    ← {originalName}-patch-{N}.pptx
    sample-patch-2.pptx
    ...
    chain.json
```

The original is copied from temp into the chain folder immediately when the user begins the first patch round. Temp files remain temp.

**Patch chain record** is a new JSON file alongside the intermediates:
```
server/patch-chains/{chainId}/chain.json
```

---

## Data Model

### Chain Record (`chain.json`)

```jsonc
{
  "id": "chain-1712750000000",
  "pptxFileName": "sample.pptx",        // original filename, for display
  "createdAt": "2026-04-10T10:00:00Z",
  "updatedAt": "2026-04-10T14:30:00Z",
  "rounds": [
    {
      "id": "round-1",
      "name": "Generate Roadmap Initiatives",
      "focus": "expansion",             // "expansion" | "fields" | "mixed"
      "status": "applied",              // draft | validated | applied
      "baseFile": "original.pptx",      // relative to chain folder
      "outputFile": "sample-patch-1.pptx",   // {originalName}-patch-{N}.pptx
      "tags": [],                       // empty: expansion round, fields come from instances
      "repeatableSlides": [
        {
          "slideIndex": 3,
          "structureType": "initiative",
          "customPrompt": "Generate one slide per strategic initiative for 2026"
        }
      ],
      "globalPrompt": "...",
      "recipe": "...",                  // generated recipe text
      "jsonInput": "...",               // raw JSON pasted by user
      "appliedAt": "2026-04-10T11:00:00Z"
    },
    {
      "id": "round-2",
      "name": "Executive Summary & Metrics",
      "focus": "fields",                // fields round: tags only, no new repeatableSlides
      "status": "draft",
      "baseFile": "sample-patch-1.pptx",
      "outputFile": null,               // null until applied
      "tags": [
        {
          "elementId": "slide1-elem2",
          "key": "solon_exec_summary",
          "hint": "Two-sentence executive summary of the 2026 strategy",
          "slideIndex": 1,
          "originalText": "...",
          "maxChars": 220,
          "autoGenerate": true
        }
      ],
      "repeatableSlides": [],
      "globalPrompt": "...",
      "recipe": null,
      "jsonInput": null,
      "appliedAt": null
    }
  ]
}
```

### Relationship to Existing Patches

Existing patches (in `server/patches/`) are **not migrated**. They continue to work as before — single-round patches with no chain. New patch chains live in `server/patch-chains/`. The patch selector dropdown on the UI shows both existing patches and chains (with a label to distinguish them).

---

## API Changes

### New: `POST /api/patch-chains` — create chain

Called the first time a user chooses to patch (not generate). Copies the uploaded temp file to `server/patch-chains/{chainId}/original.pptx`, creates `chain.json` with an initial `rounds` array.

**Request**: `{ templatePath, pptxFileName }`  
**Response**: `{ chainId, chainPath }`

### New: `POST /api/patch-chains/:chainId/apply` — apply a round

Applies the round's tags + JSON to the round's base file, writes the checkpoint PPTX named `{originalName}-patch-{N}.pptx`, marks the round as `applied`, and saves `chain.json`.

**Request**: `{ tags, jsonData, repeatableSlides, roundName, focus }`  
**Response**: `{ ok, chainId, roundId, outputFile, nextBasePath, previewData, downloadUrl }`

The `downloadUrl` points to the checkpoint file. The client triggers this download immediately after apply, then parses `nextBasePath` via `POST /api/parse-pptx-from-path` to load the Tag step for the next round.

### New: `GET /api/patch-chains` — list all chains

Returns summary records for all chains (id, pptxFileName, round count, last updated). Used for audit/cleanup UI only — resuming a chain is done by re-uploading a checkpoint file, not via this endpoint.

### New: `GET /api/patch-chains/:chainId` — get chain record

Returns the full `chain.json`. Used for audit/cleanup UI.

### Extended: `POST /api/generate-recipe` — no change needed

The recipe is already scoped to whatever `tags` the client sends. The client simply sends only the tags for the current round. No API change required.

### Extended: `POST /api/validate-json` — no change needed

Same logic; client sends only the current round's tags for validation.

---

## UI Changes

### Chain Indicator

Shown above the step breadcrumbs once a chain exists (i.e., at least one round has been applied). Each round displays its name and a type badge so the user can see the pattern sequence at a glance:

```
[✓ ⬡ Roadmap Initiatives]  →  [✓ ◈ Exec Summary & Metrics]  →  [◈ Financial Data — in progress]
```

Legend: `⬡` = expansion round (adds slides), `◈` = fields round, `⬡◈` = mixed

Each applied step shows its name with a checkmark. The current in-progress step is highlighted. Clicking a step shows a tooltip with: applied timestamp, focus type, tag count or instance count, and a "Branch from here" option (v2).

### Preview Step — Two Buttons

Replace the single "Generate Presentation" button with two clearly labelled actions:

| Button | Label | What happens |
|--------|-------|-------------|
| Secondary | **Apply Patch & Continue →** | Applies changes, downloads checkpoint PPTX, resets to Tag step for next round |
| Primary | **Generate Final File ↓** | Applies changes, downloads checkpoint PPTX, stays on preview |

Both buttons produce an identical checkpoint PPTX and trigger the same download. The only difference is what the UI does afterward: Apply resets for the next round; Generate stays so the user can review the completed deck.

Both are disabled until JSON validation passes.

### Patch Name Prompt

When the user clicks either button, a small inline prompt (not a modal) appears above the buttons, pre-filled with "Patch N" (auto-incremented). User can rename or leave it and confirm. Name is stored with the round record.

### Patch Selector (Upload Step)

No change needed for chain resumption — users re-upload a checkpoint file to continue from that point. The upload zone already handles any PPTX.

The patch selector may optionally show a read-only chain history panel (Story 3) for audit and cleanup, but it is not required for the core multi-patch workflow.

### New Round Prompt (after Apply & Continue)

When the UI resets to the Tag step for a new round, a brief prompt appears at the top before the user starts tagging:

> **What is this patch about?**
> ○ Expand slides — ask AI to generate multiple slide instances from a template  
> ○ Populate fields — ask AI to fill specific elements with calculated values  
> ○ Both  

This is a soft framing choice — it pre-configures the Tag step UI (see below) and sets the `focus` field on the round record, but does not restrict what the user can do. It can be changed at any time during the round.

### Tag Step — Contextual UI Based on Focus

The Tag step adapts based on the round's selected focus:

**Expansion focus**: The slide canvas still shows, but the primary action is configuring **Repeatable Slides** — the checkbox and `structureType` / `customPrompt` fields are prominently surfaced. Individual element tagging is de-emphasised (collapsed under "Also tag specific fields").

**Fields focus**: The slide canvas is primary. The Repeatable Slides panel is collapsed by default ("No new slide expansion this round"). Individual element tagging works exactly as today.

**Mixed**: Both panels are visible and equal weight (same as today's Tag step, unchanged).

### Tag Step — Visual Indicator for Already-Patched Elements

When working on a chain, elements that were tagged and applied in a **previous round** are shown with a locked appearance (e.g., muted colour, lock icon on hover). They can still be tagged again in a new round (e.g., to override), but the visual makes clear they already have content applied.

For slides expanded in a previous round (e.g., initiative slides generated in Round 1), the slide thumbnails in the panel show a badge indicating they were generated by a prior expansion round and their content is already set.

---

## Build Stories

Each story delivers working, independently useful functionality. They are ordered by dependency — each one builds on the previous but does not require the next one to be useful.

---

### Story 1 — Apply & Continue

**"As a user, I can apply a patch, get a checkpoint file, and immediately start another patch on the result."**

The core chain mechanic. Everything else builds on this.

**What ships:**
- At the preview step, two buttons replace the single Generate button:
  - **Apply Patch & Continue →** — applies changes, downloads checkpoint PPTX, resets to Tag step
  - **Generate Final File ↓** — applies changes, downloads checkpoint PPTX, stays on preview
- Both buttons produce the same server-side output. The difference is UI behaviour only.
- Clicking **Apply Patch & Continue**:
  1. Server creates `server/patch-chains/{chainId}/`, copies uploaded PPTX to `original.pptx`
  2. Generates checkpoint, saves as `{originalName}-patch-1.pptx` in chain folder
  3. Returns `downloadUrl` + `nextBasePath`
  4. Client triggers download of checkpoint file (browser download, page stays open)
  5. Client calls `POST /api/parse-pptx-from-path` on `nextBasePath` to get slides
  6. UI resets to Tag step with checkpoint loaded as new base
  7. User tags new elements, generates new recipe, applies again → `{originalName}-patch-2.pptx`
- Clicking **Generate Final File** follows the same server path but the client stays on the preview step after download

**Going back:** user re-uploads any previously downloaded checkpoint PPTX. The app treats it as a fresh upload — new session, clean state. No special server logic needed.

**What is NOT included:** no chain indicator, no round naming, no locked element visuals.

**Assumptions baked in:**
- Round 2's Tag step shows elements with their Round 1 values as the current text. Acceptable for v1.
- Only one expansion round per chain is supported reliably. Multiple expansion rounds may shift slide indices; addressed in a later story.

**Server changes:** ✅ implemented
- `POST /api/patch-chains` — create chain, copy original, return `chainId`
- `POST /api/patch-chains/:chainId/apply` — apply round, write `{originalName}-patch-{N}.pptx`, update `chain.json`, return `downloadUrl` + `nextBasePath`
- `GET /api/patch-chains/:chainId/download/:filename` — serve checkpoint file
- `POST /api/parse-pptx-from-path` — parse intermediate from server path for next round's Tag step

**Client changes:** ✅ implemented
- Preview step: two buttons
- `applyPatchAndContinue`: create chain → apply → trigger download → parse intermediate → reset to Tag step
- `generateFinalFile`: apply (chain) or generate (no chain) → trigger download → stay on preview
- Auto-load patch logic gated on `chainId === null` so it does not fire mid-chain

---

### Story 2 — Round Names & Chain Indicator

**"As a user, I can name my patch rounds and see a timeline of what I've applied so far."**

Adds visibility and context. Without it, the user has no record of what happened in prior rounds.

**What ships:**
- When the user clicks either **Apply Patch & Continue** or **Generate Final File**, a name prompt appears (inline, pre-filled "Patch 1", "Patch 2", etc.)
- Name is stored in `chain.json` on the round record
- A **chain indicator** appears above the step breadcrumbs once at least one round has been applied:
  ```
  [✓ Roadmap Initiatives]  →  [✓ Exec Summary]  →  [Patch 3 — in progress]
  ```
- Applied rounds show a checkmark. The in-progress round is highlighted.
- Hovering an applied round shows a tooltip: name, applied timestamp, number of tags

**What is NOT included:** no resume from selector, no focus badges, no branch-from-here.

**Server changes:** none — `chain.json` already stores `name` and `appliedAt` from Story 1.

**Client changes:**
- Name prompt component at the preview step
- Chain indicator component above breadcrumbs, reads from in-memory chain state

---

### Story 3 — Chain History & Cleanup

**"As a user, I can see a log of my patch chains and delete ones I no longer need."**

Provides visibility into server-side chain storage and a way to clean it up. Resuming a chain is handled by re-uploading a checkpoint file (no special UI needed for that).

**What ships:**
- A **Chain History** panel accessible from the Upload step (e.g., a small link or collapsible section below the upload zone)
- Lists all chains stored on the server:
  ```
  sample.pptx      3 rounds    last updated 2026-04-10
  deck.pptx        1 round     last updated 2026-04-09
  ```
- Each entry shows: original filename, number of applied rounds, last updated timestamp, list of checkpoint filenames
- **Delete** button per chain — confirm prompt → removes the chain folder entirely
- No "resume from here" button — user re-uploads the checkpoint file they want to continue from

**Server changes:**
- `GET /api/patch-chains` — list all chains
- `GET /api/patch-chains/:chainId` — return full `chain.json`
- `DELETE /api/patch-chains/:chainId` — remove chain folder

**Client changes:**
- Chain history panel component (read-only list + delete)
- Delete handler with confirm prompt

---

### Story 4 — Patch Focus & Contextual Tag Step

**"As a user, when I start a new patch round the app helps me configure the right things for what I'm trying to do."**

Adds the expansion vs. fields distinction from the Patch Patterns section of this spec.

**What ships:**
- After **Apply & Continue** resets to the Tag step, a focus prompt appears at the top:
  > **What is this patch about?**  
  > ○ Expand slides — generate multiple slide instances from a template  
  > ○ Populate fields — fill specific elements with calculated values  
  > ○ Both
- Selecting **Expand slides** surfaces the Repeatable Slides panel prominently; individual element tagging is collapsed
- Selecting **Populate fields** collapses the Repeatable Slides panel; the slide canvas is primary (same as today)
- Selecting **Both** shows both panels equally (same as today's default Tag step)
- The chosen focus is stored as `focus: "expansion" | "fields" | "mixed"` on the round record in `chain.json`
- Chain indicator shows a type badge per applied round (e.g., `[✓ ⬡ Roadmap Initiatives]` for expansion, `[✓ ◈ Exec Summary]` for fields)

**Server changes:** none — `focus` is stored in `chain.json` via the existing apply endpoint.

**Client changes:**
- Focus prompt component (shown only when inside a chain, not for first-time patches)
- Tag step: conditional panel layout based on `focus` state
- Chain indicator: focus badge rendering

---

### Story 5 — Already-Patched Element Indicators

**"As a user, I can see at a glance which elements are already covered by a previous round."**

Prevents accidental double-patching and helps the user plan what's left.

**What ships:**
- In the Tag step, elements that were tagged and applied in **any prior round of the current chain** are rendered with a muted/locked appearance on the canvas overlay (e.g., greyed out, with a small lock icon on hover)
- Hovering a locked element shows a tooltip: "Patched in: [Round Name]"
- The element can still be tagged in the current round (to override) but requires an intentional click — clicking a locked element shows a confirmation: "This element was already set in [Round Name]. Tag it again to override?"
- Slide thumbnails generated by a prior expansion round show a small badge: "Generated in [Round Name]"

**Server changes:** none — prior round tag data is already in `chain.json`.

**Client changes:**
- Derive the set of all previously patched `elementId`s from `chain.rounds` (applied rounds only)
- Pass this set to the slide canvas overlay renderer
- Lock state rendering + hover tooltip
- Override confirmation prompt

---

## Out of Scope (v1)

- Branching from an earlier point in the chain (the UI shows the option but it is disabled)
- Merging two chains
- Sharing chains between users / team collaboration
- Viewing a diff of what changed between intermediates
- Auto-naming rounds based on which slides were tagged

---

## Open Questions

1. **Cleanup**: When should intermediate files be deleted? Proposal: never automatically. Provide a manual "Delete chain" action in the patch selector that removes the folder and chain record.

2. **Generate Final File advances the chain or not?** ✅ Decided: "Generate Final File" both downloads the file AND saves it as the new intermediate. The chain remains open and the user can continue patching from that point if they choose.

3. **Element overlap between rounds**: Nothing prevents a user from tagging the same element in two different rounds. Second round's value wins (it was applied last). Should there be a warning? Proposal: warn at apply time if a tag overlaps with a prior round's tag.

4. **Original file size**: Copying the original to the chain folder means storage grows. Proposal: acceptable for v1 since PPTX files are typically small; revisit if storage becomes a concern.

5. **Expansion after fields**: If a fields round populates a text element and a later expansion round generates instances of that same template slide, the generated instances inherit the field values from the intermediate (already filled in). This is usually correct, but could produce duplicated fixed text across all instances if the user intended the field to vary per instance. Should the UI warn when an expansion round targets a slide that already has fields applied by a prior round? Proposal: warn with a note explaining the behaviour, but allow it.

6. **Recipe for expansion rounds referencing prior round context**: An expansion round may benefit from knowing what was populated in a prior fields round (e.g., the executive summary set in Round 1 informs the tone of the initiative slides generated in Round 2). Today the recipe has no access to prior rounds' outputs. Proposal: out of scope for v1; the user can manually include relevant context in the `globalPrompt` of the expansion round.
