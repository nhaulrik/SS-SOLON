/**
 * server/lib/project-manager.js
 *
 * Filesystem helpers for projects and flows.
 *
 * Data model:
 *   projects/<projectName>/
 *     project.json   — project metadata (name, type: 'private'|'shared', createdAt)
 *     flows/<flowId>/
 *       flow.json      — flow metadata + _metadata (zones, selections, trees)
 *       template.html  — the HTML slide template
 *       output-*.html  — generated output files
 *       exports/       — versioned exports
 *
 * Project types:
 *   shared — tracked in git, visible to all team members
 *   private  — excluded from git via PROJECTS_DIR/.gitignore, private to this machine
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PROJECTS_DIR, RESOLVED_PROJECTS_DIR, isInsideDir } from '../../config.js';

// ── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Validate a project name and return it, or null if invalid.
 * Allows alphanumeric, hyphens, underscores.
 */
function validateName(name) {
  if (!name || typeof name !== 'string') return null;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) return null;
  return name;
}

/**
 * Resolve a project directory path safely.
 * Returns the path if valid, or null.
 */
export function resolveProjectDir(projectName) {
  const safeName = validateName(projectName);
  if (!safeName) return null;
  const dir = path.join(PROJECTS_DIR, safeName);
  if (!isInsideDir(dir, RESOLVED_PROJECTS_DIR)) return null;
  return dir;
}

/**
 * Resolve a flow directory path safely within a project.
 */
export function resolveFlowDir(projectName, flowId) {
  const projectDir = resolveProjectDir(projectName);
  if (!projectDir) return null;
  if (!validateName(flowId)) return null;
  const dir = path.join(projectDir, 'flows', flowId);
  if (!isInsideDir(dir, RESOLVED_PROJECTS_DIR)) return null;
  return dir;
}

// ── Project metadata (project.json) ──────────────────────────────────────────

function readProjectMeta(projectName) {
  const projectDir = resolveProjectDir(projectName);
  if (!projectDir) return null;
  const metaPath = path.join(projectDir, 'project.json');
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeProjectMeta(projectName, meta) {
  const projectDir = resolveProjectDir(projectName);
  if (!projectDir) return false;
  try {
    fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify(meta, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Run `git rm -r --cached <projectDir>` to stop tracking a directory without
 * deleting files from disk. Stages the deletions so the caller can commit.
 * Returns true if files were removed from the index, false otherwise
 * (not tracked, not a git repo, etc. — all treated as non-fatal).
 */
function gitRmCached(projectDir) {
  try {
    execSync(`git rm -r --cached "${projectDir}"`, {
      cwd: PROJECTS_DIR,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Maintain PROJECTS_DIR/.gitignore so private projects are excluded from git.
 * Each private project is listed as "<name>/" in the gitignore.
 */
function syncGitignore(projectName, type) {
  const gitignorePath = path.join(PROJECTS_DIR, '.gitignore');
  let lines = [];
  if (fs.existsSync(gitignorePath)) {
    lines = fs.readFileSync(gitignorePath, 'utf-8').split('\n');
  }

  const entry = projectName + '/';
  lines = lines.filter(l => l.trim() !== entry);

  if (type === 'private') {
    lines.push(entry);
  }

  const content = lines.filter(l => l.trim() !== '').join('\n');
  fs.writeFileSync(gitignorePath, content ? content + '\n' : '', 'utf-8');
}

// ── Project discovery ─────────────────────────────────────────────────────────

/**
 * List all projects by scanning PROJECTS_DIR.
 * A project is any subdirectory that contains a flows/ subdirectory.
 * Returns { name, type } for each project; type defaults to 'shared' for
 * legacy projects that pre-date project.json.
 */
export function listProjects() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  try {
    return fs.readdirSync(PROJECTS_DIR)
      .filter(name => {
        const projectPath = path.join(PROJECTS_DIR, name);
        return (
          fs.statSync(projectPath).isDirectory() &&
          fs.existsSync(path.join(projectPath, 'flows'))
        );
      })
      .map(name => {
        const meta = readProjectMeta(name);
        return { name, type: meta?.type || 'shared' };
      });
  } catch {
    return [];
  }
}

/**
 * Load a project — returns { name, flows } by scanning the flows/ directory.
 * Each flow entry is the parsed flow.json content.
 * Returns null if the project directory does not exist.
 */
export function loadProject(projectName) {
  const projectDir = resolveProjectDir(projectName);
  if (!projectDir || !fs.existsSync(projectDir)) return null;

  const flowsDir = path.join(projectDir, 'flows');
  const flows = [];

  if (fs.existsSync(flowsDir)) {
    for (const flowId of fs.readdirSync(flowsDir)) {
      const flowPath = path.join(flowsDir, flowId, 'flow.json');
      if (!fs.existsSync(flowPath)) continue;
      try {
        flows.push(JSON.parse(fs.readFileSync(flowPath, 'utf-8')));
      } catch {
        // skip malformed flow.json
      }
    }
  }

  flows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return { name: projectName, flows };
}

/**
 * Load a single flow's flow.json.
 * Returns the parsed object or null if not found.
 */
export function loadFlow(projectName, flowId) {
  const flowDir = resolveFlowDir(projectName, flowId);
  if (!flowDir) return null;

  const flowPath = path.join(flowDir, 'flow.json');
  if (!fs.existsSync(flowPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(flowPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Persist a flow object back to its flow.json.
 * Returns true on success, false on failure.
 */
export function saveFlow(projectName, flowId, flow) {
  const flowDir = resolveFlowDir(projectName, flowId);
  if (!flowDir) return false;
  try {
    fs.writeFileSync(path.join(flowDir, 'flow.json'), JSON.stringify(flow, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`[project-manager] Failed to save flow ${projectName}/${flowId}:`, err.message);
    return false;
  }
}

// ── Mutation helpers ──────────────────────────────────────────────────────────

/**
 * Create a new project directory with project.json and update .gitignore.
 * Returns true on success, false if name is invalid or project already exists.
 */
export function createProject(projectName, type = 'shared') {
  const projectDir = resolveProjectDir(projectName);
  if (!projectDir || fs.existsSync(projectDir)) return false;
  if (!['private', 'shared'].includes(type)) return false;
  fs.mkdirSync(path.join(projectDir, 'flows'), { recursive: true });
  writeProjectMeta(projectName, { name: projectName, type, createdAt: new Date().toISOString() });
  syncGitignore(projectName, type);
  return true;
}

/**
 * Convert a project between 'private' and 'shared'.
 * - shared → private: updates .gitignore AND runs `git rm -r --cached` so the
 *   project's files are staged for removal from the git index (files on disk
 *   are untouched). The caller should commit to complete the transition.
 * - private → shared: removes from .gitignore; files become untracked and can
 *   be staged and committed by the caller.
 *
 * Returns { ok, gitChanged } where gitChanged is true when git index was modified.
 */
export function convertProjectType(projectName, newType) {
  if (!['private', 'shared'].includes(newType)) return { ok: false, gitChanged: false };
  const projectDir = resolveProjectDir(projectName);
  if (!projectDir || !fs.existsSync(projectDir)) return { ok: false, gitChanged: false };
  const meta = readProjectMeta(projectName) || { name: projectName, createdAt: new Date().toISOString() };
  meta.type = newType;
  syncGitignore(projectName, newType);
  const saved = writeProjectMeta(projectName, meta);
  let gitChanged = false;
  if (saved && newType === 'private') {
    gitChanged = gitRmCached(projectDir);
  }
  return { ok: saved, gitChanged };
}

/**
 * Delete a project directory and everything inside it.
 */
export function deleteProject(projectName) {
  const projectDir = resolveProjectDir(projectName);
  if (!projectDir || !fs.existsSync(projectDir)) return false;
  try {
    fs.rmSync(projectDir, { recursive: true, force: true });
    syncGitignore(projectName, 'shared'); // remove from .gitignore on deletion
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a single flow directory.
 */
export function deleteFlow(projectName, flowId) {
  const flowDir = resolveFlowDir(projectName, flowId);
  if (!flowDir || !fs.existsSync(flowDir)) return false;
  try {
    fs.rmSync(flowDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
