# Spec: Tag Table Redesign

**Status**: Draft  
**Author**: nch  
**Date**: 2026-04-10

---

## Problems

### 1. Auto-key pollution

When a PPTX is loaded fresh, every text element is auto-tagged with a key derived from its content:

```
"Revenue grew by 23% year-over-year" → key: "revenue_grew_by_23_yearoveryear"
"Product description goes here"       → key: "product_description_goes_here"
```

These keys are:
- **Meaningless semantically** — the key should describe the role of the field, not its current value
- **Unique by accident** — two slides with elements playing the same role (e.g., a `description` field on slide 2 and slide 4) will get different, unrelated keys, making cross-slide coordination invisible
- **Cluttered in the recipe** — the AI receives keys it cannot meaningfully interpret
- **Unstable** — if the element text changes, the key changes, breaking any saved patches

The right behaviour on fresh load: elements appear with **no key**. The user names them. Naming is the act of declaring intent.

### 2. Shallow field instruction

The current `hint` field serves as a one-liner instruction to the AI. This breaks down in two ways:

**A — No separation between "what to generate" and "what this slide is about"**

For a contextual field (`description` on slide 2 and slide 4), the hint doubles as both a generation instruction and a slide-context signal. The AI has to parse both from a single string. These are distinct concerns and should be separate.

**B — No way to express field dependencies**

Some fields on a slide are semantically related. A `key_insight` field might only make sense if the AI knows what `product_name` and `metric_value` already say on that slide. Today there is no mechanism to declare this relationship. The user has to smuggle the dependency into the hint string manually ("Key insight about the product described in the product_name field, referencing the metric in metric_value"). This is fragile, verbose, and opaque.

---

## Goal

Redesign the patch table so that:

1. Keys are always **user-authored**, never derived from element text
2. The table shows **all slides at once**, making cross-slide key reuse visible and easy
3. Each field carries a structured **generation prompt** (what to generate) separate from the slide context (what this slide is about)
4. Each field can declare **context field references** — other keys on the same slide the AI should consider when generating this field

---

## Data Model Changes

### Tag (extended)

```jsonc
{
  "elementId": "slide2-elem3",
  "key": "description",             // user-authored; empty string until user sets it
  "prompt": "Write a 2-sentence product description focused on the primary customer benefit.",
  "contextFields": ["product_name", "category"],  // NEW: other keys on same slide
  "slideIndex": 2,
  "originalText": "Product description goes here",
  "maxChars": 180,
  "autoGenerate": true
}
```

**`prompt`** — replaces `hint` as the primary AI instruction for auto-generate fields. The `hint` field is retained for backward compatibility with existing patches but is treated as a fallback: if `prompt` is set, `prompt` takes precedence in the recipe; otherwise `hint` is used.

**`contextFields`** — array of key strings that exist on the same slide. When a field has context references, the recipe includes the prompts (or hints) of the referenced fields alongside the instruction for this field. The AI uses them to understand the semantic context, not to produce values — the referenced fields are generated in the same pass.

**`key`** — no longer auto-derived. Empty string on initial load. Elements with an empty key are shown in the table but excluded from the recipe and validation (with a visual warning: "N elements have no key — they will be skipped").

---

## Auto-Load Behaviour Change

**Current**: on fresh load, all elements get a content-derived key and are saved as an auto-patch immediately.

**New**: on fresh load, all elements are added to `tags` with `key: ''`, `prompt: ''`, `contextFields: []`, `autoGenerate: false`. No patch is auto-saved until the user has set at least one key. The auto-save fires on the first key assignment.

This is the only behavioural change to the load path. Everything else (patch selector, merge logic, chain behaviour) is unchanged.

---

## Patch Table Redesign

The patch table is the primary workspace for configuring fields. It replaces the per-slide-only view with a full cross-slide table.

### Layout

The table spans the full left panel and is grouped by slide. Each slide group is collapsible.

```
┌─────────────────────────────────────────────────────────────────────┐
│ [All slides ▾]   [Filter: all / AI only / no key]   [+ Add field]  │
├──────┬───────────────┬────┬──────────────────────────┬──────────────┤
│ Slide│ Element       │ AI │ Key                      │ Actions      │
├──────┴───────────────┴────┴──────────────────────────┴──────────────┤
│ ▾ Slide 1                                                           │
│  1   │ "Revenue grew…"│ ○  │ [                      ] │ ✎           │
│  1   │ "Q4 2025 Res…" │ ●  │ [exec_summary          ] │ ✎           │
│ ▾ Slide 2                                                           │
│  2   │ "Product desc…"│ ●  │ [description  ⬡        ] │ ✎           │
│ ▾ Slide 4                                                           │
│  4   │ "Also a desc…" │ ●  │ [description  ⬡        ] │ ✎           │
└─────────────────────────────────────────────────────────────────────┘
```

`⬡` = shared-key badge (contextual field — same key on multiple slides)

### Columns

| Column | Content | Editable |
|--------|---------|----------|
| Slide | Slide number | No |
| Element | First 40 chars of original text | No (click to highlight on canvas) |
| AI | Toggle: auto-generate on/off | Inline toggle |
| Key | Field name | **Inline text input** |
| Actions | Edit button → opens field detail panel | — |

### Key Input Behaviour

- Starts empty on fresh load (placeholder text: `name this field…`)
- Validates on blur: alphanumeric + underscores only, no spaces
- If the typed key already exists on a different slide: show `⬡` badge, no error — this is intentional (contextual field)
- If the typed key already exists on the **same slide**: show inline error `Key already used on this slide`
- Tab key moves focus to the next row's key input (keyboard-friendly bulk naming)

### Field Detail Panel

Clicking ✎ on any row opens a detail panel (replaces the current modal, slides in from the right or expands below the row). It contains:

**Key** (same inline input, mirrored here)

**Generate prompt** — what the AI should write:
```
┌─────────────────────────────────────────────────────┐
│ Write a 2-sentence product description focused on   │
│ the primary customer benefit. Keep under 180 chars. │
└─────────────────────────────────────────────────────┘
```
Label: `Generation prompt — tell the AI exactly what to write`  
Placeholder: `e.g., "Write a concise headline that captures the core value proposition"`

**Context fields** — other fields on this slide the AI should consider:
```
Context from this slide:
  [product_name ×]  [category ×]  [+ add field]
```
Shows a dropdown of other keys defined on the same slide. Selecting one adds it to `contextFields`. Removing deselects it.

A short explanation below: `The AI will read the prompts and generated values of these fields as background when writing this one. Use this when fields are semantically related.`

**Max characters** — same as today

**AI generates** — same toggle as today

**Original text** — read-only display of what's currently in the PPTX element

---

## Recipe Changes

### Generation prompt vs hint fallback

For each auto-generate field, the recipe uses `prompt` if set, otherwise `hint`. The recipe shows which is being used, e.g.:

```
"exec_summary": generate per prompt: "Write a 2-sentence summary of Q4 results..."  (max 240 chars)
```

vs legacy:

```
"exec_summary": "Q4 executive summary" [AI] (max 240 chars)
```

### Context field references in recipe

When a field has `contextFields`, the recipe appends a `Context:` line under the field instruction:

```
STATIC FIELDS:
  "description" (slide 2):
    Prompt: "Write a 2-sentence product description focused on the primary customer benefit."
    Context: When writing this, consider the following fields on slide 2:
      - product_name: "Name of the product on this slide"
      - category: "Product category (e.g., analytics, security)"
    Max: 180 chars

  "description" (slide 4):
    Prompt: "Write a 2-sentence product description focused on the primary customer benefit."
    Context: When writing this, consider the following fields on slide 4:
      - product_name: "Name of the product on this slide"
      - category: "Product category (e.g., analytics, security)"
    Max: 180 chars
```

Note: the context fields' prompts/hints appear in the recipe so the AI understands what those fields represent, even if their values are not yet known (they are generated in the same pass). The AI is expected to produce internally consistent values.

### Fields with no key

Fields with `key: ''` are silently excluded from the recipe. A warning is shown in the UI before recipe generation: `3 elements have no key and will be skipped. Name them in the table or disable them.`

---

## Validation Changes

No structural changes. The `prompt` field is not validated — it is optional. Fields without a prompt fall back to `hint`. Fields with neither `prompt` nor `hint` are included in the recipe with a generic instruction derived from the key name, same as today.

`contextFields` entries that reference a key not present in the current slide's tags are silently dropped from the recipe (not a validation error — the context field may have been deleted).

---

## Backward Compatibility

| Existing data | Behaviour |
|---------------|-----------|
| Tags with `hint` and no `prompt` | `hint` used in recipe as before |
| Tags with content-derived keys (old auto-load) | Displayed as-is; user can rename inline |
| Tags with no `contextFields` property | Treated as `[]` |
| Patches saved before this change | Load and display correctly; no migration needed |

---

## Build Story

This is a single story delivered in two passes:

### Pass 1 — Key table + auto-load fix (core)

**"As a user, when I load a PPTX I see all elements in a table with empty keys, and I can name them inline."**

- Change auto-load: `key: ''` instead of content-derived key, no auto-save until first key set
- Replace patch table with cross-slide grouped table
- Inline key input per row with shared-key `⬡` badge and same-slide duplicate error
- AI toggle inline
- Keyboard tab navigation between key inputs
- Warning banner when elements have no key before recipe generation

**Data model change**: `key` defaults to `''`. No other changes.  
**Server changes**: none — empty-key tags are already excluded from recipes by the `autoGenerate` flag; adding an explicit `key` check is a one-liner guard.  
**Client changes**: auto-load logic, patch table component rewrite.

---

### Pass 2 — Field detail panel + context fields

**"As a user, I can write a generation prompt for each field and declare which other fields on the same slide the AI should consider."**

- Add `prompt` and `contextFields` fields to tag data model
- Field detail panel (replaces current tag modal) with prompt textarea and context field selector
- Recipe generation updated: use `prompt` over `hint`, emit `Context:` lines for `contextFields`
- Backward compatibility: `hint` fallback when `prompt` absent

**Data model change**: add `prompt: string`, `contextFields: string[]` to tag.  
**Server changes**: `generate-recipe` reads `prompt` (fallback `hint`); emits context lines when `contextFields` present.  
**Client changes**: field detail panel component, `contextFields` state management, recipe generation call passes updated tag shape.

---

## Open Questions

1. **Prompt vs hint naming in the UI**: should the field be labelled "Generation prompt" or "AI instruction" or "Hint"? "Hint" is what users are familiar with from the existing UI. Proposal: label it "AI prompt" in the detail panel, keep "hint" in compact table view for familiarity.

2. **Context fields and generation order**: context fields are declared as "fields on the same slide the AI should consider." If the AI generates all fields in one pass (which it does today), the referenced field values are not yet known — the AI infers them from the prompts. Should the recipe make this explicit? Proposal: yes — add a note in the recipe: "Context fields listed below are generated in the same pass; use their prompts to understand what they will contain."

3. **Tab order across slides**: should Tab in the key input move to the next element on the same slide, or to the first element on the next slide? Proposal: next element on the same slide, then wrap to the next slide's first element. Standard spreadsheet behaviour.

4. **Removing the tag modal entirely**: Pass 1 introduces the table but the tag modal still exists. Pass 2 replaces it with the detail panel. Should the modal be removed in Pass 1 (to avoid two editing surfaces) or kept until Pass 2? Proposal: keep modal in Pass 1 as the fallback for editing max chars and the AI toggle (both accessible from the modal today); remove in Pass 2 when the detail panel is complete.
