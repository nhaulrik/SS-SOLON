# Repeatable Slides - Feature Specification

## Overview

Repeatable slides allow a single slide type in a PPTX template to generate **multiple instances** in the final output, each with different content populated by AI.

## Sample PPTX Structure

| Slide | Content | Type |
|-------|---------|------|
| Slide 1 | Title/Intro | Static |
| Slide 2 | "Core Revenue Management" + Group Summary | Structure 2 (Group Summary) |
| Slide 3 | "Registration" + Initiative Detail | Structure 3 (Initiative Detail) |

## Use Case Example

**Input PPTX Structure:**
- structure 1: Intro (static - appears once)
- structure 2: Group Summary slide (repeatable)
- structure 3: Initiative Detail slide (repeatable)

**Expected Output:**
```
Slide 1: structure 1 - Intro (static)

Slide 2: structure 2 - Instance 1 (e.g., "Core Revenue Management Group")

Slide 3: structure 3 - Instance 1 (e.g., "Registration Initiative")
Slide 4: structure 3 - Instance 2 (e.g., "Taxpayer Accounting Initiative")
Slide 5: structure 3 - Instance 3 (e.g., "Compliance Initiative")

Slide 6: structure 2 - Instance 2 (e.g., "Supporting Capabilities Group")
Slide 7: structure 3 - Instance 4 (e.g., "Analytics Capability")
Slide 8: structure 3 - Instance 5 (e.g., "Audit Logging Capability")

...and so on
```

**Key insight:** Structure 2 generates ONE slide per group found, Structure 3 generates MULTIPLE slides for all initiatives (not necessarily tied to a specific group).

## Data Model

### Patch Object

```javascript
patch = {
  id: 123,
  name: "My Patch",
  pptxFile: "sample.pptx",
  tags: [...],                    // Tagged elements
  repeatableSlides: [...],       // Repeatable slide config
  globalPrompt: "Generate a professional presentation with...",  // AI guidance
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z"
}
```

### Repeatable Slides Configuration

```javascript
repeatableSlides = [
  {
    slideIndex: 2,              // Which slide in PPTX template
    structureType: "group_summary",  // Identifies the structure type
    customPrompt: "Generate product groups with name and description",
    // Fields are inherited from tags on this slide
  },
  {
    slideIndex: 3,
    structureType: "initiative_detail",
    customPrompt: "Generate initiatives with name, owner, timeline and which group they belong to",
  }
]
```

### Expected JSON Response from AI

```json
{
  "slides": {
    "groups": [
      {
        "structure_type": "group_summary",
        "group_name": "Core Revenue Management",
        "summary": "Tax revenue collection and management"
      },
      {
        "structure_type": "group_summary", 
        "group_name": "Supporting Capabilities",
        "summary": "Functions supporting the tax platform"
      }
    ],
    "initiatives": [
      {
        "structure_type": "initiative_detail",
        "name": "Registration",
        "owner": "Team A",
        "timeline": "Q2",
        "group": "Core Revenue Management"
      },
      {
        "structure_type": "initiative_detail",
        "name": "Taxpayer Accounting",
        "owner": "Team B", 
        "timeline": "Q3",
        "group": "Core Revenue Management"
      },
      {
        "structure_type": "initiative_detail",
        "name": "Compliance Engine",
        "owner": "Team C",
        "timeline": "Q4",
        "group": "Supporting Capabilities"
      }
    ]
  }
}
```

### Mapping Logic

**AI Auto-Assigns (Option B) + Structure Type:**

Each instance includes a `structure_type` field that determines which slide template to use:

1. Recipe sends custom prompt + tagged fields for each repeatable slide
2. AI generates instances with `structure_type` field
3. Generator maps:
   - `structure_type: "group_summary"` → uses Slide 2 template
   - `structure_type: "initiative_detail"` → uses Slide 3 template

**Key points:**
- User does NOT specify data keys manually
- AI auto-generates meaningful key names based on context
- Each instance MUST include `structure_type` to map to correct template
- Multiple instances can share the same `structure_type` (generates multiple slides)

## Field Structure

Each repeatable slide has its own set of tagged fields. The recipe includes all tagged fields (with AI generation enabled) for each slide type.

**Example - Group Summary slide (Slide 2) tagged fields:**
- `group_name`
- `summary`

**Example - Initiative Detail slide (Slide 3) tagged fields:**
- `initiative_name`
- `owner`
- `timeline`
- `group` (optional - links to parent group)

**Result:** Each instance in each array has the fields from its corresponding slide template.

## Workflow

### Step 1: Tag Elements
- User uploads PPTX
- User tags elements on each slide
- For each tag, user can:
  - Toggle AI generation on/off
  - Provide hint for AI
  - Set max characters

### Step 2: Mark Slides as Repeatable + Select Structure Type
- In the slide preview area, user checks "Repeatable" checkbox
- User selects a **Structure Type** from predefined options:
  - `group_summary` (for group/overview slides)
  - `initiative_detail` (for detailed initiative slides)
  - Or enters custom type identifier
- A custom prompt textarea appears
- User enters instructions for what instances to generate

### Step 3: Generate Recipe
- App builds a recipe prompt that includes:
  - Static fields (non-repeatable slides)
  - For each repeatable slide:
    - Structure type identifier
    - Custom prompt
    - Tagged fields to populate

### Step 4: Send to AI
- User copies recipe prompt
- AI generates JSON with `slides` object
- Each instance MUST include `structure_type` field
- User pastes JSON into the app

### Step 5: Validate & Preview
- App validates that all expected fields are present in each array
- App maps instances to correct templates based on `structure_type`
- Preview shows all generated slides in order

### Step 6: Download
- PPTX generated with:
  - Static slides appearing once
  - Each repeatable slide appearing N times based on `structure_type`

## UI Components

### Slide Preview Area

```
┌─────────────────────────────────────────────────────┐
│  Slide 3                                            │
│  [x] Repeatable                                      │
│                                                     │
│  Structure type: [group_summary ▼]                  │
│  (or custom: [_____________])                        │
│                                                     │
│  Custom prompt for this slide:                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Generate revenue management initiatives with  │ │
│  │ name, owner, and timeline...                  │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Recipe Structure

```json
{
  "static_fields": {
    "company_name": "...",
    "date": "..."
  },
  "slides": {
    "group_summary_instances": [
      {
        "structure_type": "group_summary",
        "group_name": "Core Revenue Management",
        "summary": "Tax revenue collection and management"
      },
      {
        "structure_type": "group_summary",
        "group_name": "Supporting Capabilities",
        "summary": "Functions supporting the tax platform"
      }
    ],
    "initiative_detail_instances": [
      {
        "structure_type": "initiative_detail",
        "name": "Registration",
        "owner": "Team A",
        "timeline": "Q2"
      },
      {
        "structure_type": "initiative_detail",
        "name": "Taxpayer Accounting",
        "owner": "Team B",
        "timeline": "Q3"
      }
    ]
  }
}
```

## Edge Cases

1. **Missing structure_type**: If an instance doesn't have `structure_type`, cannot map to template - skip or show error
2. **No instances returned**: Show one slide with placeholder values
3. **Mismatched fields**: If AI doesn't include all tagged fields, missing ones show as empty
4. **Unknown structure_type**: If AI uses a structure_type not in our template mapping, show warning
5. **Empty custom prompt**: AI uses default context from slide content and tagged fields

## Implementation Notes

### Recipe Generation
- Recipe should explicitly ask AI to include `structure_type` in each instance
- Recipe should include the structure type identifier so AI knows what context each slide represents

### Validation
- Check that each instance has `structure_type` field
- Check that `structure_type` maps to one of our defined repeatable slides
- Check that all tagged fields for each structure type are present

### Generation
- Group instances by `structure_type`
- For each structure type, generate N slides (one per instance)
- Maintain order based on instance array order in JSON

## Persistence

Repeatable slide configuration (slideIndex, structureType, customPrompt) must be saved to and loaded from patches:

1. **Saving**: When any repeatable field changes (toggle, structure type, custom prompt), trigger save to server
2. **Loading**: When a patch is applied or auto-matched, restore full repeatableSlides array
3. **Auto-match**: When PPTX is loaded, auto-apply patch if pptxFile matches

### Expected JSON Response Format

```json
{
  "static": {
    "core_revenue_management": "Revenue Mgmt",
    "group_summary__roadmap_initiative_overview": "Group Summary"
  },
  "slides": {
    "group_summary": [
      {
        "structure_type": "group_summary",
        "group_name": "Core Revenue Management",
        "summary": "Tax revenue collection and management"
      }
    ],
    "initiative_detail": [
      {
        "structure_type": "initiative_detail",
        "name": "Registration",
        "owner": "Team A",
        "timeline": "Q2"
      }
    ]
  }
}
```

### Key Changes from Original Spec
- Static (non-repeatable) fields are under `"static"` key, not root level
- Repeatable slides use user-defined `structureType` as array key (e.g., "group_summary")
- Each instance MUST include `"structure_type"` field matching the array key
- `"slides"` key contains only repeatable slide arrays

## Slide Ordering

When generating output slides, instances must be **grouped by parent-child relationships** rather than all instances of one type appearing consecutively.

### Grouping Logic

1. **Parent-child relationship**: Initiative detail slides should reference their parent group via a field (e.g., `group` or `group_name`)
2. **Interleaved output**: For each group slide, immediately follow it with all its associated initiative detail slides before moving to the next group

### Example

Input JSON:
```json
{
  "slides": {
    "initiative_group_summary": [
      { "structure_type": "initiative_group_summary", "group_name": "Core Revenue Mgmt", ... },
      { "structure_type": "initiative_group_summary", "group_name": "Tax Admin", ... },
      { "structure_type": "initiative_group_summary", "group_name": "Compliance", ... }
    ],
    "initiative_detail": [
      { "structure_type": "initiative_detail", "name": "Taxpayer Reg", "group": "Core Revenue Mgmt", ... },
      { "structure_type": "initiative_detail", "name": "Filing & Returns", "group": "Core Revenue Mgmt", ... },
      { "structure_type": "initiative_detail", "name": "Payment Mgmt", "group": "Tax Admin", ... },
      { "structure_type": "initiative_detail", "name": "Audit & Review", "group": "Compliance", ... }
    ]
  }
}
```

Output slide order (correct):
- Slide 1: Group: Core Revenue Mgmt
- Slide 2: Initiative: Taxpayer Reg (group: Core Revenue Mgmt)
- Slide 3: Initiative: Filing & Returns (group: Core Revenue Mgmt)
- Slide 4: Group: Tax Admin
- Slide 5: Initiative: Payment Mgmt (group: Tax Admin)
- Slide 6: Group: Compliance
- Slide 7: Initiative: Audit & Review (group: Compliance)

### Implementation Notes

- The AI recipe should include a field that links initiatives to their parent group
- During generation, build a map of group → initiatives
- Output slides in order: group1, [initiatives for group1], group2, [initiatives for group2], ...
- Static slides (if any) appear first before any repeatable slides

## PPTX Generation Behavior

When generating the output PPTX:

1. **Extract templates**: Load all slide XML from input PPTX
2. **Map structure types**: Build mapping from `structureType` to slide template
3. **Generate instances**: For each structure type, create N slides (one per instance in JSON array)
4. **Generate static slides**: Include non-repeatable slides once with static data
5. **Reconstruct PPTX**:
   - Remove original slide XML files
   - Add new slide XML files numbered sequentially (slide1.xml, slide2.xml, ...)
   - Update `ppt/presentation.xml` with new slide count and IDs
   - Update `ppt/_rels/presentation.xml.rels` with new slide relationships

### Example

Input PPTX: 3 slides (1 static, 2 repeatable templates)

JSON with 3 groups and 4 initiatives linked by group field:

Output PPTX: 1 + 3 + 4 = 8 slides

Slide order (interleaved by group):
- Slide 1: Static content (Slide 1 from template)
- Slide 2: Group 1 (Core Revenue Mgmt)
- Slides 3-4: Initiatives for Group 1
- Slide 5: Group 2 (Tax Admin)
- Slide 6: Initiative for Group 2
- Slide 7: Group 3 (Compliance)
- Slide 8: Initiative for Group 3

## Future Enhancements (Out of Scope)

- Nested/referenced instances (e.g., initiatives grouped under their parent group)
- Bulk import of predefined data
- Template library for common slide types
- Field mapping UI to match JSON keys to slides
- Auto-detect structure types from slide content

## Open Questions

1. Should structure types be predefined (dropdown) or free-text?
2. How to handle ordering - should groups and their initiatives be adjacent?
3. Should we show a preview of the data structure before sending to AI?
4. How to handle validation warnings for missing fields?