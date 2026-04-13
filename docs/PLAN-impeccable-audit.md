# Impeccable Audit — Implementation Plan

Audit score: **9/20** (Poor). This plan addresses all P0–P3 findings in priority order.
Each section maps to one or more Impeccable commands and lists exact files and line numbers to touch.

---

## P0 — Blocking (fix first)

### P0-1: Upload zone not keyboard accessible

**Command**: `/adapt`
**Files**: `client/src/steps/UploadStep.jsx`, `client/src/index.css`

The `div.upload-zone` has `onClick`/`onDrop` handlers but no keyboard support. Hidden `<input type="file">` is unreachable without a mouse.

**Changes**:
- Add `role="button"`, `tabIndex={0}`, and `aria-label="Upload PPTX file"` to the `div.upload-zone`
- Add `onKeyDown` handler: trigger `fileInputRef.current?.click()` on `Enter` or `Space`
- Alternative (simpler): restructure as `<label htmlFor="file-input">` wrapping the `<input>`, which gives keyboard + click for free

---

### P0-2: Toggle switches have no accessible name

**Command**: `/adapt`
**Files**: `client/src/steps/TagStep.jsx`, `client/src/index.css:646-699`

Each AI-fill toggle is a `<input type="checkbox">` visually hidden with `opacity: 0; width: 0; height: 0`. Screen readers announce "checkbox" with no context.

**Changes**:
- Add `aria-label` to every toggle `<input>` describing what it controls, e.g. `aria-label={`AI-fill for ${tag.key}`}`
- The `.toggle-label` text below the switch is not programmatically associated — either use `aria-labelledby` pointing to it, or fold it into the `aria-label`

---

## P1 — Major

### P1-1: No responsive layout — 2-column grids have no breakpoints

**Command**: `/layout`
**Files**: `client/src/index.css:293-312` (`.main-layout`), `client/src/index.css:1133-1149` (`.recipe-json-layout`)

Both `grid-template-columns: 1fr 1fr` grids collapse to unusably narrow columns below ~800px. No `@media` queries exist anywhere in the stylesheet.

**Changes**:
```css
/* Add at the bottom of index.css */
@media (max-width: 768px) {
  .main-layout {
    grid-template-columns: 1fr;
  }
  .sidebar {
    position: static; /* unpin sticky on mobile */
  }
  .workspace {
    position: static;
    max-height: none;
    overflow-y: visible;
  }
  .recipe-json-layout {
    grid-template-columns: 1fr;
  }
  .app {
    padding: var(--space-md);
  }
}
```

---

### P1-2: Touch targets below 44×44px minimum

**Command**: `/adapt`
**Files**: `client/src/index.css`

| Element | Current size | Location |
|---|---|---|
| `.tag-step-preview-nav-btn` | 28×28px | line 1934 |
| `.patch-history-dot` | 12×12px | line 1763 |
| `.propagate-icon` | ~24px | line 592 |

**Changes**:
- `.tag-step-preview-nav-btn`: increase to `width: 44px; height: 44px`
- `.patch-history-dot`: keep visual size (12px circle) but add padding to expand hit area: `padding: 16px;` with `box-sizing: content-box` so the dot itself stays 12px
- `.propagate-icon`: increase `padding` to achieve at least 44px total height

---

### P1-3: `border-left: 3px solid` accent stripe — absolute ban

**Command**: `/polish`
**Files**: `client/src/index.css:992-993`

```css
/* CURRENT — banned pattern */
.help-text {
  border-left: 3px solid var(--accent-primary);
}
```

**Changes**:
- Remove the `border-left` declaration entirely
- Replace with a full border or a background tint:
```css
.help-text {
  background: color-mix(in srgb, var(--accent-primary) 8%, var(--bg-tertiary));
  border: 1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent);
}
```

---

### P1-4: No `color-scheme` declaration

**Command**: `/polish`
**Files**: `client/src/index.css:4` (`:root` block)

Without `color-scheme: dark`, browser-native controls (scrollbars, `<select>`, `<input>` spinners) render in light mode inside the dark UI.

**Changes**:
```css
:root {
  color-scheme: dark;
  /* ... existing tokens ... */
}
```

---

### P1-5: No `prefers-reduced-motion` guard on animations

**Command**: `/animate`
**Files**: `client/src/index.css`

All animations fire unconditionally. Users with vestibular disorders or OS-level "Reduce Motion" enabled still get all transitions.

**Affected animations**:
- Step transitions: `slideInRight`, `slideInLeft` (lines 128–164)
- Modal entrance: `modalIn` (lines 1326–1335)
- Toast entrance: `toast-in` (lines 1695–1698)
- Header `fadeIn` (line 79)
- `.main-layout` `fadeIn` (line 298)
- `.tag-step-preview` `fadeIn` (line 1906)
- Button hover `transform: translateY(-2px)` (lines 1019, 107)

**Changes** — add at the bottom of `index.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

### P1-6: Missing focus indicators on custom interactive elements

**Command**: `/adapt`
**Files**: `client/src/index.css:549-558`, `index.css:393`, `index.css:1221`

All inline table inputs use `outline: none` on focus and replace it only with a border-color change — insufficient for keyboard users.

**Affected selectors**:
- `.patch-key-input:focus`, `.patch-hint-input:focus`, `.patch-max-input:focus` (line 552)
- `.patch-name-input:focus` (line 393)
- `.json-input:focus` (line 1221)
- `.global-prompt-input:focus` (line 445)

**Changes** — replace `outline: none` with:
```css
.patch-key-input:focus-visible,
.patch-hint-input:focus-visible,
.patch-max-input:focus-visible,
.patch-name-input:focus-visible,
.json-input:focus-visible,
.global-prompt-input:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}
```
Use `:focus-visible` (not `:focus`) so mouse clicks don't show the ring, only keyboard navigation does.

---

## P2 — Minor

### P2-1: Hard-coded `#fff` and `#555` in toggle slider

**Command**: `/polish`
**Files**: `client/src/index.css:669`, `client/src/index.css:682`

```css
/* CURRENT */
.toggle-slider { background-color: #555; }
.toggle-slider:before { background-color: white; }
```

**Changes**:
```css
.toggle-slider { background-color: var(--text-muted); }
.toggle-slider:before { background-color: var(--text-primary); }
```

---

### P2-2: Hard-coded hex values in badge styles

**Command**: `/polish`
**Files**: `client/src/index.css:824-845` (`.tag-slide-badge`)

| Hard-coded value | Replace with |
|---|---|
| `#4a4a4a` | `var(--bg-elevated)` |
| `#888` | `var(--text-muted)` |
| `#D4A853` | `var(--warning)` |
| `#1a1a1a` | `var(--bg-primary)` |
| `rgba(0,0,0,0.3)` in box-shadow | keep or use `var(--shadow-sm)` |

---

### P2-3: `rgba()` magic numbers not derived from tokens

**Command**: `/colorize`
**Files**: `client/src/index.css`

| Location | Current | Replace with |
|---|---|---|
| line 856 `.record-toggle` | `rgba(76, 175, 128, 0.08)` | `color-mix(in srgb, var(--accent-primary) 8%, transparent)` |
| line 969 `.overlay-element` box-shadow | `rgba(115, 170, 135, 0.4)` | `color-mix(in srgb, var(--accent-secondary) 40%, transparent)` |
| line 933 `.slide-element.tagged` | `rgba(232, 84, 74, 0.25)` | `color-mix(in srgb, var(--error) 25%, transparent)` |
| line 1080 `.form-group input:focus` | `rgba(76, 175, 128, 0.15)` | `color-mix(in srgb, var(--accent-primary) 15%, transparent)` |
| line 1224 `.json-input:focus` | `rgba(76, 175, 128, 0.15)` | `color-mix(in srgb, var(--accent-primary) 15%, transparent)` |
| line 1229 `.json-input.has-error` | `rgba(255, 99, 89, 0.15)` | `color-mix(in srgb, var(--error) 15%, transparent)` |
| line 1307 `.modal-overlay` | `rgba(0, 0, 0, 0.85)` | keep (no token for this; or add `--overlay-bg`) |

---

### P2-4: Upload zone missing success/file-name feedback

**Command**: `/delight`
**Files**: `client/src/steps/UploadStep.jsx`

After a successful upload, the zone shows no file name confirmation. Users must infer success from the "Continue" button appearing.

**Changes**:
- When `templateFile` is set, update the upload zone content to show the file name and a success indicator
- Example: replace the two `<p>` tags with a conditional rendering:
```jsx
{templateFile ? (
  <p>✓ {templateFile.fileName}</p>
) : (
  <>
    <p>Drop your PPTX here</p>
    <p>or click to browse</p>
  </>
)}
```

---

### P2-5: Timeline dots have no accessible label

**Command**: `/adapt`
**Files**: `client/src/components/PatchHistoryTimeline.jsx`

Each dot `<button>` has no visible text and no `aria-label`. Screen readers announce nothing useful.

**Changes**:
- Add `aria-label={`Go to round ${n}: ${round.name}`}` to each dot button
- Add `aria-current="true"` to the current round dot

---

### P2-6: `transition: all` used instead of specific properties

**Command**: `/optimize`
**Files**: `client/src/index.css`

| Location | Element |
|---|---|
| line 100 | `.docs-link` |
| line 247 | `.upload-zone` |
| line 707 | `.tag-slide-btn` |
| line 1268 | `.preview-card` |

**Changes** — replace `transition: all var(--transition-base)` with:
```css
transition: background-color var(--transition-base),
            border-color var(--transition-base),
            box-shadow var(--transition-base),
            transform var(--transition-base),
            color var(--transition-base);
```

---

### P2-7: Fixed `max-height` values clip content at large font sizes

**Command**: `/layout`
**Files**: `client/src/index.css`

| Selector | Current | Suggested |
|---|---|---|
| `.tagged-list` (line 1087) | `max-height: 180px` | `max-height: 12rem` |
| `.recipe-area` (line 1167) | `max-height: 450px` | `max-height: 28rem` |
| `.json-input` (line 1207) | `min-height: 380px; max-height: 450px` | `min-height: 24rem; max-height: 28rem` |

---

### P2-8: `.workspace` clips content on short viewports

**Command**: `/layout`
**Files**: `client/src/index.css:307-312`

```css
/* CURRENT */
.workspace {
  max-height: calc(100vh - var(--space-xl) * 2);
}
```

**Changes**:
```css
.workspace {
  max-height: calc(100dvh - var(--space-xl) * 2);
  min-height: 400px; /* floor so it never collapses */
}
```

---

## P3 — Polish

### P3-1: Generic `monospace` font stack in patch table

**Command**: `/typeset`
**Files**: `client/src/index.css:564`

```css
/* CURRENT */
.patch-key-input { font-family: monospace; }

/* CHANGE TO */
.patch-key-input { font-family: 'JetBrains Mono', 'Fira Code', monospace; }
```

---

### P3-2: Inconsistent `letter-spacing` on uppercase labels

**Command**: `/typeset`
**Files**: `client/src/index.css`

`.patch-hint-label` uses `letter-spacing: 0.04em` (line 522) while all other uppercase labels use `0.05em`. Standardize to `0.05em` everywhere, or define a token:

```css
:root {
  --label-letter-spacing: 0.05em;
}
```

Then replace all `letter-spacing: 0.04em` and `letter-spacing: 0.05em` occurrences with `var(--label-letter-spacing)`.

---

### P3-3: Bare `0.2s` transitions instead of token

**Command**: `/polish`
**Files**: `client/src/index.css:671`, `client/src/index.css:683`

```css
/* CURRENT */
.toggle-slider { transition: 0.2s; }
.toggle-slider:before { transition: 0.2s; }

/* CHANGE TO */
.toggle-slider { transition: background-color var(--transition-fast); }
.toggle-slider:before { transition: transform var(--transition-fast); }
```

---

### P3-4: `backdrop-filter` not guarded by `@supports`

**Command**: `/optimize`
**Files**: `client/src/index.css:1313`

```css
/* CURRENT */
.modal-overlay {
  backdrop-filter: blur(4px);
}

/* CHANGE TO */
@supports (backdrop-filter: blur(4px)) {
  .modal-overlay {
    backdrop-filter: blur(4px);
  }
}
```

Also remove inside `prefers-reduced-motion: reduce` since the blur itself is a motion-adjacent effect.

---

## Implementation Order

Run fixes in this sequence to minimize merge conflicts and allow incremental testing:

```
1. P0-1  Upload zone keyboard access         UploadStep.jsx
2. P0-2  Toggle switch aria-labels           TagStep.jsx
3. P1-4  color-scheme: dark                  index.css :root
4. P1-3  Remove border-left from .help-text  index.css
5. P1-6  Focus indicators (:focus-visible)   index.css
6. P1-5  prefers-reduced-motion guard        index.css
7. P1-1  Responsive breakpoints              index.css
8. P1-2  Touch target sizes                  index.css
9. P2-1  Toggle slider token colors          index.css
10. P2-2  Badge hard-coded hex values        index.css
11. P2-3  rgba() → color-mix()               index.css
12. P2-5  Timeline dot aria-labels           PatchHistoryTimeline.jsx
13. P2-4  Upload zone success feedback       UploadStep.jsx
14. P2-6  transition: all → specific         index.css
15. P2-7  max-height px → rem               index.css
16. P2-8  workspace 100dvh + min-height      index.css
17. P3-1  monospace font stack               index.css
18. P3-2  letter-spacing token               index.css
19. P3-3  transition token in toggle         index.css
20. P3-4  backdrop-filter @supports guard    index.css
```

Re-run `/audit` after completing all items to verify the score improves to 16+/20.
