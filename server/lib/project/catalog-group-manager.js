import fs from 'fs';
import path from 'path';
import { resolveProjectDir } from './project-manager.js';

function resolveGroupsFile(projectName) {
  return path.join(resolveProjectDir(projectName), 'catalog-groups.json');
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) return { groups: [] };
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { groups: [] }; }
}

function writeFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function getGroups(projectName) {
  return readFile(resolveGroupsFile(projectName));
}

export function saveGroups(projectName, groups) {
  const filePath = resolveGroupsFile(projectName);
  writeFile(filePath, { groups });
  return { groups };
}
