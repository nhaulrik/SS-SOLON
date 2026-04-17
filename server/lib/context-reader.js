/**
 * server/lib/context-reader.js
 *
 * Reads all files from a project's "AI Context" folder and returns their
 * text content for use in AI prompts. Supports: txt, md, html, pdf, docx, xlsx/xls, csv.
 */

import fs from 'fs/promises'
import path from 'path'

const SUPPORTED_EXT = new Set(['.txt', '.md', '.html', '.pdf', '.docx', '.xlsx', '.xls', '.csv'])

// Per-file char limit before truncation; hard cap on total to keep orchestrator prompt lean
const MAX_CHARS_PER_FILE = 4000
const MAX_TOTAL_CHARS    = 20_000

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

async function readXlsx(filePath) {
  const { default: XLSX } = await import('xlsx')
  const workbook = XLSX.readFile(filePath)
  return workbook.SheetNames
    .map(name => `[Sheet: ${name}]\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`)
    .join('\n\n')
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, 'utf-8')
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.pdf':  return readPdf(filePath)
    case '.docx': return readDocx(filePath)
    case '.xlsx':
    case '.xls':  return readXlsx(filePath)
    default:      return readTextFile(filePath)
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Read all supported files from <projectDir>/AI Context/.
 *
 * @param {string} projectDir  Absolute path to the project folder.
 * @returns {{ fileCount, files, text, totalChars }}
 *   text is the combined, truncated content ready to paste into a prompt.
 */
export async function readContextFiles(projectDir) {
  const contextDir = path.join(projectDir, 'AI Context')

  let filenames
  try {
    filenames = await fs.readdir(contextDir)
  } catch {
    return { fileCount: 0, files: [], text: '', totalChars: 0 }
  }

  // Exclude Office temp/lock files (start with ~$) and other hidden files
  const supported = filenames.filter(f =>
    SUPPORTED_EXT.has(path.extname(f).toLowerCase()) &&
    !f.startsWith('~$') &&
    !f.startsWith('.')
  )
  if (supported.length === 0) {
    return { fileCount: 0, files: [], text: '', totalChars: 0 }
  }

  // Read files concurrently
  const fileContents = await Promise.all(
    supported.map(async (filename) => {
      try {
        const raw = await extractText(path.join(contextDir, filename))
        const text = raw.trim()
        const clipped = text.length > MAX_CHARS_PER_FILE
          ? text.slice(0, MAX_CHARS_PER_FILE) + '\n[...truncated]'
          : text
        return { filename, text: clipped, ok: true }
      } catch (err) {
        return { filename, text: `[Error reading file: ${err.message}]`, ok: false }
      }
    })
  )

  // Build combined text, respecting total cap
  const parts = []
  let totalChars = 0

  for (const { filename, text } of fileContents) {
    const section = `=== ${filename} ===\n${text}`
    if (totalChars + section.length > MAX_TOTAL_CHARS) {
      const remaining = MAX_TOTAL_CHARS - totalChars
      if (remaining > 200) {
        parts.push(section.slice(0, remaining) + '\n[...context truncated — total limit reached]')
      }
      break
    }
    parts.push(section)
    totalChars += section.length + 2 // +2 for \n\n separator
  }

  return {
    fileCount: fileContents.length,
    files: fileContents.map(f => f.filename),
    text: parts.join('\n\n'),
    totalChars,
  }
}
