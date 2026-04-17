/**
 * server/routes/opencode-agentic.js
 *
 * POST /api/opencode/agentic
 *
 * Streams Server-Sent Events while running parallel AI agents via the same
 * Cortex API used by ai-proxy (callAi from ai-client.js). No OpenCode SDK.
 *
 * Pipeline:
 *   1. Read AI Context files
 *   2. Orchestrator call  → instance counts + compact context summary
 *   3. Parallel agents    → blocks/shared agent + one agent per instance
 *   4. Assemble + validate → emit done with final JSON
 *
 * SSE event types:
 *   phase        string   'analyzing' | 'planning' | 'generating' | 'assembling'
 *   log          string   timestamped log line
 *   agents       JSON     [{ id, label, state:'pending' }]
 *   agent_update JSON     { id, state:'running'|'done'|'error' }
 *   done         string   final JSON (auto-fills JSON Response field)
 *   error        string   error message
 */

import express from 'express'
import path    from 'path'
import { callAi }           from '../lib/ai-client.js'
import { readContextFiles } from '../lib/context-reader.js'
import { validateHtmlJson } from '../lib/html-recipe-builder.js'
import { RESOLVED_PROJECTS_DIR } from '../config.js'

const router = express.Router()

// ── Helpers ────────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString().slice(11, 22) // HH:MM:SS.ms
}

function emit(res, type, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`event: ${type}\ndata: ${payload}\n\n`)
}

function parseJson(text) {
  // Strip markdown code fences if the model wraps its output
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  return JSON.parse(cleaned)
}

// ── Prompt builders ────────────────────────────────────────────────────────────

function buildOrchestratorPrompt(recipe, contextText) {
  const contextBlock = contextText
    ? `CONTEXT FILES:\n${contextText}`
    : 'CONTEXT: (no context files provided)'

  return `You are an orchestrator for a presentation slide generation system.

${contextBlock}

RECIPE (the template that must be filled):
${recipe}

Your tasks:
1. Read the context to determine how many instances to generate for each REPEATABLE SLIDE in the recipe. Base the count on actual data items (e.g. one instance per product, person, project listed in the context).
2. Write a COMPACT CONTEXT SUMMARY (max 350 words) capturing all key data points that content-generating agents will need. This will be the ONLY context those agents receive — make it dense and complete.

Return ONLY valid JSON (no markdown, no explanation):
{
  "instances": { "<slideKey>": <number> },
  "contextSummary": "<concise structured summary of all data points>",
  "rationale": "<one sentence explaining instance count decision>"
}

If there are no repeatable slides, use: "instances": {}`
}

function buildBlocksPrompt(zones, repeatableSlides, contextSummary, repSet) {
  const repBySlide = new Map(repeatableSlides.map(rs => [rs.slideIndex, rs]))

  const blockZones = zones.filter(
    z => !repSet.has(z.slideIndex) && z.autoGenerate !== false && !z.ignored
  )
  const sharedZones = zones.filter(
    z => repSet.has(z.slideIndex) && z.unique === false && z.autoGenerate !== false && !z.ignored
  )

  let prompt = `You populate an HTML slide template with real content.

STRUCTURAL CONTRACT (read before anything else):
Every innerHTML value you return MUST use the EXACT same HTML elements, class names,
attributes, and nesting depth as the template shown for that key. Only text content
and src/href values may differ. Never simplify, flatten, add, or remove elements.
Violating this breaks the slide layout irreparably.

CONTEXT:
${contextSummary || 'No context provided.'}

Return ONLY valid JSON (no markdown):
{
  "blocks": { "<key>": { "value": "<innerHTML matching template structure>" } },
  "slides": { "<slideKey>": { "shared": { "<key>": "<innerHTML matching template structure>" } } }
}
Omit a section entirely if it has no zones.

ZONES TO FILL:\n`

  if (blockZones.length > 0) {
    prompt += '\n[BLOCK ZONES]\n'
    blockZones.forEach(z => {
      prompt += `\nKEY "${z.key}"${z.prompt ? ` — ${z.prompt}` : ''}\n`
      if (z.exampleHtml) {
        prompt += `Fill this template with real data (structure is a contract — do not alter it):\n${z.exampleHtml}\n`
      }
    })
  }

  if (sharedZones.length > 0) {
    const bySlide = {}
    sharedZones.forEach(z => {
      const slideKey = repBySlide.get(z.slideIndex)?.key ?? `slide_${z.slideIndex}`
      ;(bySlide[slideKey] ??= []).push(z)
    })
    prompt += '\n[SHARED ZONES — same value on every slide clone]\n'
    for (const [slideKey, slideZones] of Object.entries(bySlide)) {
      prompt += `\nSlide "${slideKey}":\n`
      slideZones.forEach(z => {
        prompt += `\nKEY "${z.key}"${z.prompt ? ` — ${z.prompt}` : ''}\n`
        if (z.exampleHtml) {
          prompt += `Fill this template with real data (structure is a contract — do not alter it):\n${z.exampleHtml}\n`
        }
      })
    }
  }

  return prompt
}

function buildInstancePrompt(zones, repeatableSlides, slideKey, instanceIndex, instanceCount, contextSummary) {
  const rsConfig = repeatableSlides.find(rs => rs.key === slideKey)
  const slideIdx = rsConfig?.slideIndex

  const uniqueZones = zones.filter(
    z => z.slideIndex === slideIdx && z.unique !== false && z.autoGenerate !== false && !z.ignored
  )

  let prompt =
    `You populate one slide instance in a presentation template with real content.

STRUCTURAL CONTRACT (read before anything else):
Every innerHTML value you return MUST use the EXACT same HTML elements, class names,
attributes, and nesting depth as the template shown for each key. Only text content
and src/href values may differ. Never simplify, flatten, add, or remove elements.
Violating this breaks the slide layout irreparably.

CONTEXT:
${contextSummary || 'No context provided.'}

Task: populate instance ${instanceIndex + 1} of ${instanceCount}. Use data item number ${instanceIndex + 1} from the context.${rsConfig?.prompt ? `\nSlide guidance: ${rsConfig.prompt}` : ''}

Return ONLY a valid JSON object with EXACTLY these keys:
{
`
  uniqueZones.forEach(z => { prompt += `  "${z.key}": "<innerHTML matching template structure>",\n` })
  prompt += `}

TEMPLATES PER KEY (structure is a contract — fill with data, do not alter structure):\n`
  uniqueZones.forEach(z => {
    prompt += `\nKEY "${z.key}"${z.prompt ? ` — ${z.prompt}` : ''}:\n`
    if (z.exampleHtml) {
      prompt += `${z.exampleHtml}\n`
    } else {
      prompt += `(no template — generate appropriate innerHTML)\n`
    }
  })

  return prompt
}

// ── Result assembler ───────────────────────────────────────────────────────────

function assembleResults(agentResults) {
  const assembled = {}

  for (const { agent, parsed } of agentResults) {
    if (agent.type === 'blocks') {
      if (parsed.blocks) assembled.blocks = parsed.blocks
      if (parsed.slides) {
        assembled.slides ??= {}
        for (const [k, v] of Object.entries(parsed.slides)) {
          assembled.slides[k] = { ...(assembled.slides[k] ?? {}), ...v }
        }
      }
    } else {
      assembled.slides ??= {}
      const slide = (assembled.slides[agent.slideKey] ??= { instances: [] })
      slide.instances ??= []
      slide.instances[agent.instanceIndex] = parsed
    }
  }

  if (assembled.slides) {
    for (const slideData of Object.values(assembled.slides)) {
      if (slideData.instances) slideData.instances = slideData.instances.filter(Boolean)
    }
  }

  return assembled
}

// ── POST /agentic/plan — orchestration only, SSE stream ───────────────────────
//
// Streams log events while reading context and running the orchestrator.
// Ends with a `plan` event containing the proposed generation plan, which the
// client shows to the user for confirmation before calling /run.

router.post('/agentic/plan', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const log   = (msg) => emit(res, 'log',   `${ts()}  ${msg}`)
  const phase = (p)   => emit(res, 'phase', p)
  const error = (msg) => { emit(res, 'error', msg); res.end() }

  try {
    const { projectName, recipe = '', zones = [], repeatableSlides = [] } = req.body

    if (!projectName) return error('projectName is required')
    if (!recipe.trim()) return error('No recipe provided')

    // Read context
    phase('analyzing')
    log('Reading AI Context files...')
    const projectDir = path.join(RESOLVED_PROJECTS_DIR, projectName)
    const context    = await readContextFiles(projectDir)

    if (context.fileCount === 0) {
      log('No context files found — proceeding without context')
    } else {
      const kb = (context.totalChars / 1000).toFixed(1)
      log(`Found ${context.fileCount} file${context.fileCount !== 1 ? 's' : ''} (${kb}k chars)`)
    }

    // Orchestrator
    phase('planning')
    log('Orchestrator: analysing recipe + context...')

    const orchRaw = await callAi(buildOrchestratorPrompt(recipe, context.text), {
      maxTokens: 2000,
      temperature: 0.3,
    })

    let orchResult
    try {
      orchResult = parseJson(orchRaw.response)
    } catch {
      return error(`Orchestrator returned invalid JSON: ${orchRaw.response.slice(0, 200)}`)
    }

    const { instances = {}, contextSummary = '', rationale = '' } = orchResult

    if (rationale) log(`Orchestrator: ${rationale}`)
    for (const [key, n] of Object.entries(instances)) {
      log(`  ${key}: ${n} instance${n !== 1 ? 's' : ''}`)
    }

    // Derive agent list for the confirmation card
    const repSet    = new Set(repeatableSlides.map(rs => rs.slideIndex))
    const hasBlocks = zones.some(z => !repSet.has(z.slideIndex) && z.autoGenerate !== false && !z.ignored)
    const hasShared = zones.some(z => repSet.has(z.slideIndex) && z.unique === false && z.autoGenerate !== false && !z.ignored)

    const agentPlan = []
    if (hasBlocks || hasShared) agentPlan.push({ id: 'blocks', label: 'Blocks & Shared' })
    for (const [slideKey, count] of Object.entries(instances)) {
      for (let i = 0; i < count; i++) {
        agentPlan.push({ id: `${slideKey}_${i}`, label: `${slideKey} — instance ${i + 1}` })
      }
    }

    log(`Plan ready — ${agentPlan.length} agent${agentPlan.length !== 1 ? 's' : ''} queued`)

    emit(res, 'plan', JSON.stringify({
      instances,
      contextSummary,
      rationale,
      agentPlan,
      contextFiles: context.fileCount,
    }))
    res.end()

  } catch (err) {
    error(err.message)
  }
})

// ── POST /agentic/run — parallel generation, SSE stream ───────────────────────
//
// Accepts the plan produced by /plan (instances + contextSummary already resolved)
// and streams generation progress back as SSE events.

router.post('/agentic/run', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const log   = (msg)  => emit(res, 'log',   `${ts()}  ${msg}`)
  const phase = (p)    => emit(res, 'phase',  p)
  const done  = (json) => emit(res, 'done',   json)
  const error = (msg)  => { emit(res, 'error', msg); res.end() }

  try {
    const {
      projectName,
      recipe        = '',
      zones         = [],
      repeatableSlides = [],
      instances     = {},
      contextSummary = '',
    } = req.body

    if (!projectName) return error('projectName is required')
    if (!recipe.trim()) return error('No recipe provided')

    // ── Build agent list ───────────────────────────────────────────────────
    const repSet    = new Set(repeatableSlides.map(rs => rs.slideIndex))
    const hasBlocks = zones.some(z => !repSet.has(z.slideIndex) && z.autoGenerate !== false && !z.ignored)
    const hasShared = zones.some(z => repSet.has(z.slideIndex) && z.unique === false && z.autoGenerate !== false && !z.ignored)

    const agents = []
    if (hasBlocks || hasShared) agents.push({ id: 'blocks', type: 'blocks', label: 'Blocks & Shared' })
    for (const [slideKey, count] of Object.entries(instances)) {
      for (let i = 0; i < count; i++) {
        agents.push({ id: `${slideKey}_${i}`, type: 'instance', slideKey, instanceIndex: i, instanceCount: count, label: `${slideKey} — #${i + 1}` })
      }
    }

    if (agents.length === 0) return error('Nothing to generate — no block zones and no instances')

    emit(res, 'agents', agents.map(a => ({ id: a.id, label: a.label, state: 'pending' })))
    phase('generating')
    log(`Starting ${agents.length} parallel agent${agents.length !== 1 ? 's' : ''}...`)

    // ── Parallel generation ────────────────────────────────────────────────
    const agentResults = await Promise.all(agents.map(async (agent) => {
      emit(res, 'agent_update', { id: agent.id, state: 'running' })
      const t0 = Date.now()

      const prompt = agent.type === 'blocks'
        ? buildBlocksPrompt(zones, repeatableSlides, contextSummary, repSet)
        : buildInstancePrompt(zones, repeatableSlides, agent.slideKey, agent.instanceIndex, agent.instanceCount, contextSummary)

      const result = await callAi(prompt, { maxTokens: 3000, temperature: 0.4 })

      let parsed
      try {
        parsed = parseJson(result.response)
      } catch {
        emit(res, 'agent_update', { id: agent.id, state: 'error' })
        throw new Error(`Agent "${agent.label}" returned invalid JSON: ${result.response.slice(0, 120)}`)
      }

      const secs = ((Date.now() - t0) / 1000).toFixed(1)
      emit(res, 'agent_update', { id: agent.id, state: 'done' })
      log(`${agent.label} done (${secs}s)`)
      return { agent, parsed }
    }))

    // ── Assembly ───────────────────────────────────────────────────────────
    phase('assembling')
    log('Assembling final JSON...')

    const assembled  = assembleResults(agentResults)
    const jsonString = JSON.stringify(assembled)

    const vResult = validateHtmlJson(jsonString, zones, repeatableSlides)
    if (vResult.missingFields?.length > 0) {
      log(`Warning: ${vResult.missingFields.length} missing field(s) — ${vResult.missingFields.slice(0, 3).join(', ')}`)
    } else {
      log(`All fields populated (${vResult.foundFields?.length ?? 0} fields)`)
    }

    log('Done.')
    done(jsonString)
    res.end()

  } catch (err) {
    error(err.message)
  }
})

export default router
