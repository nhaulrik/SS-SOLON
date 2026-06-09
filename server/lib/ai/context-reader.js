/**
 * server/lib/context-reader.js
 *
 * Reads all files from a project's "AI Context" folder and returns their
 * text content for use in AI prompts. Supports: txt, md, html, pdf, docx, xlsx/xls, csv.
 *
 * Excel/CSV files are summarised rather than dumped as raw CSV — this cuts
 * noise (empty cells, repeated commas) while preserving all meaningful data:
 * headers, unique values per column, row count, and a data sample.
 */

import fs from 'fs/promises'
import path from 'path'
import { MAX_CONTEXT_CHARS, MAX_TEXT_FILE_CHARS, EXCEL_MAX_CELL_LENGTH } from '../../config.js'

const SUPPORTED_EXT = new Set(['.txt', '.md', '.html', '.pdf', '.docx', '.xlsx', '.xls', '.csv'])

const SUMMARY_SUFFIX = '.summary.md'


// ── Excel / CSV summariser ─────────────────────────────────────────────────────

function cellToString(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(r => r.text ?? '').join('')
    if ('result' in v) return cellToString(v.result)
    if (v.error) return ''
  }
  return String(v)
}

async function loadWorkbook(filePath) {
  const { default: ExcelJS } = await import('exceljs')
  const ext = path.extname(filePath).toLowerCase()
  const wb = new ExcelJS.Workbook()
  if (ext === '.csv') {
    await wb.csv.readFile(filePath)
  } else {
    await wb.xlsx.readFile(filePath)
  }
  return {
    sheetNames: wb.worksheets.map(ws => ws.name),
    toArray(sheetName) {
      const ws = wb.getWorksheet(sheetName) ?? wb.worksheets[0]
      if (!ws) return []
      const rows = []
      ws.eachRow({ includeEmpty: true }, row => {
        rows.push(row.values.slice(1).map(cellToString))
      })
      return rows
    },
    toObjects(sheetName) {
      const ws = wb.getWorksheet(sheetName) ?? wb.worksheets[0]
      if (!ws) return []
      let headers = null
      const rows = []
      ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
        const vals = row.values.slice(1).map(cellToString)
        if (rowNum === 1) {
          headers = vals
        } else if (headers) {
          const obj = {}
          headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
          rows.push(obj)
        }
      })
      return rows
    },
  }
}

/**
 * Convert pre-parsed rows (array of arrays) to a structured text summary.
 * Preserves all distinct values; trims noise from blank rows/cells.
 *
 * @param {string[][]} rows    Array of arrays from toArray().
 * @param {string} sheetName   Name of the sheet.
 * @param {boolean} [fullMode=false] When true, output all rows with full cell content (no row cap, no cell truncation).
 */
function summariseSheet(rows, sheetName, fullMode = false, filters = []) {
   // Skip completely blank rows
   const dataRows = rows.filter(row => row.some(cell => String(cell).trim() !== ''))

   if (dataRows.length === 0) return `[Sheet: ${sheetName}]\n(empty)\n`

   const allHeaders = dataRows[0].map(h => String(h).trim())
   let allBody      = dataRows.slice(1)

   // Apply all filters with AND logic
   if (filters && filters.length > 0) {
     allBody = allBody.filter(row => {
       // All filters must match (AND logic)
       return filters.every(filter => {
         const filterIdx = allHeaders.findIndex(h => h.toLowerCase() === filter.column.toLowerCase())
         if (filterIdx < 0) return true // Column not found, skip this filter
         return filter.values.has(String(row[filterIdx] ?? '').trim().toLowerCase())
       })
     })
   }

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

async function readXlsx(filePath, compact = false, filters = []) {
  const wb = await loadWorkbook(filePath)
  return wb.sheetNames
    .map(name => summariseSheet(wb.toArray(name), name, !compact, filters))
    .join('\n\n')
}

async function readCsv(filePath, compact = false, filters = []) {
  const wb = await loadWorkbook(filePath)
  return summariseSheet(wb.toArray(wb.sheetNames[0]), path.basename(filePath), !compact, filters)
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, 'utf-8')
}

async function extractText(filePath, compact = false, rowFilter = null) {
   const ext = path.extname(filePath).toLowerCase()
   // Support both single filter and array of filters
   const filters = Array.isArray(rowFilter) ? rowFilter : (rowFilter ? [rowFilter] : [])
   switch (ext) {
     case '.pdf':  return readPdf(filePath)
     case '.docx': return readDocx(filePath)
     case '.xlsx':
     case '.xls':  return readXlsx(filePath, compact, filters)
     case '.csv':  return readCsv(filePath, compact, filters)
     default:      return readTextFile(filePath)
   }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Read all supported files from <projectDir>/AI Context/.
 *
 * @param {string} projectDir      Absolute path to the project folder.
 * @param {object} [opts]
 * @param {string[]} [opts.selectedFiles]  If non-empty, restrict to these filenames.
 * @returns {{ fileCount, files, text, totalChars }}
 */
export async function readContextFiles(projectDir, { selectedFiles = [], rowFilter = null } = {}) {
  const contextDir = path.join(projectDir, 'AI Context')

  let filenames
  try {
    filenames = await fs.readdir(contextDir)
  } catch {
    return { fileCount: 0, files: [], text: '', totalChars: 0 }
  }

  // Exclude Office temp/lock files (~$), hidden files, and any legacy summary files
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
    return { fileCount: 0, files: [], text: '', totalChars: 0 }
  }

  // Read files concurrently
  const fileContents = await Promise.all(
    supported.map(async (filename) => {
      try {
        const ext           = path.extname(filename).toLowerCase()
        const raw           = await extractText(path.join(contextDir, filename), false, rowFilter)
        const hasTabularExt = ext === '.xlsx' || ext === '.xls' || ext === '.csv'
        const limit         = hasTabularExt ? MAX_CONTEXT_CHARS : MAX_TEXT_FILE_CHARS
        const clipped       = raw.trim()
        const text          = clipped.length > limit
          ? clipped.slice(0, limit) + '\n[...truncated]'
          : clipped
        return { filename, text, ok: true }
      } catch (err) {
        return { filename, text: `[Error reading file: ${err.message}]`, ok: false }
      }
    })
  )

  // Combine, respecting hard total cap
  const parts = []
  let totalChars = 0

  for (const { filename, text } of fileContents) {
    const section = `=== ${filename} ===\n${text}`

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
    fileCount: fileContents.length,
    files:     fileContents.map(f => f.filename),
    text:      parts.join('\n\n'),
    totalChars,
  }
}

/**
 * Same as readContextFiles but uses compact (summarised) mode for tabular files.
 * Produces a much smaller output suitable for the orchestrator's schema-identification step.
 * Text files are read in full; Excel/CSV files are summarised (unique values + 50 sample rows).
 */
export async function readContextFilesCompact(projectDir, { selectedFiles = [], rowFilter = null } = {}) {
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
        const raw     = await extractText(path.join(contextDir, filename), true, rowFilter)
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
 * @returns {{ slices: Object, sharedText: string, matched: boolean }}
 *   slices:     { "0": "rows...", "1": "rows...", ... }
 *   sharedText: full content of sheets that do NOT contain the grouping column — sent
 *               to every agent as shared reference data (pivot tables, lookup sheets, etc.)
 *   matched:    true if the column was found in at least one file
 */
export async function extractGroupedSlices(contextDir, column, groupValues, allFilenames, rowFilter = null) {
   const TABULAR_EXT = new Set(['.xlsx', '.xls', '.csv'])
   const tabularFiles = allFilenames.filter(f => TABULAR_EXT.has(path.extname(f).toLowerCase()))

   // Build per-group row buckets, keyed by sheet
   const buckets    = groupValues.map(() => ({})) // [{ "filename / sheetName": ["row...", ...] }]
   const rawBuckets = groupValues.map(() => [])   // flat raw row objects per group (for metadata)
   const blocksParts = []
   let matched = false

   // Only the FIRST sheet that contains the grouping column is used for slicing.
   // All other sheets — even if they also contain the grouping column — go to shared
   // reference data. This ensures pivot/summary sheets are never accidentally sliced.
   let dataSheetClaimed = false
   
   // Support both single filter and array of filters
   const filters = Array.isArray(rowFilter) ? rowFilter : (rowFilter ? [rowFilter] : [])

   for (const filename of tabularFiles) {
     const filePath = path.join(contextDir, filename)
     let wb
     try {
       wb = await loadWorkbook(filePath)
     } catch {
       continue
     }

     for (const sheetName of wb.sheetNames) {
       const rawRows = wb.toObjects(sheetName)
       if (rawRows.length === 0) continue

       const headers = Object.keys(rawRows[0])

       // Apply all filters before any grouping (AND logic)
       let rows = rawRows
       if (filters.length > 0) {
         rows = rawRows.filter(row => {
           return filters.every(filter => {
             const filterColKey = headers.find(h => h.trim().toLowerCase() === filter.column.toLowerCase())
             if (!filterColKey) return true // Column not found, skip this filter
             return filter.values.has(String(row[filterColKey] ?? '').trim().toLowerCase())
           })
         })
       }

      const colKey = headers.find(h => h.trim().toLowerCase() === column.trim().toLowerCase())

      if (!colKey || dataSheetClaimed) {
        // No grouping column, or the data sheet was already claimed — all rows go to shared reference data
        const lines = [`=== ${filename} / ${sheetName} ===`]
        lines.push(headers.join(' | '))
        rows.forEach(row => lines.push(headers.map(h => String(row[h] ?? '')).join(' | ')))
        blocksParts.push(lines.join('\n'))
        continue
      }

      // First sheet with the grouping column — claim it as the data sheet to slice
      dataSheetClaimed = true
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
          rawBuckets[idx].push(row)
        }
      })
    }
  }

  const slices = {}
  if (matched) {
    groupValues.forEach((gv, i) => {
      const sheetMap  = buckets[i]
      const rawRows   = rawBuckets[i]

      const parts = Object.entries(sheetMap).map(([sheetLabel, rows]) =>
        `[Sheet: ${sheetLabel}] (${rows.length} rows)\n${rows.join('\n')}`
      )
      const sliceBody = parts.length > 0
        ? parts.join('\n\n')
        : `[No rows found for group: ${gv}]`

      slices[i.toString()] = sliceBody
    })
  }

  return {
    slices,
    sharedText: blocksParts.join('\n\n'),
    matched,
  }
}

/**
 * Read all column names from tabular files in the AI Context folder.
 * Returns deduplicated column names across all sheets, in encounter order.
 *
 * @param {string} projectDir
 * @param {object} [opts]
 * @param {string[]} [opts.selectedFiles]
 * @returns {Promise<{ columns: string[], fileCount: number }>}
 */
export async function readTabularColumns(projectDir, { selectedFiles = [] } = {}) {
  const contextDir = path.join(projectDir, 'AI Context')

  let filenames
  try { filenames = await fs.readdir(contextDir) } catch { return { columns: [], fileCount: 0 } }

  const TABULAR_EXT = new Set(['.xlsx', '.xls', '.csv'])
  let tabular = filenames.filter(f =>
    TABULAR_EXT.has(path.extname(f).toLowerCase()) &&
    !f.startsWith('~$') &&
    !f.startsWith('.')
  )
  if (selectedFiles.length > 0) {
    const selSet = new Set(selectedFiles)
    tabular = tabular.filter(f => selSet.has(f))
  }

  const seen = new Set()
  const columns = []

  for (const filename of tabular) {
    try {
      const wb = await loadWorkbook(path.join(contextDir, filename))
      for (const sheetName of wb.sheetNames) {
        const rows = wb.toArray(sheetName)
        const dataRows = rows.filter(row => row.some(cell => String(cell).trim() !== ''))
        if (dataRows.length === 0) continue
        for (const cell of dataRows[0]) {
          const col = String(cell).trim()
          if (col && !seen.has(col)) { seen.add(col); columns.push(col) }
        }
      }
    } catch {}
  }

  return { columns, fileCount: tabular.length }
}

/**
 * Read ordered unique non-empty values from a specific column across all tabular files.
 *
 * @param {string} contextDir   Absolute path to the AI Context folder
 * @param {string} columnName   Column header to search (case-insensitive)
 * @param {string[]} filenames  All supported filenames to scan
 * @returns {Promise<string[]>} Ordered unique values
 */
export async function readColumnUniqueValues(contextDir, columnName, filenames, rowFilter = null) {
  const TABULAR_EXT = new Set(['.xlsx', '.xls', '.csv'])
  const tabular = filenames.filter(f => TABULAR_EXT.has(path.extname(f).toLowerCase()))

  const seen = new Set()
  const values = []

  for (const filename of tabular) {
    try {
      const wb = await loadWorkbook(path.join(contextDir, filename))
      for (const sheetName of wb.sheetNames) {
        const rawRows = wb.toObjects(sheetName)
        if (rawRows.length === 0) continue
        const headers = Object.keys(rawRows[0])

        let rows = rawRows
        const filters = Array.isArray(rowFilter) ? rowFilter : (rowFilter ? [rowFilter] : [])
        if (filters.length > 0) {
          rows = rawRows.filter(row => filters.every(filter => {
            const filterColKey = headers.find(h => h.trim().toLowerCase() === filter.column.toLowerCase())
            if (!filterColKey) return true
            return filter.values.has(String(row[filterColKey] ?? '').trim().toLowerCase())
          }))
        }

        const colKey = headers.find(h => h.trim().toLowerCase() === columnName.trim().toLowerCase())
        if (!colKey) continue
        for (const row of rows) {
          const val = String(row[colKey] ?? '').trim()
          if (val && !seen.has(val)) { seen.add(val); values.push(val) }
        }
      }
    } catch {}
  }

  return values
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
 * @returns {Promise<{ slices: Object, blocksText: string }>}
 *   slices:     { "0": "...", "1": "...", ... } — one per instance, zero-indexed string keys
 *   blocksText: All tabular files in full + all document files (capped at 400k chars)
 */
export async function buildInstanceSlices(
  contextDir,
  instanceKeys,
  allFilenames,
) {
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
    let wb
    try {
      wb = await loadWorkbook(filePath)
    } catch {
      continue
    }

    for (const sheetName of wb.sheetNames) {
      const rows = wb.toArray(sheetName)
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
    let text
    try {
      text = await extractText(filePath)
    } catch {
      text = `[Error reading file: ${filename}]`
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
