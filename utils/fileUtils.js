// utils/fileUtils.js - File and data utilities
const fs = require('fs');
const path = require('path');

function loadJSONFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to load ${filePath}: ${error.message}`);
  }
}

function getField(data, fieldPath) {
  if (!fieldPath || !data) return undefined;
  return fieldPath.split('.').reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), data);
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function formatTimestamp() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') + '-' +
    String(now.getMinutes()).padStart(2, '0') + '-' +
    String(now.getSeconds()).padStart(2, '0');
}

module.exports = {
  loadJSONFile,
  getField,
  ensureDirectory,
  formatTimestamp
};