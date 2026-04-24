# Agentic Context Slicing — v2 Design

## Background

The agentic pipeline generates HTML slide content using AI agents that each receive a "context slice" — a curated excerpt of the user's uploaded files relevant to that agent's task. This document describes the redesigned slicing strategy that replaces the fragile column-based approach with intent-driven instance identification and exhaustive per-instance slice assembly.

---

## Problems with v1

### 1. Column-dependency assumption
The orchestrator was asked to identify a single "grouping column" (e.g. `Owner`), and code then extracted rows where that column matched each group value. This breaks entirely when:
- The grouping isn't a column (e.g. "make one slide per project mentioned in the brief")
- The instance identifier appears across multiple columns or sheets
- The context files are PDFs, Word documents, or other non-tabular formats with no columns at all

### 2. Non-tabular files were invisible to instance agents
`extractGroupedSlices` only processed `.xlsx`/`.xls`/`.csv` files. PDFs, Word documents, and text files were completely excluded from instance slices. They only appeared in the blocks slice as a fallback side-effect, not by design.

### 3. Reference sheets siloed to the blocks agent
Sheets that did not contain the grouping column (lookup tables, metadata sheets, glossaries, org charts) were sent only to the blocks agent. Instance agents never saw them, even when they contained data relevant to every instance.

### 4. Context round-tripped through the browser
For the orchestrator path, the `/plan` route emitted `contextSlices` in the SSE payload. The browser stored this data and sent it back to the server in the `/run` POST body. Large datasets (hundreds of kilobytes) transited through the client with no size safety net and no inspection path.

### 5. Fallback = silent empty context
When the orchestrator failed to identify a column (or the column wasn't found in any file), the code put all content into `contextSlices['blocks']`. Instance agents then looked up `resolvedSlices["0"]`, `resolvedSlices["1"]`, etc. — keys that didn't exist — and silently received an empty string. Slides were generated with no source data.

---

## v2 Architecture

### Guiding principles
- **Intent-driven, not column-driven.** The orchestrator understands what the user is asking for and returns instance identifiers. Slice building uses those identifiers to search for data, not a structural column assumption.
- **Exhaustive per-instance slices.** Every agent receives all data that could conceivably be relevant to its instance. No silent gaps.
- **Disk-first data flow.** Slices are always written to disk in `/plan` and read from disk in `/run`. The browser never carries slice content.
- **User-directed focus.** A new `dataFocus` field lets the user tell the AI what data is essential, guiding both the orchestrator and the content agents.

---

## Orchestrator Output — New Schema

The `grouping: { column, values }` object is removed entirely. The orchestrator no longer attempts to identify a column. Instead it identifies the instances themselves.

```json
{
  "instances": { "slideKey": 3 },
  "instanceNames": ["Alice Smith", "Bob Jones", "Carol White"],
  "instanceKeys":  ["Alice Smith", "Bob Jones", "Carol White"],
  "rationale": "Found 3 team members based on user request to make one slide per person"
}
```

| Field | Type | Description |
|---|---|---|
| `instances` | `{ [slideKey]: number }` | Count of instances per repeatable slide type. Same as v1. |
| `instanceNames` | `string[]` | Display labels used in the UI confirmation card and agent labels. One entry per instance, ordered across all slide types. |
| `instanceKeys` | `string[]` | Literal search strings used to find each instance's data in context files. Usually identical to `instanceNames` but may differ when the display name is formatted differently from what appears in the data (e.g. name = "Alice Smith (VP)", key = "Alice"). |
| `rationale` | `string` | One sentence explaining the instance count and how it was determined. |

**`instanceNames` and `instanceKeys` are flat arrays ordered across all slide types**, matching the `globalIndex` used by the `/run` route to assign agents. If there are two slide types (e.g. `person_slide: 3, project_slide: 2`), the array has 5 entries: `[person0, person1, person2, project0, project1]`.

---

## New Slice Builder — `buildInstanceSlices`

Replaces `extractGroupedSlices` in `context-reader.js`.

### Function signature

```js
export async function buildInstanceSlices(
  contextDir,
  instanceKeys,      // string[] — search terms for each instance
  allFilenames,      // string[] — all supported files in contextDir
  opts = {
    useSummaries: false,   // use .summary.md files for document layer if available
    sheetFilter: null,     // optional Set<string> of sheet names to include
    dataFocus: '',         // user's data focus hint (included as a header in each slice)
  }
)
// Returns: { slices: { "0": string, "1": string, ... }, blocksText: string }
```

### Slice composition per instance

Each instance slice is assembled from three layers, in order:

```
╔══════════════════════════════════════════╗
║  LAYER 1: INSTANCE-SPECIFIC TABULAR DATA ║
║  Rows from tabular sheets that contain   ║
║  this instance's key anywhere in any     ║
║  column.                                 ║
╠══════════════════════════════════════════╣
║  LAYER 2: REFERENCE TABULAR DATA         ║
║  All rows from tabular sheets where no   ║
║  row matches ANY instance key. These are ║
║  lookup tables, metadata, glossaries.    ║
║  Identical across all instances.         ║
╠══════════════════════════════════════════╣
║  LAYER 3: DOCUMENT CONTEXT               ║
║  Full text of all non-tabular files      ║
║  (PDF, Word, text, markdown, HTML).      ║
║  If a .summary.md exists and             ║
║  useSummaries=true, use the summary.     ║
║  Identical across all instances.         ║
╚══════════════════════════════════════════╝
```

### Sheet classification logic

For each worksheet in each tabular file:

```
For every row in the sheet:
  For every cell value in that row:
    If cell.toLowerCase().includes(instanceKey.toLowerCase()):
      → sheet is "instance-specific"

If no row matched any instance key → sheet is "reference"
```

A sheet tagged as instance-specific contributes only its **matching rows** to each instance's slice. A reference sheet contributes **all its rows** to every instance's slice.

### Instance-specific row inclusion

When building instance `i`'s slice from an instance-specific sheet:

```
Include a row if ANY cell value contains instanceKeys[i] (case-insensitive substring match)
```

This is intentionally broad. A row about "Alice Smith" should be included whether Alice appears in the "Owner" column, the "Reviewer" column, or a "Notes" field. The agent is told which instance it's building for and will use its judgment about relevance.

### Data Focus header

If `dataFocus` is provided, it is prepended to every slice as a prominent header:

```
DATA FOCUS (pay special attention to this):
[dataFocus text]
```

This is written into the slice file itself so it's visible during review.

---

## Blocks Slice

The blocks slice feeds the Blocks & Shared agent (non-repeatable zones and shared zones). It always contains the full context — same as the current fast-path behaviour.

For the orchestrator path (when repeatable slides are present), the blocks slice is:
- All rows from all tabular files (not filtered, in full)
- All non-tabular files
- This is equivalent to calling `readContextFiles` with `useSummaries` as configured

---

## Disk-First Data Flow

### `/plan` route

```
1. Read compact context (orchestrator input — summarised tabular + full documents)
2. Orchestrator AI call
   Input:  compact context + user intent (customInput / contentPrompt) + dataFocus
   Output: { instances, instanceNames, instanceKeys, rationale }
3. buildInstanceSlices(contextDir, instanceKeys, allFilenames, { dataFocus })
4. Write to disk (parallel):
     flows/{flowId}/ai-orchestrator-prompt.txt
     flows/{flowId}/ai-slice-blocks.txt
     flows/{flowId}/ai-slice-instance-{i}-{slug}.txt   (one per instance)
5. Emit plan event to browser:
   { instances, instanceNames, agentPlan, contextFiles }
   ← NO slice content in the browser payload
```

### `/run` route

```
1. Receive: { projectName, flowId, zones, repeatableSlides, instances,
              contentPrompt, customInput, dataFocus }
   ← contextSlices removed from request body entirely
2. For each agent:
   - blocks agent  → read flows/{flowId}/ai-slice-blocks.txt
   - instance i    → read flows/{flowId}/ai-slice-instance-{i}-*.txt
     (glob by index prefix, filename slug is for human readability only)
3. Parallel generation — same as today
4. Write flows/{flowId}/ai-agent-prompts.txt
```

### Slice file naming

Instance slice files are named `ai-slice-instance-{i}-{slug}.txt` where:
- `i` is the zero-based global instance index (used for lookup)
- `slug` is a filesystem-safe version of `instanceNames[i]`, max 40 chars, used only for human readability when browsing the flow folder

Example for 3 people:
```
ai-slice-blocks.txt
ai-slice-instance-0-alice-smith.txt
ai-slice-instance-1-bob-jones.txt
ai-slice-instance-2-carol-white.txt
ai-orchestrator-prompt.txt
ai-agent-prompts.txt
```

---

## `dataFocus` Parameter

A new optional string parameter threaded through the entire pipeline.

### Where it comes from
A new text input in the UI, shown near the existing "Custom Instructions" field. Placeholder text:
> *What data is most important? e.g. "Focus on Budget and RAG status" or "Each person's role and key deliverables are essential"*

### Where it goes

| Location | How it's used |
|---|---|
| Orchestrator prompt | Appended as a `DATA FOCUS` block after the context schema — guides instance identification |
| `buildInstanceSlices` | Written as a header in each slice file |
| `buildInstancePrompt` | Appended as `DATA FOCUS` after the structural contract — tells the agent what to prioritise |
| `buildBlocksPrompt` | Same — passed to the blocks agent |

### Example effect on the orchestrator prompt

```
DATA FOCUS (user-specified — use this to identify the correct instances):
Make one slide per Project Owner. Focus on budget and timeline data for each owner.
```

The orchestrator uses this to understand the user's intent when the context is ambiguous.

---

## Changes by File

### `server/lib/context-reader.js`

- **Remove** `extractGroupedSlices`
- **Add** `buildInstanceSlices(contextDir, instanceKeys, allFilenames, opts)`
  - Loads all tabular files via XLSX
  - Classifies sheets as instance-specific or reference
  - Reads all non-tabular files (or summaries) for the document layer
  - Assembles and returns `{ slices, blocksText }`
- **Add** internal `readDocumentLayer(contextDir, docFilenames, useSummaries)` helper
  - Reads non-tabular files, respecting existing summary logic
  - Returns a single concatenated string

### `server/lib/agentic-prompts.js`

- **`buildOrchestratorPrompt`** — rewrite the output format section:
  - Remove `grouping` from the expected JSON schema
  - Add `instanceKeys` as a required output field
  - Add `DATA FOCUS` block (when `dataFocus` is provided)
  - Instruct the AI to return `instanceKeys` as the literal search terms that identify each instance in the data
- **`buildInstancePrompt`** — add `dataFocus` parameter:
  - Appended after the structural contract as `DATA FOCUS`
- **`buildBlocksPrompt`** — add `dataFocus` parameter:
  - Same treatment

### `server/routes/opencode-agentic.js`

- **Add** `dataFocus` to destructured request body in both `/plan` and `/run`
- **`/plan` route**:
  - Pass `dataFocus` to `buildOrchestratorPrompt`
  - Replace `extractGroupedSlices` call with `buildInstanceSlices`
  - Write individual instance slice files to disk
  - Remove `contextSlices` from the `plan` SSE event payload
- **`/run` route**:
  - Remove `contextSlices` from destructured request body
  - Read slice files from disk by index (glob `ai-slice-instance-{i}-*.txt`)
  - Pass `dataFocus` to `buildBlocksPrompt` and `buildInstancePrompt`
- **Remove** `remapInstances` — no longer needed once we stop round-tripping instances through the browser and rely on disk

> **Note:** `remapInstances` was a workaround for the AI renaming slide keys despite instructions. The disk-read approach bypasses this entirely since the browser never touches slice content.

### `client/` (UI — scope to be confirmed)

- Add `dataFocus` text input field near "Custom Instructions"
- Remove `contextSlices` from the plan state and `/run` request payload
- No other structural changes

---

## Edge Cases

### No instance-specific rows found for an instance

If `instanceKeys[i]` matches zero rows in any tabular sheet, the slice still contains Layers 2 and 3. The agent receives full reference + document context and is told (via the `DATA FOCUS` header and the instance prompt) which instance it's building for. It will attempt to extract relevant information from what's available.

The slice will begin with a notice:
```
[No instance-specific tabular rows found for: "Alice Smith"]
[Reference data and document context are provided below.]
```

This is better than the current behaviour (empty string, no notice).

### No repeatable slides (fast path)

Unchanged. A single blocks agent receives the full context via `ai-slice-blocks.txt`. The `buildInstanceSlices` function is not called.

### Orchestrator returns mismatched `instanceKeys` count

`instanceKeys` must have the same length as the total instance count (sum of all values in `instances`). If the lengths don't match, `/plan` logs a warning and falls back to using `instanceNames` as `instanceKeys`. This is validated before calling `buildInstanceSlices`.

### Very large instance count

If there are many instances (e.g. 20 people), `buildInstanceSlices` reads each tabular file once and partitions rows into buckets in a single pass — O(rows × instanceCount) but only one file read. Slice files are written in parallel. This should remain fast.

### `sheetFilter` interaction

If the user specified sheet names in their prompt (e.g. `sheet "2026 Estimates"`), the `sheetFilter` Set is passed through to `buildInstanceSlices` and respected during tabular file loading.

---

## What is NOT Changing

- The orchestrator is still a single AI call on compact context
- The parallel multi-agent generation in `/run` is unchanged
- Prompt structure for instance agents is unchanged (just gains `dataFocus`)
- The JSON repair strategy in `callAiJson` is unchanged
- Summary file generation and usage is unchanged
- The blocks agent and its prompt are unchanged structurally

---

## Open Questions (resolved)

| Question | Decision |
|---|---|
| Full copies of Layer 2 + 3 in every instance, or shared reference? | Full copies — correctness over token economy |
| Should the orchestrator also return a column hint for more precise matching? | No — keep it simple; add later if text-search proves noisy |
| Should `instanceKeys` support regex or just substring match? | Substring (case-insensitive) only — deterministic and debuggable |
