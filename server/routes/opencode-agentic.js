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
import { callAi }              from '../lib/ai/ai-client.js'
import { readContextFiles, readContextFilesCompact, getSummaryStatus } from '../lib/ai/context-reader.js'
import { validateHtmlJson }    from '../lib/html/html-recipe-builder.js'
import { generateSummaries }   from '../lib/ai/summary-generator.js'
import {
  buildOrchestratorPrompt,
  buildBlocksPrompt,
  buildInstancePrompt,
  buildSlicerPrompt,
} from '../lib/ai/agentic-prompts.js'
import { RESOLVED_PROJECTS_DIR, SLICE_TEMPLATES_DIR } from '../config.js'

const router = express.Router()

// ── Helpers ────────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString().slice(11, 22) // HH:MM:SS.ms
}

function emit(res, type, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`event: ${type}\ndata: ${payload}\n\n`)
}

// Walk text from `start` and return the index after the matching closeChar.
// Respects string literals and escape sequences. Returns -1 if unbalanced.
function findBalancedEnd(text, start, openChar, closeChar) {
  let depth = 0, inString = false, escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escaped)                               { escaped = false; continue }
    if (c === '\\')                            { escaped = true;  continue }
    if (c === '"')                             { inString = !inString; continue }
    if (inString)                              continue
    if (c === openChar)                        depth++
    else if (c === closeChar && --depth === 0) return i + 1
  }
  return -1
}

/**
 * Enhanced JSON extraction with multiple strategies.
 * Returns { parsed, strategy } on success, throws with diagnostics on failure.
 */
function parseJson(text) {
  // Strategy 1: fenced code blocks (json, js, or bare)
  for (const pattern of [
    /```\s*(?:json|JSON)\s*([\s\S]*?)```/,
    /```\s*(?:javascript|js)\s*([\s\S]*?)```/,
    /```\s*([\s\S]*?)```/,
  ]) {
    const match = text.match(pattern)
    if (match) {
      try { return { parsed: JSON.parse(match[1].trim()), strategy: 'fenced-block' } } catch {}
    }
  }

  // Strategy 2: balanced JSON object
  const objectStart = text.indexOf('{')
  if (objectStart !== -1) {
    const endIdx = findBalancedEnd(text, objectStart, '{', '}')
    if (endIdx > objectStart) {
      try { return { parsed: JSON.parse(text.substring(objectStart, endIdx)), strategy: 'bracket-matched-object' } } catch {}
    }
  }

  // Strategy 3: balanced JSON array
  const arrayStart = text.indexOf('[')
  if (arrayStart !== -1) {
    const endIdx = findBalancedEnd(text, arrayStart, '[', ']')
    if (endIdx > arrayStart) {
      try { return { parsed: JSON.parse(text.substring(arrayStart, endIdx)), strategy: 'bracket-matched-array' } } catch {}
    }
  }

  // Strategy 4: full text
  try { return { parsed: JSON.parse(text.trim()), strategy: 'full-text' } } catch {}

  throw new Error(
    `All JSON extraction strategies failed.\n` +
    `Text length: ${text.length} chars\n` +
    `Text preview (first 500 chars):\n${text.substring(0, 500)}`
  )
}

/**
 * Call the AI and parse the response as JSON.
 * Uses enhanced multi-strategy parsing with smart repair attempts.
 * 
 * Returns: { parsed, raw, strategy, wasRepaired, repairAttempts }
 */
async function callAiJson(prompt, options = {}, logFn = null) {
   const warn = (msg) => { console.warn(msg); logFn?.(`⚠️  ${msg}`) }
   const result = await callAi(prompt, options)
   let parseResult

   // Check for truncated response
   if (result.finishReason === 'length') {
     warn(`Response truncated by max_tokens limit — JSON may be incomplete`)
   } else if (result.finishReason !== 'stop') {
     warn(`Unexpected finish_reason: ${result.finishReason}`)
   }

   // Attempt 1: Try enhanced parsing on raw response
   try {
     parseResult = parseJson(result.response)
     console.log(`[callAiJson] Parse succeeded on attempt 1 using strategy: ${parseResult.strategy}`)
     return {
       parsed: parseResult.parsed,
       raw: result.response,
       strategy: parseResult.strategy,
       wasRepaired: false,
       repairAttempts: 0,
       finishReason: result.finishReason,
     }
   } catch (firstErr) {
     console.warn('[callAiJson] Parse attempt 1 failed:', firstErr.message)
   }

   // Repair attempt 1: Ask for strict JSON-only response
   logFn?.(`JSON parse failed — attempting repair 1 (strict JSON-only format)...`)
   console.log('[callAiJson] Attempting repair 1: strict JSON-only format')
   const repairPrompt1 =
     `You previously returned text that contains JSON but is not valid. ` +
     `Extract and return ONLY the raw JSON object or array — nothing else.\n` +
     `- Do not include markdown code fences\n` +
     `- Do not include explanatory text before or after\n` +
     `- Do not include comments\n` +
     `- Start with { or [ and end with } or ]\n` +
     `- Ensure all strings are properly quoted\n` +
     `- Ensure all braces and brackets are balanced\n\n` +
     `Original response to repair:\n${result.response}`

   const retry1 = await callAi(repairPrompt1, {
     maxTokens: options.maxTokens ?? 3000,
     temperature: 0,
   })

   if (retry1.finishReason === 'length') {
     warn(`Repair 1 response also truncated by max_tokens limit`)
   }

   try {
     parseResult = parseJson(retry1.response)
     console.log(`[callAiJson] Parse succeeded on repair 1 using strategy: ${parseResult.strategy}`)
     return {
       parsed: parseResult.parsed,
       raw: retry1.response,
       strategy: parseResult.strategy,
       wasRepaired: true,
       repairAttempts: 1,
       finishReason: retry1.finishReason,
     }
   } catch (secondErr) {
     console.warn('[callAiJson] Repair 1 failed:', secondErr.message)
   }

   // Repair attempt 2: Extract the JSON object/array and ask to fix it
   logFn?.(`Repair 1 failed — attempting repair 2 (JSON fragment extraction)...`)
   console.log('[callAiJson] Attempting repair 2: JSON fragment extraction and validation')
   const extractPrompt =
     `Extract the JSON object or array from this text (even if incomplete or malformed).\n` +
     `Return ONLY the JSON, fixing any obvious issues:\n` +
     `- Add missing closing braces/brackets\n` +
     `- Fix unescaped quotes in strings\n` +
     `- Fix trailing commas\n` +
     `- Ensure valid JSON syntax\n\n` +
     `Text:\n${result.response}`

   const retry2 = await callAi(extractPrompt, {
     maxTokens: options.maxTokens ?? 3000,
     temperature: 0,
   })

   if (retry2.finishReason === 'length') {
     warn(`Repair 2 response also truncated by max_tokens limit`)
   }

   try {
     parseResult = parseJson(retry2.response)
     console.log(`[callAiJson] Parse succeeded on repair 2 using strategy: ${parseResult.strategy}`)
     return {
       parsed: parseResult.parsed,
       raw: retry2.response,
       strategy: parseResult.strategy,
       wasRepaired: true,
       repairAttempts: 2,
       finishReason: retry2.finishReason,
     }
   } catch (thirdErr) {
     console.warn('[callAiJson] Repair 2 failed:', thirdErr.message)
   }

   // All repair attempts failed — throw comprehensive error
   throw new Error(
     `JSON parsing failed after 2 repair attempts.\n\n` +
     `Original response (${result.response.length} chars, finish_reason: ${result.finishReason}):\n` +
     `${result.response.substring(0, 1000)}${result.response.length > 1000 ? '\n[...truncated]' : ''}\n\n` +
     `Repair 1 response (${retry1.response.length} chars, finish_reason: ${retry1.finishReason}):\n` +
     `${retry1.response.substring(0, 500)}${retry1.response.length > 500 ? '\n[...truncated]' : ''}\n\n` +
     `Repair 2 response (${retry2.response.length} chars, finish_reason: ${retry2.finishReason}):\n` +
     `${retry2.response.substring(0, 500)}${retry2.response.length > 500 ? '\n[...truncated]' : ''}`
   )
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
        recipe              = '',
        zones               = [],
        repeatableSlides    = [],
        summaryMode         = 'use',
        summaryPrompt       = '',
        contentPrompt       = '',
        customInput         = '',
        selectedFiles       = [],
        sliceOutputTemplate = null,
      } = req.body

      if (!projectName) return error('projectName is required')
      if (!sliceOutputTemplate) return error('sliceOutputTemplate is required — select a slice output template before generating.')

      // ── Purge stale debug files from previous run ────────────────────────────
      if (flowId) {
        const debugDir = path.join(RESOLVED_PROJECTS_DIR, projectName, 'flows', flowId, 'debug')
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

     const projectDir = path.join(RESOLVED_PROJECTS_DIR, projectName)

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

    // ── Fast path: no repeatable slides — skip orchestrator entirely ──────────
    if (repeatableSlides.length === 0) {
      log('No repeatable slides — skipping orchestrator, reading full context directly...')
      const fullContext = await readContextFiles(projectDir, { selectedFiles })

      if (fullContext.fileCount === 0) {
        log('No context files found — proceeding without context')
      } else {
        log(`Context files: ${fullContext.files?.join(', ') || '(none)'}`)
        log(`Full context: ${(fullContext.totalChars / 1000).toFixed(1)}k chars`)
      }

      // Persist full context to disk so /run can re-read it without a browser round-trip
      if (flowId) {
        const debugDir = path.join(RESOLVED_PROJECTS_DIR, projectName, 'flows', flowId, 'debug')
        try {
          await fsp.mkdir(debugDir, { recursive: true })
          await fsp.writeFile(path.join(debugDir, 'ai-slice-blocks.txt'), fullContext.text || '', 'utf8')
          log(`Saved full context as debug/ai-slice-blocks.txt`)
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
    const [compactContext, fullContext] = await Promise.all([
      readContextFilesCompact(projectDir, { selectedFiles }),
      readContextFiles(projectDir, { selectedFiles }),
    ])

    if (compactContext.fileCount === 0) {
      log('No context files found — proceeding without context')
    } else {
      log(`Context files: ${compactContext.files?.join(', ') || '(none)'}`)
      log(`Compact schema: ${(compactContext.totalChars / 1000).toFixed(1)}k chars`)
      log(`Full context: ${(fullContext.totalChars / 1000).toFixed(1)}k chars`)
    }

     // ── Orchestrator ─────────────────────────────────────────────────────────
     phase('planning')
     log('Orchestrator: identifying grouping from schema...')

      const promptToUse = customInput || contentPrompt
      console.log('[agentic/plan] Building orchestrator prompt with:', { customInput: customInput?.substring(0, 50), contentPrompt: contentPrompt?.substring(0, 50), promptToUse: promptToUse?.substring(0, 50) })
      const orchestratorPrompt = buildOrchestratorPrompt(recipe, compactContext.text, promptToUse, repeatableSlides)
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

       const { instances: rawInstances = {}, instanceNames = [], instanceKeys = [], rationale = '' } = orchResult

       // Validate instanceKeys length matches total instance count
       const totalInstances = Object.values(rawInstances).reduce((s, n) => s + n, 0)
       let resolvedInstanceKeys = instanceKeys
       if (instanceKeys.length !== totalInstances) {
         log(`Warning: instanceKeys length (${instanceKeys.length}) does not match total instances (${totalInstances}) — falling back to instanceNames`)
         resolvedInstanceKeys = instanceNames
       }

       // Remap instances by position to correct slide keys (AI may rename keys)
       const remappedInstances = {}
       const expectedKeys = repeatableSlides.map(rs => rs.key)
       const returnedKeys = Object.keys(rawInstances)
       expectedKeys.forEach((key, i) => {
         const aiKey = returnedKeys[i] ?? returnedKeys[0]
         remappedInstances[key] = rawInstances[key] ?? rawInstances[aiKey] ?? 1
       })

       console.log('[agentic/plan] instances:', JSON.stringify(rawInstances))

     // ── Per-instance slicer calls (parallel) ─────────────────────────────────
     const blocksText = fullContext.text
     const slices = {}
     const slicerPrompts = []

     if (instanceNames.length > 0) {
       const cappedRaw = fullContext.text.length > 300_000
         ? fullContext.text.slice(0, 300_000) + '\n[...raw data capped for AI slicer]'
         : fullContext.text
       log(`AI-structuring ${instanceNames.length} instance(s) sequentially (${cappedRaw.length} chars input each)...`)

       for (let i = 0; i < instanceNames.length; i++) {
         const name = instanceNames[i]
         const prompt = buildSlicerPrompt([name], cappedRaw, sliceTemplateBody)
         slicerPrompts.push({ index: i, name, prompt })
         try {
           const { response } = await callAi(prompt, { temperature: 0.1, maxTokens: 8000 })
           log(`  Slicer [${i}] "${name}": ${response.length} chars`)
           const stripped = response.replace(/^\s*\[SLIDE_INSTANCE_\d+\]\s*/i, '').trim()
           slices[i.toString()] = stripped || `[No data extracted for instance: "${name}"]`
         } catch (err) {
           console.error(`[agentic/plan] Slicer failed for instance [${i}] "${name}": ${err.message}`)
           slices[i.toString()] = `[Slicer error for instance: "${name}": ${err.message}]`
         }
       }
       log(`Slicer complete: ${Object.keys(slices).length} instance slice(s) extracted`)
     }

     // Save slice files to disk with new naming convention
     if (flowId) {
       const debugDir = path.join(RESOLVED_PROJECTS_DIR, projectName, 'flows', flowId, 'debug')
       try {
         await fsp.mkdir(debugDir, { recursive: true })

         // Helper to make filesystem-safe slug from instance name
         const toSlug = (name) => String(name)
           .toLowerCase()
           .replace(/[^a-z0-9]+/g, '-')
           .replace(/^-+|-+$/g, '')
           .slice(0, 40)

         const writeOps = [
           fsp.writeFile(path.join(debugDir, 'ai-orchestrator-prompt.txt'), orchestratorPrompt, 'utf8'),
           fsp.writeFile(path.join(debugDir, 'ai-slice-blocks.txt'), blocksText || '', 'utf8'),
           ...slicerPrompts.map(({ index, name, prompt }) => {
             const slug = toSlug(name)
             return fsp.writeFile(path.join(debugDir, `ai-slicer-prompt-${index}-${slug}.txt`), prompt, 'utf8')
           }),
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
         contextFiles: compactContext.fileCount,
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

     const remappedInstances = {}
     const expectedKeys = repeatableSlides.map(rs => rs.key)
     const returnedKeys = Object.keys(instances)
     expectedKeys.forEach((key, i) => {
       const aiKey = returnedKeys[i] ?? returnedKeys[0]
       remappedInstances[key] = instances[key] ?? instances[aiKey] ?? 1
     })
     // If no repeatable slides, use instances as-is
     if (repeatableSlides.length === 0) Object.assign(remappedInstances, instances)
    const { repSet, hasBlocks, hasShared } = buildRepSetInfo(zones, repeatableSlides)

     // ── Read slice files from disk ────────────────────────────────────────────
     // Slices are always read from disk — the browser never carries slice content.
     const resolvedSlices = {}
     if (flowId) {
       const debugDir = path.join(RESOLVED_PROJECTS_DIR, projectName, 'flows', flowId, 'debug')
       try {
         const debugFiles = await fsp.readdir(debugDir)

         // Read blocks slice
         const blocksFile = debugFiles.find(f => f === 'ai-slice-blocks.txt')
         if (blocksFile) {
           resolvedSlices['blocks'] = await fsp.readFile(path.join(debugDir, blocksFile), 'utf8')
           log(`Read blocks slice: ${resolvedSlices['blocks'].length} chars`)
         } else {
           log('Warning: ai-slice-blocks.txt not found — blocks agent will have no context')
         }

         // Read instance slices by index prefix
         const instanceFiles = debugFiles.filter(f => /^ai-slice-instance-\d+-.+\.txt$/.test(f))
         await Promise.all(instanceFiles.map(async (filename) => {
           const idxMatch = filename.match(/^ai-slice-instance-(\d+)-/)
           if (idxMatch) {
             const idx = idxMatch[1]
             resolvedSlices[idx] = await fsp.readFile(path.join(debugDir, filename), 'utf8')
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
    console.log(`[agentic/run] Agents: ${agents.map(a => a.label).join(', ')}`)
    console.log(`[agentic/run] Context slice keys: ${Object.keys(resolvedSlices).join(', ') || '(none)'}`)
    console.log(`[agentic/run] Zones: ${zones.length}, RepeatableSlides: ${repeatableSlides.length}`)

      // ── Parallel generation ───────────────────────────────────────────────────
      const agentResults = await Promise.all(agents.map(async (agent) => {
        emit(res, 'agent_update', { id: agent.id, state: 'running' })
        const t0 = Date.now()

        let agentContext = ''

        if (agent.type === 'blocks') {
          agentContext = resolvedSlices['blocks'] || ''
        } else {
          agentContext = resolvedSlices[agent.globalIndex.toString()] || ''
        }

         console.log(`[agentic/run][${agent.label}] Context slice length: ${agentContext.length} chars`)
         if (agentContext.length > 1_000_000) {
           console.warn(`[agentic/run][${agent.label}] WARNING: Context exceeds 1M chars (${(agentContext.length / 1_000_000).toFixed(1)}M) — will be capped by prompt builder`)
         }
         console.log(`[agentic/run][${agent.label}] Context preview: ${agentContext.slice(0, 200)}`)

          const prompt = agent.type === 'blocks'
            ? buildBlocksPrompt(zones, repeatableSlides, agentContext, repSet, customInput || contentPrompt)
            : buildInstancePrompt(zones, repeatableSlides, agent.slideKey, agent.instanceIndex, agent.instanceCount, agentContext, customInput || contentPrompt)

         console.log(`[agentic/run][${agent.label}] Prompt length: ${prompt.length} chars`)
         if (prompt.length > 2_000_000) {
           console.warn(`[agentic/run][${agent.label}] WARNING: Prompt exceeds 2M chars (${(prompt.length / 1_000_000).toFixed(1)}M) — may fail API limits`)
         }
         console.log(`[agentic/run][${agent.label}] Prompt preview (first 500):\n${prompt.slice(0, 500)}`)

       log(`[${agent.label}] Sending prompt (${prompt.length} chars)...`)
       let parsed
       try {
         const agentAi = await callAiJson(prompt, { maxTokens: 3000, temperature: 0.4 }, (msg) => log(`[${agent.label}] ${msg}`))
         const repairInfo = agentAi.wasRepaired ? ` [repaired in ${agentAi.repairAttempts} attempt(s), strategy: ${agentAi.strategy}]` : ` [strategy: ${agentAi.strategy}]`
         log(`[${agent.label}] Response received (${agentAi.raw.length} chars)${repairInfo}`)
         console.log(`[agentic/run][${agent.label}] Raw response (${agentAi.raw.length} chars):\n${agentAi.raw}`)
         console.log(`[agentic/run][${agent.label}] Parse strategy: ${agentAi.strategy}, repairs: ${agentAi.repairAttempts}`)
         parsed = agentAi.parsed
       } catch (parseErr) {
         emit(res, 'agent_update', { id: agent.id, state: 'error' })
         const isApiError = parseErr.message.startsWith('Cortex API error')
         if (isApiError) {
           log(`[${agent.label}] Cortex API error — ${parseErr.message.split('\n')[0]}`)
           log(`[${agent.label}] This is an upstream API failure. Check Cortex service health.`)
           console.error(`[agentic/run][${agent.label}] Cortex API error:\n${parseErr.message}`)
           throw new Error(`Agent "${agent.label}" failed: ${parseErr.message.split('\n')[0]}`)
         }
         log(`[${agent.label}] PARSE ERROR (exhausted all repair strategies)`)
         log(`[${agent.label}] Error details: ${parseErr.message.split('\n')[0]}`)
         console.error(`[agentic/run][${agent.label}] JSON parse FAILED after all repair attempts:\n${parseErr.message}`)
         throw new Error(`Agent "${agent.label}" returned invalid JSON.\n${parseErr.message}`)
       }

       log(`[${agent.label}] Parsed OK — ${Object.keys(parsed).length} top-level keys`)
       console.log(`[agentic/run][${agent.label}] Parsed top-level keys: ${Object.keys(parsed).join(', ')}`)
       emit(res, 'agent_update', { id: agent.id, state: 'done' })
       log(`${agent.label} done (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

      return { agent, parsed, prompt }
    }))

    // Save agent prompts for debugging
    if (flowId) {
      const debugDir = path.join(RESOLVED_PROJECTS_DIR, projectName, 'flows', flowId, 'debug')
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
    log(`FATAL ERROR: ${err.stack || err.message}`)
    error(err.message)
  }
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
