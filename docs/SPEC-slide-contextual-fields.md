# Spec: Slide-Contextual Fields

**Status**: Draft  
**Author**: nch  
**Date**: 2026-04-10

---

## Problem

The current field system maps one key to one value. When the user tags an element `description` on slide 1, the recipe asks the AI to produce a single value for `description`, and that value is substituted into slide 1.

This breaks down when the same semantic field type appears on multiple slides that each need different content. If slide 1 covers Product A and slide 2 covers Product B, both may have a `description` element — but the AI must produce a distinct, contextually appropriate value for each. Today there are two bad workarounds:

- **Invent unique key names**: tag slide 1 as `description_product_a` and slide 2 as `description_product_b`. This works but forces the user to manage naming manually, doesn't scale beyond a handful of slides, and makes the recipe harder to read.
- **Use repeatable slides**: define one template slide and let the AI generate instances. This is the right tool when slides are structurally identical copies. It is the wrong tool when the slides already exist in the deck, have different layouts, or differ in ways beyond just the field values.

There is no first-class way to say: "this field type appears on N slides — generate a version of it for each, informed by each slide's context."

---

## Goal

Allow the user to tag the same key on multiple slides. When the system detects a key used across more than one slide, it treats those tags as **slide-contextual fields**: the recipe groups them by slide, each instance gets its own AI-generated value, and the JSON response carries per-slide values that are applied back to the correct elements.

The user's interface for providing slide context is the existing **hint** field on each tag. No new concepts need to be introduced: the user sets a slide-specific hint (e.g., `"Value proposition of Product A — AI analytics platform"`) that tells the AI what to write for that slide's instance of the field.

---

## Concepts

### Shared Key

A **shared key** is a tag key that appears on more than one slide within the same patch round. Shared keys are detected automatically at recipe-generation time — the user does not need to declare them.

Examples:
- `description` tagged on slides 1, 3, and 5
- `section_intro` tagged on slides 2 and 4
- `kpi_value` tagged on slides 6, 7, and 8

A key that appears on only one slide is a **static field** — existing behaviour, no change.

### Slide Context

The per-slide hint on a shared-key tag is the **slide context** — the signal the AI uses to produce content appropriate for that slide. The hint should describe the slide's topic or the specific angle required for that field instance.

Example tags for key `description`:
- Slide 1 hint: `"Product A: AI-powered analytics — focus on time-to-insight"`
- Slide 2 hint: `"Product B: Enterprise security suite — focus on compliance and auditability"`
- Slide 3 hint: `"Product C: Developer API — focus on extensibility and low-latency"`

The quality of the generated content is directly proportional to the quality of these hints. The recipe surfaces this to the user: the hint text is what the AI reads to understand each slide's context.

### Contextual Section (Recipe)

When shared keys are present, the recipe gains a `CONTEXTUAL FIELDS` section below `STATIC FIELDS`. Each shared key gets its own block listing every slide that uses it, with its hint and character limit:

```
CONTEXTUAL FIELDS (same field type, slide-specific content):

Field: description
  Slide 1 — "Product A: AI-powered analytics — focus on time-to-insight" (max 180 chars)
  Slide 2 — "Product B: Enterprise security suite — focus on compliance" (max 180 chars)
  Slide 3 — "Product C: Developer API — focus on extensibility" (max 180 chars)

Field: section_intro
  Slide 4 — "Introduction to the financial results section" (max 240 chars)
  Slide 7 — "Introduction to the product roadmap section" (max 240 chars)
```

### JSON Response Structure

The AI response gains a `contextual` array alongside `static` and `slides`:

```json
{
  "static": {
    "deck_title": "2026 Strategy Review"
  },
  "contextual": [
    { "slide_index": 1, "description": "Product A delivers real-time analytics..." },
    { "slide_index": 2, "description": "Product B provides enterprise-grade security..." },
    { "slide_index": 3, "description": "Product C exposes a low-latency REST API..." },
    { "slide_index": 4, "section_intro": "The following section summarises financial..." },
    { "slide_index": 7, "section_intro": "The product roadmap reflects three strategic bets..." }
  ],
  "slides": { ... }
}
```

Each entry in `contextual` identifies a slide by `slide_index` and carries values only for the shared-key fields on that slide. A slide appears once per entry (multiple shared-key fields on the same slide are in one object).

---

## User Flow

### Tag Step — Shared Key Detection

No new UI controls are needed. The user tags elements as usual. When they set a key that already exists on another slide in this round, the tag modal shows a subtle notice:

> ⓘ `description` is also used on Slide 1. This field will be generated per-slide — make sure this hint describes what's specific about this slide.

The notice is informational. The user proceeds normally. The hint field is highlighted to emphasise its importance for contextual generation.

If the user uses the same key on the *same* slide more than once (two elements on slide 1 both tagged `description`), that is an error — the tag modal blocks saving and shows: `Key 'description' already exists on this slide. Choose a different key or edit the existing tag.`

### Tag Step — Hint Guidance

When a shared key is detected, the hint label changes from `Hint` to `Slide Context (used as AI context for this slide)` to make the purpose clear. A placeholder reminds the user: `Describe what this slide is about or what angle this field should take…`

### Recipe Step — No Procedural Change

The user generates the recipe and copies it to the AI exactly as today. The recipe now includes the `CONTEXTUAL FIELDS` section if shared keys exist. The AI prompt instructs the model to return a `contextual` array in the response JSON.

### Validate Step — Contextual Validation

Validation checks the `contextual` array:
- Each `(slide_index, key)` pair declared in the recipe must appear in `contextual`
- Each entry must have a `slide_index` field
- Missing entries are listed as: `description (slide 2) — missing`

Validation does not require that `contextual` entries appear in any particular order.

### Generate Step — No Change

The generation endpoint already applies field values by matching `tag.key` and `tag.slideIndex` to XML elements. Contextual field values are looked up from the `contextual` array using the same `slideIndex` match. No structural change to the generation pipeline is needed beyond reading from `contextual` as a data source in addition to `static`.

---

## Data Model

### Tag (no change)

The existing tag structure already has `key`, `slideIndex`, and `hint`. No new fields are needed. Shared-key detection is computed at runtime from the tag array, not stored.

```jsonc
{
  "elementId": "slide2-elem3",
  "key": "description",           // same key, different slide
  "hint": "Product B: enterprise security — focus on compliance",
  "slideIndex": 2,
  "originalText": "...",
  "maxChars": 180,
  "autoGenerate": true
}
```

### Patch / Round (no change)

No new fields on the patch or chain record. Shared keys are inferred from the `tags` array by grouping on `key` and counting distinct `slideIndex` values.

---

## Recipe Generation Changes (`POST /api/generate-recipe`)

Current logic splits tags into `staticFields` (non-repeatable slides) and `repeatableFields` (repeatable slides).

New logic adds a third bucket: **contextualFields** — tags whose key appears on more than one slide within the static set.

```
staticFields      → key appears on exactly one static slide
contextualFields  → key appears on more than one static slide
repeatableFields  → slide is marked as repeatable (unchanged)
```

A key that is both on a repeatable slide and a static slide is treated as two independent tags (static instance goes into `static`, repeatable instances go into `slides`). This is unlikely in practice but follows logically.

**Recipe CONTEXTUAL FIELDS section** (inserted between STATIC FIELDS and SLIDES):

```
CONTEXTUAL FIELDS (same field type, different slides — generate a value for each):

For each field below, return one entry in the "contextual" array with "slide_index" and the field value.

Field: description
  Slide 1 — Context: "Product A: AI analytics — focus on time-to-insight" (max 180 chars)
  Slide 2 — Context: "Product B: Security suite — focus on compliance" (max 180 chars)
```

**Updated JSON instructions** at the bottom of the recipe:

```
Return format:
{
  "static": { ... },              // one value per static field key
  "contextual": [                 // one entry per slide for each contextual field
    { "slide_index": N, "field_key": "value", ... },
    ...
  ],
  "slides": { ... }               // repeatable slide instances (unchanged)
}
```

---

## Validation Changes (`POST /api/validate-json`)

Add contextual validation after existing static and repeatable checks:

```
// Detect shared keys
const keySlideMap = {}   // key → [slideIndex, ...]
staticTags.forEach(tag => {
  keySlideMap[tag.key] = keySlideMap[tag.key] || []
  keySlideMap[tag.key].push(tag.slideIndex)
})
const sharedKeys = Object.entries(keySlideMap)
  .filter(([_, slides]) => slides.length > 1)
  .map(([key]) => key)

// Validate contextual array
const contextual = data.contextual || []
sharedKeys.forEach(key => {
  const slidesForKey = keySlideMap[key]
  slidesForKey.forEach(slideIndex => {
    const entry = contextual.find(c => c.slide_index === slideIndex)
    if (!entry || entry[key] === undefined) {
      missingFields.push(`${key} (slide ${slideIndex})`)
    } else {
      foundFields.push(`${key} (slide ${slideIndex})`)
    }
  })
})
```

---

## Generation Changes (`POST /api/generate-pptx` / `buildPptxZip`)

In `replacePlaceholders`, add a lookup into `jsonData.contextual` for shared-key fields:

```
// Current: value = staticData[key]
// New: if contextual array exists and has an entry for this slide, prefer it

const contextualEntry = (jsonData.contextual || []).find(c => c.slide_index === slideIndex)
const value = (contextualEntry && contextualEntry[key] !== undefined)
  ? contextualEntry[key]
  : staticData[key]
```

This change is additive and backward-compatible: if no `contextual` array is present (existing patches), `staticData[key]` is used as before.

---

## Relationship to Multi-Patch

Slide-contextual fields are independent of multi-patch chaining. A single-round patch can have static, contextual, and repeatable fields all at once. In a multi-patch chain, any round can use contextual fields — the mechanism applies within each round independently.

A common multi-patch pattern with contextual fields:

| Round | Focus | Fields |
|-------|-------|--------|
| 1 | Expansion | Repeatable slides: initiative cards |
| 2 | Fields | Static: deck title, exec summary |
| 3 | Contextual fields | Shared key `description` across 4 product slides |

---

## Out of Scope

- **Cross-slide contextual fields in repeatable slides**: a shared key between a static slide and a repeatable slide instance. Treat these as independent fields for now.
- **Ordering of contextual array entries**: the system matches by `slide_index`, so AI can return entries in any order.
- **Contextual fields with character limits that differ per slide**: if two slides use the same key but have different `maxChars` (different element sizes), both limits are shown in the recipe. The AI should respect the per-slide limit shown. No enforcement beyond showing the constraint.

---

## Open Questions

1. **Key collision with repeatable slide structure types**: if a repeatable slide's `structureType` is also a key used in contextual fields, there could be naming ambiguity in the recipe. Proposal: validate at recipe-generation time and warn the user if a contextual key shadows a repeatable structure type.

2. **Should `contextual` merge into `static` for backward compatibility?** If the AI returns shared-key values in `static` rather than `contextual` (e.g., from an older recipe), the system currently ignores them. Proposal: fall back to `static[key]` if the contextual entry for that slide is missing — making the system degrade gracefully rather than leaving the field blank.

3. **Hint quality enforcement**: the value of contextual fields depends entirely on the user writing good hints. Should the UI warn if a shared-key tag has a generic or empty hint (e.g., the auto-generated hint matches the original text)? Proposal: show a warning icon on tags with shared keys whose hint appears unedited.
