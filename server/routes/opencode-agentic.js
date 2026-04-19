/**
 * server/routes/opencode-agentic.js
 *
 * POST /api/opencode/agentic/plan  — orchestration only, SSE stream
 * POST /api/opencode/agentic/run   — parallel generation, SSE stream
 *
 * Pipeline:
 *   1. Read AI Context files
 *   2. Orchestrator call  → instance counts + per-instance verbatim context slices
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
import fs      from 'fs'
import path    from 'path'
import { callAi }              from '../lib/ai-client.js'
import { readContextFiles, readContextFilesCompact, extractGroupedSlices, getSummaryStatus } from '../lib/context-reader.js'
import { validateHtmlJson }    from '../lib/html-recipe-builder.js'
import { generateSummaries }   from '../lib/summary-generator.js'
import {
  buildOrchestratorPrompt,
  buildBlocksPrompt,
  buildInstancePrompt,
} from '../lib/agentic-prompts.js'
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
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  return JSON.parse(cleaned)
}

function initSse(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
}

/**
 * The AI frequently renames repeatable-slide keys despite instructions.
 * Correct by position: map returned keys back to the user-defined ones.
 */
function remapInstances(instances, repeatableSlides) {
  if (repeatableSlides.length === 0) return { ...instances }
  const expectedKeys = repeatableSlides.map(rs => rs.key)
  const returnedKeys = Object.keys(instances)
  const result = {}
  expectedKeys.forEach((key, i) => {
    const aiKey = returnedKeys[i] ?? returnedKeys[0]
    result[key] = instances[key] ?? instances[aiKey] ?? 1
  })
  return result
}


/**
 * Derive which zone categories are present given the current repeatable-slide set.
 */
function buildRepSetInfo(zones, repeatableSlides) {
  const repSet    = new Set(repeatableSlides.map(rs => rs.slideIndex))
  const hasBlocks = zones.some(z => !repSet.has(z.slideIndex) && z.autoGenerate !== false && !z.ignored)
  const hasShared = zones.some(z => repSet.has(z.slideIndex) && z.unique === false && z.autoGenerate !== false && !z.ignored)
  return { repSet, hasBlocks, hasShared }
}

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

router.post('/agentic/plan', async (req, res) => {
  initSse(res)

  const log   = (msg) => emit(res, 'log',   `${ts()}  ${msg}`)
  const phase = (p)   => emit(res, 'phase', p)
  const error = (msg) => { emit(res, 'error', msg); res.end() }

  try {
    const {
      projectName,
      flowId,
      recipe           = '',
      zones            = [],
      repeatableSlides = [],
      summaryMode      = 'use',
      summaryPrompt    = '',
      contentPrompt    = '',
    } = req.body

    if (!projectName) return error('projectName is required')

    const projectDir = path.join(RESOLVED_PROJECTS_DIR, projectName)

     // ── Context / summaries ──────────────────────────────────────────────────
     phase('analyzing')

     log('Reading AI Context files (compact schema)...')
     const compactContext = await readContextFilesCompact(projectDir)

    if (compactContext.fileCount === 0) {
      log('No context files found — proceeding without context')
    } else {
      log(`Context files: ${compactContext.files?.join(', ') || '(none)'}`)
      log(`Compact schema: ${(compactContext.totalChars / 1000).toFixed(1)}k chars`)
    }

    // ── Orchestrator ─────────────────────────────────────────────────────────
    phase('planning')
    log('Orchestrator: identifying grouping from schema...')

    const orchestratorPrompt = buildOrchestratorPrompt(recipe, compactContext.text, contentPrompt, repeatableSlides)
    log(`Orchestrator prompt: ${orchestratorPrompt.length} chars`)

     const orchRaw = await callAi(orchestratorPrompt, { maxTokens: 1000, temperature: 0.1 })
    log(`Orchestrator response received (${orchRaw.response.length} chars)`)

    let orchResult
    try {
      orchResult = parseJson(orchRaw.response)
    } catch {
      return error(`Orchestrator returned invalid JSON: ${orchRaw.response.slice(0, 200)}`)
    }

      const { instances: rawInstances = {}, instanceNames = [], rationale = '', grouping = null } = orchResult
      const remappedInstances = remapInstances(rawInstances, repeatableSlides)

      console.log('[agentic/plan] instances:', JSON.stringify(rawInstances))
      console.log('[agentic/plan] grouping:', JSON.stringify(grouping))

    // ── Build contextSlices from real data (code-based, no AI) ───────────────
    log('Extracting context slices from source files...')
    const contextDir = path.join(projectDir, 'AI Context')
    let contextSlices = {}

    if (grouping?.column && grouping?.values?.length > 0) {
      log(`Grouping by column "${grouping.column}" — ${grouping.values.length} group(s)`)
      const { slices, blocksText, matched } = await extractGroupedSlices(
        contextDir, grouping.column, grouping.values, compactContext.files
      )
      if (matched) {
        contextSlices = { ...slices }
        if (blocksText) contextSlices['blocks'] = blocksText
        log(`Slices built: ${Object.keys(slices).length} instance slice(s)${blocksText ? ' + blocks' : ''}`)
      } else {
        log(`Warning: column "${grouping.column}" not found in any file — slices will be empty`)
      }
    } else if (grouping === null && repeatableSlides.length === 0) {
      // No repeatable slides — read full context for the blocks agent
      log('No repeatable slides — reading full context for blocks agent...')
      const fullContext = await readContextFiles(projectDir)
      if (fullContext.text) contextSlices['blocks'] = fullContext.text
    } else {
      log('Warning: orchestrator did not return a grouping spec — slices will be empty')
    }

    // Save orchestrator prompt for debugging
    if (flowId) {
      const flowDir = path.join(RESOLVED_PROJECTS_DIR, projectName, 'flows', flowId)
      if (fs.existsSync(flowDir)) {
        fs.writeFileSync(path.join(flowDir, 'ai-orchestrator-prompt.txt'), orchestratorPrompt, 'utf8')
      }
    }

     log(`Instances: ${JSON.stringify(remappedInstances)}`)
     log(`Context slices: ${Object.keys(contextSlices).length} key(s) — ${Object.keys(contextSlices).join(', ') || '(none)'}`)
     log(`Instance names: ${instanceNames.join(', ') || '(none)'}`)
     if (rationale) log(`Orchestrator: ${rationale}`)
    for (const [key, n] of Object.entries(remappedInstances)) {
      log(`  ${key}: ${n} instance${n !== 1 ? 's' : ''}`)
    }

    // ── Derive agent plan for confirmation card ───────────────────────────────
    const { hasBlocks, hasShared } = buildRepSetInfo(zones, repeatableSlides)
    const agentPlan = []
    if (hasBlocks || hasShared) agentPlan.push({ id: 'blocks', label: 'Blocks & Shared' })

    let nameIdx = 0
    for (const [slideKey, count] of Object.entries(remappedInstances)) {
      for (let i = 0; i < count; i++) {
        const name = instanceNames[nameIdx] || `${slideKey} — instance ${i + 1}`
        agentPlan.push({ id: `${slideKey}_${i}`, label: name })
        nameIdx++
      }
    }

    log(`Plan ready — ${agentPlan.length} agent${agentPlan.length !== 1 ? 's' : ''} queued`)

      emit(res, 'plan', JSON.stringify({
        instances: remappedInstances,
        instanceNames,
        contextSlices,
        rationale,
        agentPlan,
        contextFiles: compactContext.fileCount,
      }))
    res.end()

  } catch (err) {
    error(err.message)
  }
})

// ── POST /agentic/run — parallel generation, SSE stream ───────────────────────

router.post('/agentic/run', async (req, res) => {
  initSse(res)

  const log   = (msg)  => emit(res, 'log',   `${ts()}  ${msg}`)
  const phase = (p)    => emit(res, 'phase',  p)
  const done  = (json) => emit(res, 'done',   json)
  const error = (msg)  => { emit(res, 'error', msg); res.end() }

  try {
      const {
        projectName,
        flowId,
        zones            = [],
        repeatableSlides = [],
        instances        = {},
        contextSlices    = {},
        contentPrompt    = '',
      } = req.body

    if (!projectName) return error('projectName is required')

    const remappedInstances = remapInstances(instances, repeatableSlides)
    const { repSet, hasBlocks, hasShared } = buildRepSetInfo(zones, repeatableSlides)

    // ── Build agent list ──────────────────────────────────────────────────────
    const agents = []
    if (hasBlocks || hasShared) {
      agents.push({ id: 'blocks', type: 'blocks', label: 'Blocks & Shared' })
    }
    let globalIdx = 0
    for (const [slideKey, count] of Object.entries(remappedInstances)) {
      for (let i = 0; i < count; i++) {
        agents.push({ id: `${slideKey}_${i}`, type: 'instance', slideKey, instanceIndex: i, instanceCount: count, globalIndex: globalIdx, label: `${slideKey} — #${i + 1}` })
        globalIdx++
      }
    }

    if (agents.length === 0) return error('Nothing to generate — no block zones and no instances')

    emit(res, 'agents', agents.map(a => ({ id: a.id, label: a.label, state: 'pending' })))
    phase('generating')
    log(`Starting ${agents.length} parallel agent${agents.length !== 1 ? 's' : ''}...`)

      // ── Parallel generation ───────────────────────────────────────────────────
      const agentResults = await Promise.all(agents.map(async (agent) => {
        emit(res, 'agent_update', { id: agent.id, state: 'running' })
        const t0 = Date.now()

        let agentContext = ''

        if (agent.type === 'blocks') {
          agentContext = contextSlices['blocks'] || ''
        } else {
          agentContext = contextSlices[agent.globalIndex.toString()] || ''
        }

       const prompt = agent.type === 'blocks'
         ? buildBlocksPrompt(zones, repeatableSlides, agentContext, repSet, contentPrompt)
         : buildInstancePrompt(zones, repeatableSlides, agent.slideKey, agent.instanceIndex, agent.instanceCount, agentContext, contentPrompt)

      log(`[${agent.label}] Sending prompt (${prompt.length} chars)...`)
      const result = await callAi(prompt, { maxTokens: 3000, temperature: 0.4 })
      log(`[${agent.label}] Response received (${result.response.length} chars)`)

      let parsed
      try {
        parsed = parseJson(result.response)
      } catch {
        emit(res, 'agent_update', { id: agent.id, state: 'error' })
        throw new Error(`Agent "${agent.label}" returned invalid JSON: ${result.response.slice(0, 120)}`)
      }

      log(`[${agent.label}] Parsed OK — ${Object.keys(parsed).length} top-level keys`)
      emit(res, 'agent_update', { id: agent.id, state: 'done' })
      log(`${agent.label} done (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

      return { agent, parsed, prompt }
    }))

    // Save agent prompts for debugging
    if (flowId) {
      const flowDir = path.join(RESOLVED_PROJECTS_DIR, projectName, 'flows', flowId)
      if (fs.existsSync(flowDir)) {
        const content = agentResults.map((r, i) => `=== Agent ${i + 1}: ${r.agent.label} ===\n${r.prompt}`).join('\n\n')
        fs.writeFileSync(path.join(flowDir, 'ai-agent-prompts.txt'), content, 'utf8')
      }
    }

    // ── Assembly ──────────────────────────────────────────────────────────────
    phase('assembling')
    log('Assembling final JSON...')

    const assembled  = assembleResults(agentResults)
    const jsonString = JSON.stringify(assembled)
    log(`Assembled JSON: ${jsonString.length} chars`)

    const vResult = validateHtmlJson(jsonString, zones, repeatableSlides)
    if (vResult.missingFields?.length > 0) {
      log(`Warning: ${vResult.missingFields.length} missing field(s):`)
      vResult.missingFields.forEach(field => log(`  Missing: ${field}`))
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
