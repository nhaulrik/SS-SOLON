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
import fsp     from 'fs/promises'
import path    from 'path'
import { exec } from 'child_process'
import { callAi }              from '../lib/ai/ai-client.js'
import { parseJson, callAiJson } from '../lib/ai/json-parser.js'
import {
  readContextFiles,
  readContextFilesCompact,
  readTabularColumns,
  readColumnUniqueValues,
  extractGroupedSlices,
} from '../lib/ai/context-reader.js'
import { validateHtmlJson }    from '../lib/html/html-recipe-builder.js'
import {
  buildOrchestratorPrompt,
  buildBlocksPrompt,
  buildInstancePrompt,
  buildSlicerPrompt,
  buildCompletionPrompt,
} from '../lib/ai/agentic-prompts.js'
import { RESOLVED_PROJECTS_DIR, SLICE_TEMPLATES_DIR, SLICER_BATCH_SIZE, AGENT_BATCH_SIZE, RAW_CONTEXT_CAP_CHARS } from '../config.js'
import { resolveProjectDir } from '../lib/project/project-manager.js'

const router = express.Router()

// ── Helpers ────────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString().slice(11, 22) // HH:MM:SS.ms
}

function emit(res, type, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`event: ${type}\ndata: ${payload}\n\n`)
}

function buildAgentsFromInstances(remappedInstances) {
  const agents = []
  let globalIdx = 0
  for (const [slideKey, count] of Object.entries(remappedInstances)) {
    for (let i = 0; i < count; i++) {
      agents.push({ id: `${slideKey}_${i}`, type: 'instance', slideKey, instanceIndex: i, instanceCount: count, globalIndex: globalIdx, label: `${slideKey} — #${i + 1}` })
      globalIdx++
    }
  }
  return agents
}



function normalizeCompletionResult(parsed, missingKeys) {
  // Delegate to unwrapParsed with missingKeys as the expected keys,
  // then extract only the missing keys from the best candidate.
  // unwrapParsed is defined later in this file but hoisted as a function declaration — safe to call.
  const best = unwrapParsed(parsed, missingKeys)
  if (!best || typeof best !== 'object' || Array.isArray(best)) return {}
  const out = {}
  for (const key of missingKeys) {
    if (Object.prototype.hasOwnProperty.call(best, key)) out[key] = best[key]
  }
  return out
}



function initSse(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
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


/**
 * Unwrap an AI-parsed instance result that may be wrapped in a container.
 *
 * The AI is asked to return a flat object: { auto_div_header: "...", ... }
 * but frequently wraps it in:
 *   - a top-level array:                    [{ auto_div_header: "..." }]
 *   - a named slide wrapper:                { slide_1: { auto_div_header: "..." } }
 *   - a slides+instances wrapper:           { slides: { slide_1: { instances: [{ auto_div_header: "..." }] } } }
 *   - an instances array:                   { instances: [{ auto_div_header: "..." }] }
 *
 * expectedKeys: the zone keys this instance agent was supposed to fill.
 * If provided, we score candidates by how many expected keys they contain.
 * Falls back to the original value if nothing better is found.
 */
function unwrapParsed(parsed, expectedKeys = []) {
  // Score a candidate: how many expectedKeys does it contain?
  function score(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return -1
    if (expectedKeys.length === 0) return Object.keys(obj).length
    return expectedKeys.filter(k => Object.prototype.hasOwnProperty.call(obj, k)).length
  }

  // Collect all candidate objects by traversing known wrapper patterns
  function candidates(val) {
    if (!val || typeof val !== 'object') return []
    if (Array.isArray(val)) {
      // Flatten array elements
      return val.flatMap(el => candidates(el))
    }
    const result = [val]
    // Named containers: slides, blocks, shared, instance, instances
    for (const k of ['slides', 'blocks', 'shared', 'instance']) {
      if (val[k] && typeof val[k] === 'object') result.push(...candidates(val[k]))
    }
    if (Array.isArray(val['instances'])) {
      result.push(...val['instances'].flatMap(el => candidates(el)))
    }
    // Arbitrary top-level keys (e.g. slide_1, slide_2 ...)
    for (const k of Object.keys(val)) {
      if (['slides','blocks','shared','instance','instances'].includes(k)) continue
      const child = val[k]
      if (child && typeof child === 'object') result.push(...candidates(child))
    }
    return result
  }

  const all = candidates(parsed)
  if (all.length === 0) return parsed

  // Pick the candidate with the highest score
  let best = parsed, bestScore = score(parsed)
  for (const c of all) {
    const s = score(c)
    if (s > bestScore) { best = c; bestScore = s }
  }
  return best
}

/**
 * Remap AI-returned instance keys to match the expected repeatableSlide keys.
 * The AI may return keys in the wrong order or with different names — this
 * function aligns them positionally, falling back to the first returned key.
 * If there are no repeatableSlides, all returned instances are used as-is.
 */
function remapInstances(instances, repeatableSlides) {
  const remappedInstances = {}
  const expectedKeys = repeatableSlides.map(rs => rs.key)
  const returnedKeys = Object.keys(instances)
  expectedKeys.forEach((key, i) => {
    const aiKey = returnedKeys[i] ?? returnedKeys[0]
    remappedInstances[key] = instances[key] ?? instances[aiKey] ?? 1
  })
  if (repeatableSlides.length === 0) Object.assign(remappedInstances, instances)
  return remappedInstances
}

function assembleResults(agentResults, zones = []) {
  const assembled = {}

  // Pre-compute the expected zone keys for instance agents (unique keys across repeatable zones)
  const instanceZoneKeys = zones
    .filter(z => z.autoGenerate !== false && !z.ignored && z.unique !== false)
    .map(z => z.key)
    .filter(Boolean)

  for (const { agent, parsed: rawParsed } of agentResults) {
    const expectedKeys = agent.type === 'instance' ? instanceZoneKeys : []
    const parsed = unwrapParsed(rawParsed, expectedKeys)
    if (parsed !== rawParsed) {
      console.log(`[assembleResults][${agent.label}] Unwrapped AI response — original top-level keys: [${Object.keys(rawParsed ?? {}).join(', ')}], unwrapped keys: [${Object.keys(parsed ?? {}).join(', ')}]`)
    }
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

async function runAgentsWithConcurrency(agents, limit, runAgent) {
  const agentResults = new Array(agents.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const currentIndex = nextIndex++
      if (currentIndex >= agents.length) return
      const result = await runAgent(agents[currentIndex], currentIndex)
      agentResults[currentIndex] = result
    }
  }

  const workerCount = Math.min(limit, agents.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return agentResults
}

// ── GET /agentic/context-column-values — return unique values for a specific column ──

router.get('/agentic/context-column-values', async (req, res) => {
  try {
    const { projectName, column, selectedFiles } = req.query
    if (!projectName) return res.status(400).json({ error: 'projectName is required' })
    if (!column)      return res.status(400).json({ error: 'column is required' })

    const projectDir = resolveProjectDir(projectName)
    const contextDir = path.join(projectDir, 'AI Context')
    const sel = selectedFiles
      ? (Array.isArray(selectedFiles) ? selectedFiles : selectedFiles.split(',').map(s => s.trim()).filter(Boolean))
      : []

    let filenames
    try { filenames = await fsp.readdir(contextDir) } catch { return res.json({ values: [] }) }

    const TABULAR_EXT = new Set(['.xlsx', '.xls', '.csv'])
    let tabular = filenames.filter(f =>
      TABULAR_EXT.has(path.extname(f).toLowerCase()) && !f.startsWith('~$') && !f.startsWith('.')
    )
    if (sel.length > 0) {
      const selSet = new Set(sel)
      tabular = tabular.filter(f => selSet.has(f))
    }

    const values = (await readColumnUniqueValues(contextDir, column, tabular))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    return res.json({ values })
  } catch (err) {
    console.error('[agentic/context-column-values]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── GET /agentic/context-columns — return column names from tabular context files ──

router.get('/agentic/context-columns', async (req, res) => {
  try {
    const { projectName, selectedFiles } = req.query
    if (!projectName) return res.status(400).json({ error: 'projectName is required' })

    const projectDir = resolveProjectDir(projectName)
    const sel = selectedFiles
      ? (Array.isArray(selectedFiles) ? selectedFiles : selectedFiles.split(',').map(s => s.trim()).filter(Boolean))
      : []

    const { columns, fileCount } = await readTabularColumns(projectDir, { selectedFiles: sel })
    return res.json({ columns, fileCount })
  } catch (err) {
    console.error('[agentic/context-columns]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

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
         recipe              = '',
         zones               = [],
         repeatableSlides    = [],
         contentPrompt       = '',
         customInput         = '',
         selectedFiles       = [],
         sliceOutputTemplate = null,
         groupingColumn      = null,
         filters             = [],
         // Legacy support
         filterColumn        = null,
         filterValues        = [],
       } = req.body

       // Convert new filters format to internal rowFilters format
       // Support multiple filters with AND logic
       let rowFilters = []
       if (filters && filters.length > 0) {
         rowFilters = filters
           .filter(f => f.column && f.values && f.values.length > 0)
           .map(f => ({
             column: f.column,
             values: new Set(f.values.map(v => String(v).toLowerCase()))
           }))
       } else if (filterColumn && filterValues.length > 0) {
         // Legacy support for old format
         rowFilters = [{
           column: filterColumn,
           values: new Set(filterValues.map(v => String(v).toLowerCase()))
         }]
       }
       
       // For backward compatibility, also create single rowFilter for old code paths
       const rowFilter = rowFilters.length > 0 ? rowFilters[0] : null

      if (!projectName) return error('projectName is required')
      if (!sliceOutputTemplate) return error('sliceOutputTemplate is required — select a slice output template before generating.')

      // Load templateInstructions from flow.json and merge with contentPrompt so
      // instructions baked into the template's <meta name="ai-instructions"> always reach the AI.
      let templateInstructions = ''
      if (flowId) {
        try {
          const flowPath = path.join(resolveProjectDir(projectName),'flows', flowId, 'flow.json')
          const flowData = JSON.parse(await fsp.readFile(flowPath, 'utf8'))
          templateInstructions = flowData.templateInstructions || ''
        } catch {}
      }
      const effectiveInstructions = [templateInstructions, customInput || contentPrompt].filter(Boolean).join('\n\n')

      // ── Purge stale debug files from previous run ────────────────────────────
      if (flowId) {
        const debugDir = path.join(resolveProjectDir(projectName),'flows', flowId, 'debug')
        try {
          await fsp.mkdir(debugDir, { recursive: true })
          const existing = await fsp.readdir(debugDir)
          const stale = existing.filter(f => f.endsWith('.txt'))
          await Promise.all(stale.map(f => fsp.unlink(path.join(debugDir, f))))
          if (stale.length > 0) log(`Purged ${stale.length} stale debug file(s) from previous run`)
        } catch (err) {
          log(`Warning: could not purge stale files: ${err.message}`)
        }
      }

     console.log('[agentic/plan] Request body:', JSON.stringify({ projectName, customInput, contentPrompt }, null, 2))

     const projectDir = resolveProjectDir(projectName)

     // ── Load slice output template ────────────────────────────────────────────
     let sliceTemplateBody = null
     try {
       const templatePath = path.join(SLICE_TEMPLATES_DIR, sliceOutputTemplate)
       const templateRaw = await fsp.readFile(templatePath, 'utf-8')
       const separatorIdx = templateRaw.indexOf('\n---\n')
       sliceTemplateBody = separatorIdx !== -1 ? templateRaw.slice(separatorIdx + 5).trim() : templateRaw.trim()
       log(`Slice output template loaded: "${sliceOutputTemplate}" (${sliceTemplateBody.length} chars)`)
     } catch (err) {
       return error(`Slice output template "${sliceOutputTemplate}" could not be read: ${err.message}`)
     }

     // ── Context / summaries ──────────────────────────────────────────────────
       phase('analyzing')

       log(`Custom input received: ${customInput ? `"${customInput.substring(0, 50)}..."` : '(empty)'}`)

    if (rowFilters.length > 0) {
      log(`Row filters: ${rowFilters.map(f => `"${f.column}" in [${[...f.values].join(', ')}]`).join(' AND ')}`)
    }

    // ── Fast path: no repeatable slides — skip orchestrator entirely ──────────
    if (repeatableSlides.length === 0) {
      log('No repeatable slides — skipping orchestrator, reading full context directly...')
      const fullContext = await readContextFiles(projectDir, { selectedFiles, rowFilter: rowFilters })

      if (fullContext.fileCount === 0) {
        log('No context files found — proceeding without context')
      } else {
        log(`Context files: ${fullContext.files?.join(', ') || '(none)'}`)
        log(`Full context: ${(fullContext.totalChars / 1000).toFixed(1)}k chars`)
      }

      // Persist full context to disk so /run can re-read it without a browser round-trip
      if (flowId) {
        const debugDir = path.join(resolveProjectDir(projectName),'flows', flowId, 'debug')
        try {
          await fsp.mkdir(debugDir, { recursive: true })
          await fsp.writeFile(path.join(debugDir, 'ai-slice-shared.txt'), fullContext.text || '', 'utf8')
          log(`Saved full context as debug/ai-slice-shared.txt`)
        } catch (err) {
          console.error(`[agentic/plan] Failed to save context: ${err.message}`)
          log(`Warning: Failed to save context to disk: ${err.message}`)
        }
      }

      const { hasBlocks, hasShared } = buildRepSetInfo(zones, repeatableSlides)
      const agentPlan = []
      if (hasBlocks || hasShared) agentPlan.push({ id: 'blocks', label: 'Blocks & Shared' })

      log(`Plan ready — ${agentPlan.length} agent${agentPlan.length !== 1 ? 's' : ''} queued (no orchestrator)`)

      emit(res, 'plan', JSON.stringify({
        instances: {},
        instanceNames: [],
        rationale: 'No repeatable slides — full context passed directly to blocks agent.',
        agentPlan,
        contextFiles: fullContext.fileCount,
      }))
      return res.end()
    }

    // ── Orchestrator path: repeatable slides present ──────────────────────────
    log('Reading AI Context files...')

    let instanceNames = []
    let remappedInstances = {}
    let rationale = ''
    let sharedText = ''
    let slices = {}
    let contextFileCount = 0
    let orchestratorPrompt = ''

    if (groupingColumn) {
      // ── Deterministic path: user selected a grouping column ────────────────
      phase('planning')
      log(`Grouping column selected: "${groupingColumn}" — skipping orchestrator`)

       const fullContext = await readContextFiles(projectDir, { selectedFiles, rowFilter: rowFilters })
       contextFileCount = fullContext.fileCount

       if (fullContext.fileCount === 0) {
         log('No context files found — proceeding without context')
       } else {
         log(`Context files: ${fullContext.files?.join(', ') || '(none)'}`)
         log(`Full context: ${(fullContext.totalChars / 1000).toFixed(1)}k chars`)
       }

       const contextDir = path.join(projectDir, 'AI Context')
       const groupValues = await readColumnUniqueValues(contextDir, groupingColumn, fullContext.files || [], rowFilters)

      if (groupValues.length === 0) {
        return error(`Column "${groupingColumn}" not found or has no values in context files`)
      }

      log(`Column "${groupingColumn}": ${groupValues.length} unique value(s) found`)

      instanceNames = groupValues
      rationale = `Grouped by column "${groupingColumn}" — ${groupValues.length} unique value(s) found.`

      // Assign all instances to the first repeatable slide key
      const expectedKeys = repeatableSlides.map(rs => rs.key)
      expectedKeys.forEach((key, i) => {
        remappedInstances[key] = i === 0 ? groupValues.length : 0
      })

       log(`Extracting slices deterministically...`)
       const det = await extractGroupedSlices(contextDir, groupingColumn, groupValues, fullContext.files || [], rowFilters)
      slices = det.slices
      sharedText = det.sharedText
      log(`Deterministic slicing complete: ${Object.keys(slices).length} instance slice(s)`)

    } else {
      // ── Orchestrator + AI-slicer path ──────────────────────────────────────
       const [compactContext, fullContext] = await Promise.all([
         readContextFilesCompact(projectDir, { selectedFiles, rowFilter: rowFilters }),
         readContextFiles(projectDir, { selectedFiles, rowFilter: rowFilters }),
       ])
      contextFileCount = compactContext.fileCount

      if (compactContext.fileCount === 0) {
        log('No context files found — proceeding without context')
      } else {
        log(`Context files: ${compactContext.files?.join(', ') || '(none)'}`)
        log(`Compact schema: ${(compactContext.totalChars / 1000).toFixed(1)}k chars`)
        log(`Full context: ${(fullContext.totalChars / 1000).toFixed(1)}k chars`)
      }

      phase('planning')
      log('Orchestrator: identifying grouping from schema...')

      console.log('[agentic/plan] Building orchestrator prompt with:', { customInput: customInput?.substring(0, 50), contentPrompt: contentPrompt?.substring(0, 50), effectiveInstructions: effectiveInstructions?.substring(0, 80) })
      orchestratorPrompt = buildOrchestratorPrompt(recipe, compactContext.text, effectiveInstructions, repeatableSlides)
      log(`Orchestrator prompt: ${orchestratorPrompt.length} chars`)

      let orchResult
      try {
        const orchAi = await callAiJson(orchestratorPrompt, { maxTokens: 1000, temperature: 0.1 }, log)
        const repairInfo = orchAi.wasRepaired ? ` [repaired in ${orchAi.repairAttempts} attempt(s), strategy: ${orchAi.strategy}]` : ` [strategy: ${orchAi.strategy}]`
        log(`Orchestrator response received (${orchAi.raw.length} chars)${repairInfo}`)
        console.log(`[agentic/plan] Orchestrator raw response:\n${orchAi.raw}`)
        console.log(`[agentic/plan] Parse strategy: ${orchAi.strategy}, repairs: ${orchAi.repairAttempts}`)
        orchResult = orchAi.parsed
        console.log('[agentic/plan] Orchestrator parsed OK:', JSON.stringify(orchResult, null, 2))
      } catch (parseErr) {
        const isApiError = parseErr.message.startsWith('Cortex API error')
        if (isApiError) {
          log(`Cortex API error — ${parseErr.message.split('\n')[0]}`)
          log(`This is an upstream API failure. Check Cortex service health.`)
          console.error(`[agentic/plan] Cortex API error (orchestrator):\n${parseErr.message}`)
          return error(`Cortex API error during orchestration: ${parseErr.message.split('\n')[0]}`)
        }
        log(`Orchestrator JSON parse failed after all repair attempts`)
        log(`Error: ${parseErr.message.split('\n')[0]}`)
        console.error(`[agentic/plan] Orchestrator JSON parse FAILED after all repair attempts:\n${parseErr.message}`)
        return error(`Orchestrator returned invalid JSON.\n${parseErr.message}`)
      }

      const { instances: rawInstances = {}, instanceNames: orchNames = [], instanceKeys = [], rationale: orchRationale = '' } = orchResult
      instanceNames = orchNames
      rationale = orchRationale

      // Validate instanceKeys length matches total instance count
      const totalInstances = Object.values(rawInstances).reduce((s, n) => s + n, 0)
      let resolvedInstanceKeys = instanceKeys
      if (instanceKeys.length !== totalInstances) {
        log(`Warning: instanceKeys length (${instanceKeys.length}) does not match total instances (${totalInstances}) — falling back to instanceNames`)
        resolvedInstanceKeys = instanceNames
      }

      // Remap instances by position to correct slide keys (AI may rename keys)
      const expectedKeys = repeatableSlides.map(rs => rs.key)
      const returnedKeys = Object.keys(rawInstances)
      expectedKeys.forEach((key, i) => {
        const aiKey = returnedKeys[i] ?? returnedKeys[0]
        remappedInstances[key] = rawInstances[key] ?? rawInstances[aiKey] ?? 1
      })

      console.log('[agentic/plan] instances:', JSON.stringify(rawInstances))

      // ── Per-instance AI slicer calls (parallel) ───────────────────────────
      sharedText = fullContext.text

       if (instanceNames.length > 0) {
         const cappedRaw = fullContext.text.length > RAW_CONTEXT_CAP_CHARS
           ? fullContext.text.slice(0, RAW_CONTEXT_CAP_CHARS) + '\n[...raw data capped for AI slicer]'
           : fullContext.text
         const batchCount = Math.ceil(instanceNames.length / SLICER_BATCH_SIZE)
        log(`AI-structuring ${instanceNames.length} instance(s) in batches of ${SLICER_BATCH_SIZE} (${cappedRaw.length} chars input each)...`)

        for (let b = 0; b < batchCount; b++) {
          const batchStart = b * SLICER_BATCH_SIZE
          const batch = instanceNames.slice(batchStart, batchStart + SLICER_BATCH_SIZE)
          await Promise.all(batch.map(async (name, j) => {
            const i = batchStart + j
            const prompt = buildSlicerPrompt([name], cappedRaw, sliceTemplateBody)
            try {
              const { response } = await callAi(prompt, { temperature: 0.1, maxTokens: 8000 })
              log(`  Slicer [${i}] "${name}": ${response.length} chars`)
              const stripped = response.replace(/^\s*\[SLIDE_INSTANCE_\d+\]\s*/i, '').trim()
              slices[i.toString()] = stripped || `[No data extracted for instance: "${name}"]`
            } catch (err) {
              console.error(`[agentic/plan] Slicer failed for instance [${i}] "${name}": ${err.message}`)
              slices[i.toString()] = `[Slicer error for instance: "${name}": ${err.message}]`
            }
          }))
        }
        log(`Slicer complete: ${Object.keys(slices).length} instance slice(s) extracted`)
      }
    }

     // Save slice files to disk with new naming convention
     if (flowId) {
       const debugDir = path.join(resolveProjectDir(projectName),'flows', flowId, 'debug')
       try {
         await fsp.mkdir(debugDir, { recursive: true })

         // Helper to make filesystem-safe slug from instance name
         const toSlug = (name) => String(name)
           .toLowerCase()
           .replace(/[^a-z0-9]+/g, '-')
           .replace(/^-+|-+$/g, '')
           .slice(0, 40)

         const writeOps = [
           fsp.writeFile(path.join(debugDir, 'ai-orchestrator-prompt.txt'), orchestratorPrompt || `[deterministic path — grouped by "${groupingColumn}"]`, 'utf8'),
           fsp.writeFile(path.join(debugDir, 'ai-slice-shared.txt'), sharedText || '', 'utf8'),
         ]

         // Write one named slice file per instance
         Object.entries(slices).forEach(([idx, text]) => {
           const name = instanceNames[parseInt(idx)] || `instance-${idx}`
           const slug = toSlug(name)
           const filename = `ai-slice-instance-${idx}-${slug}.txt`
           writeOps.push(fsp.writeFile(path.join(debugDir, filename), text, 'utf8'))
         })

         await Promise.all(writeOps)
         log(`Saved orchestrator prompt + ${Object.keys(slices).length} instance slice(s) + blocks slice to debug/`)
       } catch (err) {
         console.error(`[agentic/plan] Failed to save slices: ${err.message}`)
         log(`Warning: Failed to save slices to disk: ${err.message}`)
       }
     }

     log(`Instances: ${JSON.stringify(remappedInstances)}`)
      log(`Context slices: ${Object.keys(slices).length} key(s) — ${Object.keys(slices).join(', ') || '(none)'}`)
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
         rationale,
         agentPlan,
         contextFiles: contextFileCount,
         groupingColumn: groupingColumn || null,
       }))
    res.end()

  } catch (err) {
    console.error('[agentic/plan] FATAL:', err.stack || err.message)
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
          contentPrompt    = '',
          customInput      = '',
        } = req.body

      if (!projectName) return error('projectName is required')

      let templateInstructions = ''
      if (flowId) {
        try {
          const flowPath = path.join(resolveProjectDir(projectName),'flows', flowId, 'flow.json')
          const flowData = JSON.parse(await fsp.readFile(flowPath, 'utf8'))
          templateInstructions = flowData.templateInstructions || ''
        } catch {}
      }
       const effectiveInstructions = [templateInstructions, customInput || contentPrompt].filter(Boolean).join('\n\n')

       const remappedInstances = remapInstances(instances, repeatableSlides)
     const { repSet, hasBlocks, hasShared } = buildRepSetInfo(zones, repeatableSlides)

     // ── Read slice files from disk ────────────────────────────────────────────
     // Slices are always read from disk — the browser never carries slice content.
      const resolvedSlices = {}
      const resolvedSliceFiles = {}
     if (flowId) {
       const debugDir = path.join(resolveProjectDir(projectName),'flows', flowId, 'debug')
       try {
         const debugFiles = await fsp.readdir(debugDir)

         // Read shared reference data (sheets that don't contain the grouping column)
         const sharedFile = debugFiles.find(f => f === 'ai-slice-shared.txt')
         if (sharedFile) {
           resolvedSlices['shared'] = await fsp.readFile(path.join(debugDir, sharedFile), 'utf8')
           log(`Read shared reference data: ${resolvedSlices['shared'].length} chars`)
         } else {
           log('Warning: ai-slice-shared.txt not found — agents will have no shared reference data')
         }

         // Read instance slices by index prefix
         const instanceFiles = debugFiles.filter(f => /^ai-slice-instance-\d+-.+\.txt$/.test(f))
         await Promise.all(instanceFiles.map(async (filename) => {
           const idxMatch = filename.match(/^ai-slice-instance-(\d+)-/)
           if (idxMatch) {
              const idx = idxMatch[1]
              resolvedSlices[idx] = await fsp.readFile(path.join(debugDir, filename), 'utf8')
              resolvedSliceFiles[idx] = filename
              log(`Read instance slice [${idx}]: ${resolvedSlices[idx].length} chars (${filename})`)
           }
         }))

         log(`Total slices loaded from disk: ${Object.keys(resolvedSlices).length}`)
       } catch (err) {
         log(`Warning: failed to read slice files from disk: ${err.message}`)
       }
     } else {
       log('Warning: no flowId — cannot read slice files from disk, context will be empty')
     }

    // ── Build agent list ──────────────────────────────────────────────────────
    const agents = []
    if (hasBlocks || hasShared) {
      agents.push({ id: 'blocks', type: 'blocks', label: 'Blocks & Shared' })
    }
    agents.push(...buildAgentsFromInstances(remappedInstances))

    if (agents.length === 0) return error('Nothing to generate — no block zones and no instances')

     emit(res, 'agents', agents.map(a => ({ id: a.id, label: a.label, state: 'pending' })))
     phase('generating')
       // ── Constrained parallel generation ───────────────────────────────────────
     log(`Starting ${agents.length} agent${agents.length !== 1 ? 's' : ''} with max ${AGENT_BATCH_SIZE} running at a time...`)
     console.log(`[agentic/run] Agents: ${agents.map(a => a.label).join(', ')}`)
     console.log(`[agentic/run] Context slice keys: ${Object.keys(resolvedSlices).join(', ') || '(none)'}`)
     console.log(`[agentic/run] Zones: ${zones.length}, RepeatableSlides: ${repeatableSlides.length}`)
       const agentResults = await runAgentsWithConcurrency(agents, AGENT_BATCH_SIZE, async (agent) => {
        emit(res, 'agent_update', { id: agent.id, state: 'running' })
        const t0 = Date.now()

        let agentContext = ''

        const sharedSlice = resolvedSlices['shared'] || ''
        if (agent.type === 'blocks') {
          agentContext = sharedSlice
        } else {
          // Instance agents receive their per-group rows plus the full shared reference
          // data (any sheets that don't contain the grouping column — pivot tables,
          // lookup sheets, etc.) so the AI reads pre-computed totals directly rather
          // than summing raw rows.
          const instanceSlice = resolvedSlices[agent.globalIndex.toString()] || ''
          const instanceSliceFile = resolvedSliceFiles[agent.globalIndex.toString()] || '(unknown slice file)'
          agentContext = sharedSlice
            ? `${instanceSlice}\n\n=== Shared Reference Data ===\n${sharedSlice}`
            : instanceSlice
          log(`[${agent.label}] Using slice file: ${instanceSliceFile}`)
        }

         console.log(`[agentic/run][${agent.label}] Context slice length: ${agentContext.length} chars`)
         if (agentContext.length > 1_000_000) {
           console.warn(`[agentic/run][${agent.label}] WARNING: Context exceeds 1M chars (${(agentContext.length / 1_000_000).toFixed(1)}M) — will be capped by prompt builder`)
         }
         console.log(`[agentic/run][${agent.label}] Context preview: ${agentContext.slice(0, 200)}`)

          const prompt = agent.type === 'blocks'
            ? buildBlocksPrompt(zones, repeatableSlides, agentContext, repSet, effectiveInstructions)
            : buildInstancePrompt(zones, repeatableSlides, agent.slideKey, agent.instanceIndex, agent.instanceCount, agentContext, effectiveInstructions)

         console.log(`[agentic/run][${agent.label}] Prompt length: ${prompt.length} chars`)
         if (prompt.length > 2_000_000) {
           console.warn(`[agentic/run][${agent.label}] WARNING: Prompt exceeds 2M chars (${(prompt.length / 1_000_000).toFixed(1)}M) — may fail API limits`)
         }
         console.log(`[agentic/run][${agent.label}] Prompt preview (first 500):\n${prompt.slice(0, 500)}`)

       log(`[${agent.label}] Sending prompt (${prompt.length} chars)...`)
       let parsed
       try {
         const agentAi = await callAiJson(prompt, { maxTokens: 64000, temperature: 0.4 }, (msg) => log(`[${agent.label}] ${msg}`))
         const repairInfo = agentAi.wasRepaired ? ` [repaired in ${agentAi.repairAttempts} attempt(s), strategy: ${agentAi.strategy}]` : ` [strategy: ${agentAi.strategy}]`
         log(`[${agent.label}] Response received (${agentAi.raw.length} chars)${repairInfo}`)
         console.log(`[agentic/run][${agent.label}] Raw response (${agentAi.raw.length} chars):\n${agentAi.raw}`)
         console.log(`[agentic/run][${agent.label}] Parse strategy: ${agentAi.strategy}, repairs: ${agentAi.repairAttempts}`)
         parsed = agentAi.parsed
       } catch (parseErr) {
         const isApiError = parseErr.message.startsWith('Cortex API error')
         if (isApiError) {
           emit(res, 'agent_update', { id: agent.id, state: 'error', errorDetail: parseErr.message })
           log(`[${agent.label}] Cortex API error — ${parseErr.message.split('\n')[0]}`)
           log(`[${agent.label}] This is an upstream API failure. Check Cortex service health.`)
           console.error(`[agentic/run][${agent.label}] Cortex API error:\n${parseErr.message}`)
           throw new Error(`Agent "${agent.label}" failed: ${parseErr.message.split('\n')[0]}`)
         }
         emit(res, 'agent_update', { id: agent.id, state: 'error', errorDetail: parseErr.message })
         log(`[${agent.label}] PARSE ERROR (exhausted all repair strategies)`)
         log(`[${agent.label}] Error details: ${parseErr.message.split('\n')[0]}`)
         console.error(`[agentic/run][${agent.label}] JSON parse FAILED after all repair attempts:\n${parseErr.message}`)
         throw new Error(`Agent "${agent.label}" returned invalid JSON.\n${parseErr.message}`)
       }

       if (Array.isArray(parsed)) {
         log(`[${agent.label}] Parsed OK — top-level is array (${parsed.length} elements) — will unwrap first object`)
         console.log(`[agentic/run][${agent.label}] Parsed top-level is array, length: ${parsed.length}`)
       } else {
         log(`[${agent.label}] Parsed OK — ${Object.keys(parsed).length} top-level keys`)
         console.log(`[agentic/run][${agent.label}] Parsed top-level keys: ${Object.keys(parsed).join(', ')}`)
       }
       emit(res, 'agent_update', { id: agent.id, state: 'done', output: JSON.stringify(parsed, null, 2) })
       log(`${agent.label} done (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

       return { agent, parsed, prompt }
      })

    // Save agent prompts for debugging
    if (flowId) {
      const debugDir = path.join(resolveProjectDir(projectName),'flows', flowId, 'debug')
      try {
        await fsp.mkdir(debugDir, { recursive: true })
        const content = agentResults.map((r, i) => `=== Agent ${i + 1}: ${r.agent.label} ===\n${r.prompt}`).join('\n\n')
        await fsp.writeFile(path.join(debugDir, 'ai-agent-prompts.txt'), content, 'utf8')
        log(`Saved ${agentResults.length} agent prompt(s) to debug/`)
      } catch (err) {
        console.error(`[agentic/run] Failed to save agent prompts: ${err.message}`)
        log(`Warning: Failed to save agent prompts: ${err.message}`)
      }
    }

    // ── Assembly ──────────────────────────────────────────────────────────────
    phase('assembling')
    log('Assembling final JSON...')

    let assembled  = assembleResults(agentResults, zones)
    let jsonString = JSON.stringify(assembled)
    log(`Assembled JSON: ${jsonString.length} chars`)

    let vResult = validateHtmlJson(jsonString, zones, repeatableSlides)
    if (vResult.missingFields?.length > 0) {
      log(`Warning: ${vResult.missingFields.length} missing field(s):`)
      vResult.missingFields.forEach(field => log(`  Missing: ${field}`))

      // ── Missing-field completion pass ──────────────────────────────────────
      log('Attempting to fill missing fields...')

      // Parse missing fields into groups by (slideKey, instanceIndex)
      const completionMap = {} // key: "slideKey:instanceIndex", value: { slideKey, instanceIndex, missingKeys }
      const warnings = []

      for (const field of vResult.missingFields) {
        // Pattern: slideKey[N].fieldKey (N is 1-based) or slideKey.shared.fieldKey or slideKey (missing...)
        const instanceMatch = field.match(/^([^\[.]+)\[(\d+)\]\.(.+)$/)
        const sharedMatch = field.match(/^([^.]+)\.shared\.(.+)$/)
        const missingMatch = field.match(/^([^\s]+)\s*\(missing/)

        if (instanceMatch) {
          const [, slideKey, instanceNum, fieldKey] = instanceMatch
          const instanceIndex = parseInt(instanceNum, 10) - 1 // Convert 1-based to 0-based
          const mapKey = `${slideKey}:${instanceIndex}`
          if (!completionMap[mapKey]) {
            completionMap[mapKey] = { slideKey, instanceIndex, missingKeys: [] }
          }
          completionMap[mapKey].missingKeys.push(fieldKey)
        } else if (sharedMatch) {
          warnings.push(`Skipping shared zone field: ${field}`)
        } else if (missingMatch) {
          warnings.push(`Skipping non-instance field: ${field}`)
        } else {
          warnings.push(`Could not parse missing field format: ${field}`)
        }
      }

      if (warnings.length > 0) {
        warnings.forEach(w => log(`  ⚠️  ${w}`))
      }

      const completionEntries = Object.values(completionMap)
      if (completionEntries.length === 0) {
        log('No instance fields to complete.')
      } else {
        log(`Completing ${completionEntries.length} instance(s) with missing field(s)...`)

        // Run completion calls in parallel
        const completionPromises = completionEntries.map(async (entry) => {
          const { slideKey, instanceIndex, missingKeys } = entry
          const agent = agentResults.find(
            r => r.agent.slideKey === slideKey && r.agent.instanceIndex === instanceIndex
          )

          if (!agent) {
            log(`  [${slideKey}[${instanceIndex + 1}]] No agent result found — skipping`)
            return null
          }

          // Re-derive agentContext from resolvedSlices using the same logic as generation
          let agentContext = ''
          const sharedSlice = resolvedSlices['shared'] || ''
          if (agent.agent.type === 'blocks') {
            agentContext = sharedSlice
          } else {
            const instanceSlice = resolvedSlices[agent.agent.globalIndex.toString()] || ''
            agentContext = sharedSlice
              ? `${instanceSlice}\n\n=== Shared Reference Data ===\n${sharedSlice}`
              : instanceSlice
          }

          const completionPrompt = buildCompletionPrompt(
            missingKeys,
            zones,
            agentContext,
            effectiveInstructions
          )

          try {
            log(`  [${slideKey}[${instanceIndex + 1}]] Completing: ${missingKeys.join(', ')}`)
            const completionAi = await callAiJson(
              completionPrompt,
              { maxTokens: 16000, temperature: 0.2 },
              (msg) => log(`    [${slideKey}[${instanceIndex + 1}]] ${msg}`)
            )
            log(`  [${slideKey}[${instanceIndex + 1}]] Completion received (${completionAi.raw.length} chars)`)
            const normalized = normalizeCompletionResult(completionAi.parsed, missingKeys)
            return { slideKey, instanceIndex, parsed: normalized }
          } catch (err) {
            log(`  [${slideKey}[${instanceIndex + 1}]] Completion failed: ${err.message.split('\n')[0]}`)
            return null
          }
        })

        const completionResults = await Promise.all(completionPromises)

        // Merge completion results into assembled
        for (const result of completionResults) {
          if (!result) continue
          const { slideKey, instanceIndex, parsed } = result
          if (!assembled.slides?.[slideKey]?.instances?.[instanceIndex]) continue

          // Merge parsed fields into the existing instance
          Object.assign(assembled.slides[slideKey].instances[instanceIndex], parsed)
          log(`  [${slideKey}[${instanceIndex + 1}]] Merged completion result`)
        }

        // Re-validate
        jsonString = JSON.stringify(assembled)
        vResult = validateHtmlJson(jsonString, zones, repeatableSlides)
        if (vResult.missingFields?.length > 0) {
          log(`After completion: still ${vResult.missingFields.length} missing field(s)`)
          vResult.missingFields.slice(0, 5).forEach(field => log(`  Missing: ${field}`))
          if (vResult.missingFields.length > 5) log(`  ... and ${vResult.missingFields.length - 5} more`)
        } else {
          log(`Completion successful — all fields populated (${vResult.foundFields?.length ?? 0} fields)`)
        }
      }
    } else {
      log(`All fields populated (${vResult.foundFields?.length ?? 0} fields)`)
    }

    log('Done.')
    done(jsonString)
    res.end()

  } catch (err) {
    log(`FATAL ERROR: ${err.stack || err.message}`)
    error(err.message)
  }
})

// ── POST /agentic/retry-agent — re-run a single failed agent ─────────────────
//
// Reads the pre-computed slice from disk (written during /plan), runs the agent
// prompt again, then merges the result into the caller-supplied currentJson.

router.post('/agentic/retry-agent', async (req, res) => {
  try {
    const {
      projectName,
      flowId,
      agentId,
      zones            = [],
      repeatableSlides = [],
      instances        = {},
      contentPrompt    = '',
      customInput      = '',
      currentJson      = '{}',
    } = req.body

    if (!projectName || !flowId || !agentId) {
      return res.status(400).json({ ok: false, error: 'projectName, flowId and agentId are required' })
    }

    let templateInstructions = ''
    try {
      const flowPath = path.join(resolveProjectDir(projectName),'flows', flowId, 'flow.json')
      const flowData = JSON.parse(await fsp.readFile(flowPath, 'utf8'))
      templateInstructions = flowData.templateInstructions || ''
    } catch {}
    const effectiveInstructions = [templateInstructions, customInput || contentPrompt].filter(Boolean).join('\n\n')

    // Parse agentId → slideKey + instanceIndex.
    // Format: `${slideKey}_${instanceIndex}` — the instanceIndex is always a
    // non-negative integer after the last underscore.
    const lastUnder = agentId.lastIndexOf('_')
    const slideKey     = agentId.slice(0, lastUnder)
    const instanceIndex = parseInt(agentId.slice(lastUnder + 1), 10)

    if (!slideKey || isNaN(instanceIndex)) {
      return res.status(400).json({ ok: false, error: `Cannot parse agentId: "${agentId}"` })
    }

     // Reconstruct remappedInstances the same way /run does.
     const remappedInstances = remapInstances(instances, repeatableSlides)

    // Find globalIndex by iterating in the same order as the agent-build loop.
    let globalIndex = 0
    let found = false
    outer: for (const [sk, count] of Object.entries(remappedInstances)) {
      for (let i = 0; i < count; i++) {
        if (sk === slideKey && i === instanceIndex) { found = true; break outer }
        globalIndex++
      }
    }
    if (!found) {
      return res.status(400).json({ ok: false, error: `Agent "${agentId}" not found in instances map` })
    }

    const agentIds = buildAgentsFromInstances(remappedInstances)

    // Read the pre-computed slice from disk.
    const debugDir = path.join(resolveProjectDir(projectName),'flows', flowId, 'debug')
    let agentContext = ''
    try {
      const debugFiles = await fsp.readdir(debugDir)
      const sliceFile  = debugFiles.find(f => new RegExp(`^ai-slice-instance-${globalIndex}-`).test(f))
      const instanceSlice = sliceFile
        ? await fsp.readFile(path.join(debugDir, sliceFile), 'utf8')
        : ''
      if (!sliceFile) console.warn(`[retry-agent] No slice file found for globalIndex ${globalIndex} in ${debugDir}`)

      const sharedFile = debugFiles.find(f => f === 'ai-slice-shared.txt')
      const sharedSlice = sharedFile
        ? await fsp.readFile(path.join(debugDir, sharedFile), 'utf8')
        : ''

      agentContext = sharedSlice
        ? `${instanceSlice}\n\n=== Shared Reference Data ===\n${sharedSlice}`
        : instanceSlice
    } catch (err) {
      console.warn(`[retry-agent] Could not read debug dir: ${err.message}`)
    }

    // Build prompt and call the AI.
    const { repSet } = buildRepSetInfo(zones, repeatableSlides)
    const instanceCount = remappedInstances[slideKey] ?? 1
    const prompt = buildInstancePrompt(
      zones, repeatableSlides, slideKey, instanceIndex, instanceCount,
      agentContext, effectiveInstructions
    )

    let parsed
    try {
      const agentAi = await callAiJson(prompt, { maxTokens: 64000, temperature: 0.4 })
      parsed = agentAi.parsed
    } catch (parseErr) {
      return res.status(422).json({ ok: false, error: `Agent returned invalid JSON: ${parseErr.message.split('\n')[0]}` })
    }

    // Load from flow.json as source of truth — client-provided currentJson may be
    // stale/empty when the user navigated away from the recipe step and back before
    // triggering a retry (htmlProject in-memory state doesn't carry agenticJsonResponse).
    let current = {}
    try {
      const flowPath = path.join(resolveProjectDir(projectName),'flows', flowId, 'flow.json')
      const flowData = JSON.parse(await fsp.readFile(flowPath, 'utf8'))
      const savedJson = flowData.agenticJsonResponse
      if (savedJson) {
        current = typeof savedJson === 'string' ? JSON.parse(savedJson) : savedJson
      }
    } catch {
      // flow.json unavailable — fall back to client-supplied currentJson
      try { current = JSON.parse(currentJson) } catch {}
    }
    current.slides          ??= {}
    current.slides[slideKey] ??= { instances: [] }
    current.slides[slideKey].instances                    ??= []
    current.slides[slideKey].instances[instanceIndex]       = parsed

    const remainingAgentIds = agentIds.filter(a => a.id !== agentId)
    const resumeStartFrom = globalIndex + 1
    return res.json({ ok: true, json: JSON.stringify(current), agentIds: remainingAgentIds, resume: remainingAgentIds.length > 0, resumeStartFrom })

  } catch (err) {
    console.error('[agentic/retry-agent]', err)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/agentic/resume', async (req, res) => {
  initSse(res)

  const log = (msg) => emit(res, 'log', `${ts()}  ${msg}`)
  const phase = (p) => emit(res, 'phase', p)
  const done = (json) => emit(res, 'done', json)
  const error = (msg) => { emit(res, 'error', msg); res.end() }

  try {
    const { projectName, flowId, zones = [], repeatableSlides = [], instances = {}, contentPrompt = '', customInput = '', currentJson = '{}', startFrom = 0 } = req.body
    if (!projectName || !flowId) return error('projectName and flowId are required')

    let templateInstructions = ''
    try {
      const flowPath = path.join(resolveProjectDir(projectName),'flows', flowId, 'flow.json')
      const flowData = JSON.parse(await fsp.readFile(flowPath, 'utf8'))
      templateInstructions = flowData.templateInstructions || ''
    } catch {}
     const effectiveInstructions = [templateInstructions, customInput || contentPrompt].filter(Boolean).join('\n\n')

     const remappedInstances = remapInstances(instances, repeatableSlides)

     const allAgents = buildAgentsFromInstances(remappedInstances)
    const resumeIndex = Math.max(0, Math.min(startFrom, allAgents.length))
    const agents = allAgents.slice(resumeIndex)
    if (agents.length === 0) return done(currentJson)

    const resolvedSlices = {}
    try {
      const debugDir = path.join(resolveProjectDir(projectName),'flows', flowId, 'debug')
      const debugFiles = await fsp.readdir(debugDir)
      const sharedFile = debugFiles.find(f => f === 'ai-slice-shared.txt')
          if (sharedFile) resolvedSlices.shared = await fsp.readFile(path.join(debugDir, sharedFile), 'utf8')
          const instanceFiles = debugFiles.filter(f => /^ai-slice-instance-\d+-.+\.txt$/.test(f))
          await Promise.all(instanceFiles.map(async (filename) => {
            const idxMatch = filename.match(/^ai-slice-instance-(\d+)-/)
            if (idxMatch) resolvedSlices[idxMatch[1]] = await fsp.readFile(path.join(debugDir, filename), 'utf8')
          }))
    } catch (err) {
      log(`Warning: failed to read slice files from disk: ${err.message}`)
    }

    if (resumeIndex > 0) {
      const skipped = allAgents.slice(0, resumeIndex).map(a => a.id)
      log(`Resume starting at agent index ${resumeIndex} [0m(${skipped.join(', ') || 'none'} already completed)`)
    }

     phase('generating')
     const agentResults = await runAgentsWithConcurrency(agents, AGENT_BATCH_SIZE, async (agent) => {
        emit(res, 'agent_update', { id: agent.id, state: 'running' })
        const sharedSlice = resolvedSlices.shared || ''
        const instanceSliceKey = agent.globalIndex.toString()
        const instanceSlice = resolvedSlices[instanceSliceKey] || ''
        const instanceSliceFile = `ai-slice-instance-${instanceSliceKey}-*.txt`
        log(`[${agent.label}] Using slice file: ${instanceSliceFile}`)
        const agentContext = sharedSlice ? `${instanceSlice}\n\n=== Shared Reference Data ===\n${sharedSlice}` : instanceSlice
        const prompt = buildInstancePrompt(zones, repeatableSlides, agent.slideKey, agent.instanceIndex, agent.instanceCount, agentContext, effectiveInstructions)
        const agentAi = await callAiJson(prompt, { maxTokens: 64000, temperature: 0.4 })
        emit(res, 'agent_update', { id: agent.id, state: 'done', output: JSON.stringify(agentAi.parsed, null, 2) })
        return { agent, parsed: agentAi.parsed }
    })

    let current = {}
    try { current = JSON.parse(currentJson) } catch {}
    current.slides ??= {}
    for (const result of agentResults) {
      const { slideKey, instanceIndex } = result.agent
      current.slides[slideKey] ??= { instances: [] }
      current.slides[slideKey].instances ??= []
      current.slides[slideKey].instances[instanceIndex] = result.parsed
    }

    done(JSON.stringify(current))
    res.end()
  } catch (err) {
    error(err.message)
  }
})

// ── GET /agentic/context-slice — read a single instance slice file from debug/ ──
router.get('/agentic/context-slice', async (req, res) => {
  const { projectName, flowId, instanceIdx } = req.query
  if (!projectName || !flowId) return res.status(400).json({ error: 'projectName and flowId required' })

  const debugDir = path.join(resolveProjectDir(projectName),'flows', flowId, 'debug')
  try {
    const files = await fsp.readdir(debugDir).catch(() => [])

    if (instanceIdx === 'shared') {
      const sharedPath = path.join(debugDir, 'ai-slice-shared.txt')
      const content = await fsp.readFile(sharedPath, 'utf8').catch(() => '')
      return res.json({ content, filename: 'ai-slice-shared.txt' })
    }

    const idx = parseInt(instanceIdx, 10)
    const prefix = `ai-slice-instance-${idx}-`
    const match = files.find(f => f.startsWith(prefix) && f.endsWith('.txt'))
    if (!match) return res.json({ content: '', filename: null })

    const content = await fsp.readFile(path.join(debugDir, match), 'utf8')
    res.json({ content, filename: match })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /agentic/open-debug-folder — reveal flow debug dir in OS file manager ─
router.post('/agentic/open-debug-folder', (req, res) => {
  const { projectName, flowId } = req.body || {}
  if (!projectName || !flowId) return res.status(400).json({ error: 'projectName and flowId required' })
  const dir = path.join(resolveProjectDir(projectName),'flows', flowId, 'debug')
  const cmd = process.platform === 'win32'
    ? `explorer "${dir}"`
    : process.platform === 'darwin'
      ? `open "${dir}"`
      : `xdg-open "${dir}"`
  exec(cmd, err => {
    if (err) return res.status(500).json({ error: err.message })
    res.json({ ok: true })
  })
})

// ── POST /slice-templates/open-folder — reveal templates dir in OS file manager ─
router.post('/slice-templates/open-folder', (_req, res) => {
  const dir = SLICE_TEMPLATES_DIR
  const cmd = process.platform === 'win32'
    ? `explorer "${dir}"`
    : process.platform === 'darwin'
      ? `open "${dir}"`
      : `xdg-open "${dir}"`
  exec(cmd, err => {
    if (err) return res.status(500).json({ error: err.message })
    res.json({ ok: true })
  })
})

// ── GET /slice-templates — list available slice output templates ──────────────
router.get('/slice-templates', async (req, res) => {
  try {
    const files = await fsp.readdir(SLICE_TEMPLATES_DIR)
    const templates = []
    for (const file of files.filter(f => f.endsWith('.txt'))) {
      const raw = await fsp.readFile(path.join(SLICE_TEMPLATES_DIR, file), 'utf-8')
      const nameLine = raw.match(/^TEMPLATE_NAME:\s*(.+)$/m)
      const descLine = raw.match(/^TEMPLATE_DESCRIPTION:\s*(.+)$/m)
      templates.push({
        filename: file,
        name: nameLine ? nameLine[1].trim() : file.replace('.txt', ''),
        description: descLine ? descLine[1].trim() : '',
      })
    }
    res.json(templates)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
