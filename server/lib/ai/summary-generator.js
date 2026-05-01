/**
 * server/lib/summary-generator.js
 *
 * Generates AI summaries for context files and saves them as .summary.md files.
 */

import path from 'path'
import { callAi }                                              from './ai-client.js'
import { readContextFiles, readSingleContextFile, saveSummaryFile } from './context-reader.js'
import { buildSummaryPrompt }                                  from './agentic-prompts.js'

/**
 * @param {string}        projectDir  Absolute path to the project folder.
 * @param {Function}      logFn       SSE log emitter.
 * @param {string[]|null} onlyFiles   If provided, only summarise these filenames.
 * @param {string}        summaryPrompt
 * @param {object[]}      zones
 * @returns {Promise<number>} Number of summaries written.
 */
export async function generateSummaries(projectDir, logFn, onlyFiles = null, summaryPrompt = '', zones = []) {
  const contextDir = path.join(projectDir, 'AI Context')

  const raw = await readContextFiles(projectDir, { useSummaries: false })
  if (raw.fileCount === 0) {
    logFn('No context files to summarise')
    return 0
  }

  const targets = onlyFiles ? raw.files.filter(f => onlyFiles.includes(f)) : raw.files
  if (targets.length === 0) return 0

  logFn(`Summarising ${targets.length} file${targets.length !== 1 ? 's' : ''}...`)

  let written = 0
  for (const filename of targets) {
    logFn(`  Summarising ${filename}...`)
    try {
      const { text: fileText, truncated } = await readSingleContextFile(contextDir, filename)

      if (!fileText) {
        logFn(`  Skipping ${filename} — no content could be extracted`)
        continue
      }
      if (truncated) logFn(`  Note: ${filename} exceeded 400k chars and was trimmed`)

       const prompt = buildSummaryPrompt(filename, fileText, summaryPrompt, zones)
       logFn(`  Sending summary prompt (${prompt.length} chars) to AI...`)

       const result      = await callAi(prompt, { maxTokens: 1200, temperature: 0.2 })
       const summaryText = result.response.trim()
       logFn(`  Summary received (${summaryText.length} chars, ${summaryText.split(/\s+/).length} words, finish_reason: ${result.finishReason})`)
       
       if (result.finishReason === 'length') {
         logFn(`  ⚠️  WARNING: Summary was truncated due to max_tokens limit`)
       } else if (result.finishReason !== 'stop') {
         logFn(`  ⚠️  WARNING: Unexpected finish_reason: ${result.finishReason}`)
       }

      await saveSummaryFile(contextDir, filename, summaryText)
      written++
      logFn(`  ✓ ${filename}.summary.md saved`)
    } catch (err) {
      logFn(`  ✕ Failed to summarise ${filename}: ${err.message}`)
    }
  }

  return written
}
