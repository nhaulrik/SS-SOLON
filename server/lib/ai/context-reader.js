/**
 * server/lib/context-reader.js
 *
 * Reads all files from a project's "AI Context" folder and returns their
 * text content for use in AI prompts. Supports: txt, md, html, pdf, docx, xlsx/xls, csv.
 *
 * Excel/CSV files are summarised rather than dumped as raw CSV — this cuts
 * noise (empty cells, repeated commas) while preserving all meaningful data:
 * headers, unique values per column, row count, and a data sample.
 *
 * Summary files: each context file may have a paired AI-generated summary saved
 * alongside it as "{filename}.summary.md". readContextFiles() can be told to
 * prefer summaries over the originals.
 */

import fs from 'fs/promises'
import path from 'path'
import { MAX_CONTEXT_CHARS, MAX_TEXT_FILE_CHARS, EXCEL_MAX_CELL_LENGTH } from '../../config.js'

const SUPPORTED_EXT = new Set(['.txt', '.md', '.html', '.pdf', '.docx', '.xlsx', '.xls', '.csv'])

// Suffix used for AI-generated summary files
export const SUMMARY_SUFFIX = '.summary.md'


// ── Excel / CSV summariser ─────────────────────────────────────────────────────

/**
 * Convert a worksheet to a structured text summary instead of raw CSV.
 * Preserves all distinct values; trims noise from blank rows/cells.
 *
 * @param {object} sheet       The worksheet object.
 * @param {object} XLSX        The XLSX library instance.
 * @param {string} sheetName   Name of the sheet.
 * @param {boolean} [fullMode=false] When true, output all rows with full cell content (no row cap, no cell truncation).
 */
function summariseSheet(sheet, XLSX, sheetName, fullMode = false) {
  // Parse to array-of-arrays, skip completely blank rows
  const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const dataRows = rows.filter(row => row.some(cell => String(cell).trim() !== ''))

  if (dataRows.length === 0) return `[Sheet: ${sheetName}]\n(empty)\n`

  const allHeaders = dataRows[0].map(h => String(h).trim())
  const allBody    = dataRows.slice(1)

  // Keep only columns that have a non-empty header AND at least one data value
  const activeColIdxs = [...allHeaders.keys()]
    .filter(i => {
      if (!allHeaders[i]) return false
      return allBody.some(row => String(row[i] ?? '').trim() !== '')
    })

  const headers = activeColIdxs.map(i => allHeaders[i])
  const body    = allBody.map(row => activeColIdxs.map(i => String(row[i] ?? '').trim()))

  // Full mode: output all rows as pipe-delimited lines with no truncation
  if (fullMode) {
    const lines = [`[Sheet: ${sheetName}]`]
    lines.push(`Rows: ${body.length}   Columns: ${headers.length}`)
    lines.push(`Headers: ${headers.join(' | ')}`)
    lines.push('')
    body.forEach(row => lines.push(row.join(' | ')))
    return lines.join('\n')
  }

  // Default mode: summarise with unique values and sample rows
  const lines = [`[Sheet: ${sheetName}]`]
  lines.push(`Rows: ${body.length}   Columns: ${headers.length} (of ${allHeaders.length} total, ${allHeaders.length - headers.length} empty omitted)`)
  lines.push(`Headers: ${headers.join(' | ')}`)
  lines.push('')

  // Unique values per column (up to 60 distinct; cap each value to 500 chars)
  headers.forEach((header, colIdx) => {
    const values = [...new Set(body.map(row => row[colIdx]).filter(Boolean))]
    if (values.length === 0) return
    const capped  = values.map(v => v.length > EXCEL_MAX_CELL_LENGTH ? v.slice(0, EXCEL_MAX_CELL_LENGTH) + '…' : v)
    const preview = capped.length > 60
      ? capped.slice(0, 60).join(' | ') + ` … (+${values.length - 60} more)`
      : capped.join(' | ')
    lines.push(`${header}: ${preview}`)
  })

  // Sample rows (first 50); cap each cell to 500 chars to preserve description text
  lines.push('')
  lines.push('Sample rows (up to 50):')
  body.slice(0, 50).forEach(row =>
    lines.push(row.map(v => v.length > EXCEL_MAX_CELL_LENGTH ? v.slice(0, EXCEL_MAX_CELL_LENGTH) + '…' : v).join(' | '))
  )

  return lines.join('\n')
}

// ── File readers ───────────────────────────────────────────────────────────────

async function readPdf(filePath) {
  const { default: pdfParse } = await import('pdf-parse')
  const buffer = await fs.readFile(filePath)
  const result = await pdfParse(buffer)
  return result.text ?? ''
}

async function readDocx(filePath) {
  const { default: mammoth } = await import('mammoth')
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value ?? ''
}

async function readXlsx(filePath, compact = false) {
  const { default: XLSX } = await import('xlsx')
  const workbook = XLSX.readFile(filePath)
  return workbook.SheetNames
    .map(name => summariseSheet(workbook.Sheets[name], XLSX, name, !compact))
    .join('\n\n')
}

async function readCsv(filePath, compact = false) {
   const { default: XLSX } = await import('xlsx')
   const workbook = XLSX.readFile(filePath)
   return summariseSheet(workbook.Sheets[workbook.SheetNames[0]], XLSX, path.basename(filePath), !compact)
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, 'utf-8')
}

async function extractText(filePath, compact = false) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.pdf':  return readPdf(filePath)
    case '.docx': return readDocx(filePath)
    case '.xlsx':
    case '.xls':  return readXlsx(filePath, compact)
    case '.csv':  return readCsv(filePath, compact)
    default:      return readTextFile(filePath)
  }
}

// ── Single-file reader (for summarisation) ────────────────────────────────────

/**
 * Extract the text content of one context file, with a generous per-file cap.
 * Used by the summary-generation pipeline so large files are not truncated.
 *
 * @param {string} contextDir  Absolute path to the "AI Context" folder.
 * @param {string} filename    Filename (not full path) of the context file.
 * @returns {Promise<{ text: string, truncated: boolean }>}
 */
export async function readSingleContextFile(contextDir, filename) {
  const filePath = path.join(contextDir, filename)
  const raw = await extractText(filePath)
  const text = raw.trim()
  if (text.length > MAX_TEXT_FILE_CHARS) {
    return { text: text.slice(0, MAX_TEXT_FILE_CHARS) + '\n[...truncated at 400k chars]', truncated: true }
  }
  return { text, truncated: false }
}

// ── Summary file helpers ───────────────────────────────────────────────────────

/**
 * Returns the path to the summary file for a given context file.
 */
export function summaryFilePath(contextDir, filename) {
  return path.join(contextDir, filename + SUMMARY_SUFFIX)
}

/**
 * Save an AI-generated summary for a context file.
 */
export async function saveSummaryFile(contextDir, filename, summaryText) {
  await fs.writeFile(summaryFilePath(contextDir, filename), summaryText, 'utf-8')
}

/**
 * Check which context files in a project already have a saved summary.
 * Returns a Map<filename, boolean>.
 */
export async function getSummaryStatus(projectDir) {
  const contextDir = path.join(projectDir, 'AI Context')
  let filenames
  try {
    filenames = await fs.readdir(contextDir)
  } catch {
    return new Map()
  }

  const contextFiles = filenames.filter(f =>
    SUPPORTED_EXT.has(path.extname(f).toLowerCase()) &&
    !f.startsWith('~$') &&
    !f.startsWith('.') &&
    !f.endsWith(SUMMARY_SUFFIX)
  )

  const status = new Map()
  await Promise.all(contextFiles.map(async (filename) => {
    try {
      await fs.access(summaryFilePath(contextDir, filename))
      status.set(filename, true)
    } catch {
      status.set(filename, false)
    }
  }))
  return status
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Read all supported files from <projectDir>/AI Context/.
 *
 * @param {string} projectDir      Absolute path to the project folder.
 * @param {object} [opts]
 * @param {boolean} [opts.useSummaries=false]
 *   When true, use the saved .summary.md for each file if it exists,
 *   falling back to original extraction only if no summary is found.
 * @returns {{ fileCount, files, text, totalChars, summaryUsed }}
 *   summaryUsed: Map<filename, 'summary'|'original'>
 */
export async function readContextFiles(projectDir, { useSummaries = false, selectedFiles = [] } = {}) {
  const contextDir = path.join(projectDir, 'AI Context')

  let filenames
  try {
    filenames = await fs.readdir(contextDir)
  } catch {
    return { fileCount: 0, files: [], text: '', totalChars: 0, summaryUsed: new Map() }
  }

  // Exclude Office temp/lock files (~$), hidden files, and summary files
  // (summaries are only read explicitly via useSummaries logic below)
  let supported = filenames.filter(f =>
    SUPPORTED_EXT.has(path.extname(f).toLowerCase()) &&
    !f.startsWith('~$') &&
    !f.startsWith('.') &&
    !f.endsWith(SUMMARY_SUFFIX)
  )

  // Apply checkbox selection filter — if the caller provided a non-empty list,
  // restrict to only those filenames.
  if (selectedFiles.length > 0) {
    const selSet = new Set(selectedFiles)
    supported = supported.filter(f => selSet.has(f))
  }

  if (supported.length === 0) {
    return { fileCount: 0, files: [], text: '', totalChars: 0, summaryUsed: new Map() }
  }

  const summaryUsed = new Map()

  // Read files concurrently
  const fileContents = await Promise.all(
    supported.map(async (filename) => {
      try {
        let text
        let source = 'original'

        if (useSummaries) {
          const summaryPath = summaryFilePath(contextDir, filename)
          try {
            text   = (await fs.readFile(summaryPath, 'utf-8')).trim()
            source = 'summary'
          } catch {
            // No summary file — fall back to original extraction
          }
        }

        if (!text) {
          const ext     = path.extname(filename).toLowerCase()
          const raw     = await extractText(path.join(contextDir, filename), false)
          const hasTabularExt = ext === '.xlsx' || ext === '.xls' || ext === '.csv'
          const limit   = hasTabularExt ? MAX_CONTEXT_CHARS : MAX_TEXT_FILE_CHARS
          const clipped = raw.trim()
          text = clipped.length > limit
            ? clipped.slice(0, limit) + '\n[...truncated]'
            : clipped
        }

        summaryUsed.set(filename, source)
        return { filename, text, originalLength: text.length, ok: true, source }
      } catch (err) {
        summaryUsed.set(filename, 'error')
        return { filename, text: `[Error reading file: ${err.message}]`, originalLength: 0, ok: false, source: 'error' }
      }
    })
  )

  // Combine, respecting hard total cap
  const parts = []
  let totalChars = 0

  for (const { filename, text, source } of fileContents) {
    const label   = source === 'summary' ? ' [summary]' : ''
    const header  = `=== ${filename}${label} ===`
    const section = `${header}\n${text}`

    if (totalChars + section.length > MAX_CONTEXT_CHARS) {
      const remaining = MAX_CONTEXT_CHARS - totalChars
      if (remaining > 200) {
        parts.push(section.slice(0, remaining) + '\n[...total context limit reached]')
        totalChars += remaining
      }
      break
    }
    parts.push(section)
    totalChars += section.length + 2
  }

  return {
    fileCount:   fileContents.length,
    files:       fileContents.map(f => f.filename),
    text:        parts.join('\n\n'),
    totalChars,
    summaryUsed,
  }
}

/**
 * Same as readContextFiles but uses compact (summarised) mode for tabular files.
 * Produces a much smaller output suitable for the orchestrator's schema-identification step.
 * Text files are read in full; Excel/CSV files are summarised (unique values + 50 sample rows).
 */
export async function readContextFilesCompact(projectDir, { selectedFiles = [] } = {}) {
  const contextDir = path.join(projectDir, 'AI Context')

  let filenames
  try {
    filenames = await fs.readdir(contextDir)
  } catch {
    return { fileCount: 0, files: [], text: '', totalChars: 0 }
  }

  let supported = filenames.filter(f =>
    SUPPORTED_EXT.has(path.extname(f).toLowerCase()) &&
    !f.startsWith('~$') &&
    !f.startsWith('.') &&
    !f.endsWith(SUMMARY_SUFFIX)
  )

  // Apply checkbox selection filter — if the caller provided a non-empty list,
  // restrict to only those filenames.
  if (selectedFiles.length > 0) {
    const selSet = new Set(selectedFiles)
    supported = supported.filter(f => selSet.has(f))
  }

  if (supported.length === 0) return { fileCount: 0, files: [], text: '', totalChars: 0 }

  // Per-file cap: the orchestrator only needs structure/schema, not exhaustive data.
  // 20k chars per file ≈ headers + top unique values + ~20 sample rows for a rich xlsx.
  const MAX_COMPACT_CHARS_PER_FILE = 20_000
  // Total cap: keeps the orchestrator prompt safely within Cortex's input token limit
  // regardless of how many files are selected. 60k chars ≈ 15k tokens of context.
  const MAX_COMPACT_CHARS_TOTAL = 60_000

  const fileContents = await Promise.all(
    supported.map(async (filename) => {
      try {
        const raw     = await extractText(path.join(contextDir, filename), true)
        const clipped = raw.trim()
        const text    = clipped.length > MAX_COMPACT_CHARS_PER_FILE
          ? clipped.slice(0, MAX_COMPACT_CHARS_PER_FILE) + '\n[...truncated for orchestrator]'
          : clipped
        return { filename, text, ok: true }
      } catch (err) {
        return { filename, text: `[Error reading file: ${err.message}]`, ok: false }
      }
    })
  )

  const parts = []
  let totalChars = 0
  for (const { filename, text } of fileContents) {
    const section = `=== ${filename} ===\n${text}`
    if (totalChars + section.length > MAX_COMPACT_CHARS_TOTAL) {
      const remaining = MAX_COMPACT_CHARS_TOTAL - totalChars
      if (remaining > 200) {
        parts.push(section.slice(0, remaining) + '\n[...total compact context limit reached]')
        totalChars += remaining
      }
      break
    }
    parts.push(section)
    totalChars += section.length + 2
  }

  return {
    fileCount:  fileContents.length,
    files:      fileContents.map(f => f.filename),
    text:       parts.join('\n\n'),
    totalChars,
  }
}

/**
 * Extract rows from all tabular files in the AI Context folder, grouped by a
 * specific column value. Used after the orchestrator identifies the grouping
 * dimension so that contextSlices are built deterministically from the real data.
 *
 * @param {string}   contextDir   Absolute path to the AI Context folder
 * @param {string}   column       Column name to group by (exact match)
 * @param {string[]} groupValues  Ordered list of group values (one per slide instance)
 * @param {string[]} allFilenames All supported filenames in contextDir
 * @returns {{ slices: Object, blocksText: string, matched: boolean }}
 *   slices:     { "0": "rows...", "1": "rows...", ... }
 *   blocksText: rows from files that don't contain the grouping column
 *   matched:    true if the column was found in at least one file
 */
export async function extractGroupedSlices(contextDir, column, groupValues, allFilenames) {
  const { default: XLSX } = await import('xlsx')

  const TABULAR_EXT = new Set(['.xlsx', '.xls', '.csv'])
  const tabularFiles = allFilenames.filter(f => TABULAR_EXT.has(path.extname(f).toLowerCase()))

  // Build per-group row buckets, keyed by sheet
  const buckets = groupValues.map(() => ({})) // [{ "filename / sheetName": ["row...", ...] }]
  const blocksParts = []
  let matched = false

  for (const filename of tabularFiles) {
    const filePath = path.join(contextDir, filename)
    let workbook
    try {
      workbook = XLSX.readFile(filePath)
    } catch {
      continue
    }

    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
      if (rows.length === 0) continue

      const headers = Object.keys(rows[0])
      const colKey = headers.find(h => h.trim().toLowerCase() === column.trim().toLowerCase())

      if (!colKey) {
        // This sheet doesn't have the grouping column — add all rows to blocks
        const lines = [`=== ${filename} / ${sheetName} ===`]
        lines.push(headers.join(' | '))
        rows.forEach(row => lines.push(headers.map(h => String(row[h] ?? '')).join(' | ')))
        blocksParts.push(lines.join('\n'))
        continue
      }

      matched = true
      const sliceKey = `${filename} / ${sheetName}`

      rows.forEach(row => {
        const rowVal = String(row[colKey] ?? '').trim()
        const idx = groupValues.findIndex(
          gv => gv.trim().toLowerCase() === rowVal.toLowerCase()
        )
        if (idx >= 0) {
          buckets[idx][sliceKey] ??= []
          const line = headers.map(h => `${h}: ${String(row[h] ?? '')}`).join(' | ')
          buckets[idx][sliceKey].push(line)
        }
      })
    }
  }

  const slices = {}
  if (matched) {
    groupValues.forEach((gv, i) => {
      const sheetMap = buckets[i]
      const parts = Object.entries(sheetMap).map(([sheetLabel, rows]) =>
        `[Sheet: ${sheetLabel}] (${rows.length} rows)\n${rows.join('\n')}`
      )
      slices[i.toString()] = parts.length > 0
        ? parts.join('\n\n')
        : `[No rows found for group: ${gv}]`
    })
  }

  return {
    slices,
    blocksText: blocksParts.join('\n\n'),
    matched,
  }
}

/**
 * Build instance-specific context slices for multiple instances by searching for
 * instance keys in tabular data. Each instance gets a slice with:
 * - Layer 1: Rows from instance-specific sheets (containing the instance key)
 * - Layer 2: All rows from reference sheets (no instance keys found)
 * - Layer 3: Document layer (non-tabular files)
 *
 * @param {string}   contextDir      Absolute path to the AI Context folder
 * @param {string[]} instanceKeys    Search terms for each instance (e.g. ["acme", "globex"])
 * @param {string[]} allFilenames    All supported filenames in contextDir
 * @param {object}   [opts]
 * @param {boolean}  [opts.useSummaries=false]  If true, prefer .summary.md files for document layer
 * @returns {Promise<{ slices: Object, blocksText: string }>}
 *   slices:     { "0": "...", "1": "...", ... } — one per instance, zero-indexed string keys
 *   blocksText: All tabular files in full + all document files (capped at 400k chars)
 */
export async function buildInstanceSlices(
  contextDir,
  instanceKeys,
  allFilenames,
  opts = {}
) {
  const { useSummaries = false } = opts
  const { default: XLSX } = await import('xlsx')

  const TABULAR_EXT = new Set(['.xlsx', '.xls', '.csv'])
  const NON_TABULAR_EXT = new Set(['.txt', '.md', '.html', '.pdf', '.docx'])

  // Step 1: Separate tabular vs non-tabular files
  const tabularFiles = allFilenames.filter(f => TABULAR_EXT.has(path.extname(f).toLowerCase()))
  const nonTabularFiles = allFilenames.filter(f => NON_TABULAR_EXT.has(path.extname(f).toLowerCase()))

  // Step 2: Load all tabular files once and classify sheets
  const sheetData = [] // { filename, sheetName, rows, isInstanceSpecific }
  const referenceSheets = [] // Same structure, but isInstanceSpecific = false
  const blocksParts = [] // For blocksText

  for (const filename of tabularFiles) {
    const filePath = path.join(contextDir, filename)
    let workbook
    try {
      workbook = XLSX.readFile(filePath)
    } catch {
      continue
    }

    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' })
      const dataRows = rows.filter(row => row.some(cell => String(cell).trim() !== ''))

      if (dataRows.length === 0) continue

      // Step 3: Classify sheet as instance-specific or reference
      const isInstanceSpecific = dataRows.some(row =>
        row.some(cell =>
          instanceKeys.some(key =>
            String(cell).toLowerCase().includes(key.toLowerCase())
          )
        )
      )

      const sheetInfo = {
        filename,
        sheetName,
        rows: dataRows,
        isInstanceSpecific,
      }

      if (isInstanceSpecific) {
        sheetData.push(sheetInfo)
      } else {
        referenceSheets.push(sheetInfo)
      }

      // For blocksText: include all rows from this sheet
      const lines = [`[File: ${filename} / Sheet: ${sheetName}]`]
      dataRows.forEach(row => lines.push(row.join(' | ')))
      blocksParts.push(lines.join('\n'))
    }
  }

  // Step 4: Build Layer 1 (instance-specific rows) for each instance
  const instanceLayer1 = instanceKeys.map(() => [])

  for (const { filename, sheetName, rows } of sheetData) {
    const headerRow = rows[0]
    const dataRows = rows.slice(1)

    for (let i = 0; i < instanceKeys.length; i++) {
      const instanceKey = instanceKeys[i]
      const matchingRows = dataRows.filter(row =>
        row.some(cell =>
          String(cell).toLowerCase().includes(instanceKey.toLowerCase())
        )
      )

      if (matchingRows.length > 0) {
        const lines = [`[File: ${filename} / Sheet: ${sheetName}]`]
        lines.push(headerRow.join(' | '))
        matchingRows.forEach(row => lines.push(row.join(' | ')))
        instanceLayer1[i].push(lines.join('\n'))
      }
    }
  }

  // Step 5: Build Layer 2 (reference sheets) — identical for all instances
  const layer2Parts = []
  for (const { filename, sheetName, rows } of referenceSheets) {
    const lines = [`[Reference: ${filename} / Sheet: ${sheetName}]`]
    rows.forEach(row => lines.push(row.join(' | ')))
    layer2Parts.push(lines.join('\n'))
  }
  const layer2Text = layer2Parts.join('\n\n')

  // Step 6: Build Layer 3 (document layer) — identical for all instances
  const layer3Parts = []
  for (const filename of nonTabularFiles) {
    const filePath = path.join(contextDir, filename)
    let text = ''

    if (useSummaries) {
      const summaryPath = summaryFilePath(contextDir, filename)
      try {
        text = (await fs.readFile(summaryPath, 'utf-8')).trim()
      } catch {
        // Summary not found, fall back to extractText
      }
    }

    if (!text) {
      try {
        text = await extractText(filePath)
      } catch {
        text = `[Error reading file: ${filename}]`
      }
    }

    const trimmed = text.trim()
    const capped = trimmed.length > 400_000
      ? trimmed.slice(0, 400_000) + '\n[...document truncated at 400k chars]'
      : trimmed

    layer3Parts.push(`=== ${filename} ===\n${capped}`)
  }
  const layer3Text = layer3Parts.join('\n\n')

  // Step 7: Assemble each instance slice with 800k char budget
  const slices = {}
  const SLICE_BUDGET = 800_000

  for (let i = 0; i < instanceKeys.length; i++) {
    const parts = []
    let charCount = 0

    // Check if Layer 1 is empty for this instance
    const layer1Text = instanceLayer1[i].join('\n\n')
    if (layer1Text === '') {
      const noRowsNotice = `[No instance-specific tabular rows found for: "${instanceKeys[i]}"]\n[Reference data and document context are provided below.]\n\n`
      parts.push(noRowsNotice)
      charCount += noRowsNotice.length
    }

    // Add Layer 1 (instance-specific rows)
    if (layer1Text) {
      if (charCount + layer1Text.length > SLICE_BUDGET) {
        parts.push('[...slice budget reached — remaining content omitted]')
        slices[i.toString()] = parts.join('')
        continue
      }
      parts.push(layer1Text)
      charCount += layer1Text.length + 2
    }

    // Add Layer 2 (reference sheets)
    if (layer2Text) {
      if (charCount + layer2Text.length > SLICE_BUDGET) {
        parts.push('[...slice budget reached — remaining content omitted]')
        slices[i.toString()] = parts.join('\n\n')
        continue
      }
      parts.push(layer2Text)
      charCount += layer2Text.length + 2
    }

    // Add Layer 3 (document layer)
    if (layer3Text) {
      if (charCount + layer3Text.length > SLICE_BUDGET) {
        parts.push('[...slice budget reached — remaining content omitted]')
        slices[i.toString()] = parts.join('\n\n')
        continue
      }
      parts.push(layer3Text)
      charCount += layer3Text.length + 2
    }

    slices[i.toString()] = parts.join('\n\n')
  }

  // Step 8: Build blocksText (all tabular files in full + all document files)
  const blocksParts2 = []
  blocksParts2.push(blocksParts.join('\n\n'))
  blocksParts2.push(layer3Text)

  let blocksText = blocksParts2.join('\n\n')
  if (blocksText.length > 400_000) {
    blocksText = blocksText.slice(0, 400_000) + '\n[...blocks context limit reached — remaining content omitted]'
  }

  // Step 9: Return
  return { slices, blocksText }
}
