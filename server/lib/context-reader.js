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

const SUPPORTED_EXT = new Set(['.txt', '.md', '.html', '.pdf', '.docx', '.xlsx', '.xls', '.csv'])

// Suffix used for AI-generated summary files
export const SUMMARY_SUFFIX = '.summary.md'

// Hard cap on total chars sent to the orchestrator.
// 400k chars ≈ 100k tokens — allows full xlsx/xls data without truncation.
const MAX_TOTAL_CHARS = 400_000

// For non-tabular files (txt, md, html, pdf, docx), cap per file to avoid
// one large document crowding out others.
const MAX_TEXT_FILE_CHARS = 400_000

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
  const activeColIdxs = allHeaders
    .map((h, i) => i)
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
    const capped  = values.map(v => v.length > 500 ? v.slice(0, 500) + '…' : v)
    const preview = capped.length > 60
      ? capped.slice(0, 60).join(' | ') + ` … (+${values.length - 60} more)`
      : capped.join(' | ')
    lines.push(`${header}: ${preview}`)
  })

  // Sample rows (first 50); cap each cell to 500 chars to preserve description text
  lines.push('')
  lines.push('Sample rows (up to 50):')
  body.slice(0, 50).forEach(row =>
    lines.push(row.map(v => v.length > 500 ? v.slice(0, 500) + '…' : v).join(' | '))
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

// When generating AI summaries we want each file read in full, not competing
// against others for the combined 100k cap. 400k chars ≈ 100k tokens — large
// enough for any realistic context file while staying within model limits.
const MAX_SINGLE_FILE_CHARS = 400_000

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
  if (text.length > MAX_SINGLE_FILE_CHARS) {
    return { text: text.slice(0, MAX_SINGLE_FILE_CHARS) + '\n[...truncated at 400k chars]', truncated: true }
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
export async function readContextFiles(projectDir, { useSummaries = false } = {}) {
  const contextDir = path.join(projectDir, 'AI Context')

  let filenames
  try {
    filenames = await fs.readdir(contextDir)
  } catch {
    return { fileCount: 0, files: [], text: '', totalChars: 0, summaryUsed: new Map() }
  }

  // Exclude Office temp/lock files (~$), hidden files, and summary files
  // (summaries are only read explicitly via useSummaries logic below)
  const supported = filenames.filter(f =>
    SUPPORTED_EXT.has(path.extname(f).toLowerCase()) &&
    !f.startsWith('~$') &&
    !f.startsWith('.') &&
    !f.endsWith(SUMMARY_SUFFIX)
  )
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
          const isTabular = ext === '.xlsx' || ext === '.xls' || ext === '.csv'
          const limit   = isTabular ? MAX_TOTAL_CHARS : MAX_TEXT_FILE_CHARS
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

    if (totalChars + section.length > MAX_TOTAL_CHARS) {
      const remaining = MAX_TOTAL_CHARS - totalChars
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
export async function readContextFilesCompact(projectDir) {
  const contextDir = path.join(projectDir, 'AI Context')

  let filenames
  try {
    filenames = await fs.readdir(contextDir)
  } catch {
    return { fileCount: 0, files: [], text: '', totalChars: 0 }
  }

  const supported = filenames.filter(f =>
    SUPPORTED_EXT.has(path.extname(f).toLowerCase()) &&
    !f.startsWith('~$') &&
    !f.startsWith('.') &&
    !f.endsWith(SUMMARY_SUFFIX)
  )
  if (supported.length === 0) return { fileCount: 0, files: [], text: '', totalChars: 0 }

  const MAX_COMPACT_CHARS = 40_000

  const fileContents = await Promise.all(
    supported.map(async (filename) => {
      try {
        const raw     = await extractText(path.join(contextDir, filename), true) // compact=true
        const clipped = raw.trim()
        const text    = clipped.length > MAX_COMPACT_CHARS
          ? clipped.slice(0, MAX_COMPACT_CHARS) + '\n[...truncated]'
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

  // Build per-group row buckets
  const buckets = groupValues.map(() => [])
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
      // Case-insensitive column match
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
      // Assign each row to the matching group bucket
      rows.forEach(row => {
        const rowVal = String(row[colKey] ?? '').trim()
        const idx = groupValues.findIndex(
          gv => gv.trim().toLowerCase() === rowVal.toLowerCase()
        )
        if (idx >= 0) {
          // Format as header: value pairs for readability
          const line = headers.map(h => `${h}: ${String(row[h] ?? '')}`).join(' | ')
          buckets[idx].push(line)
        }
      })
    }
  }

  const slices = {}
  if (matched) {
    // Include the header row description at the top of each slice
    groupValues.forEach((gv, i) => {
      slices[i.toString()] = buckets[i].length > 0
        ? buckets[i].join('\n')
        : `[No rows found for group: ${gv}]`
    })
  }

  return {
    slices,
    blocksText: blocksParts.join('\n\n'),
    matched,
  }
}
