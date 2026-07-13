import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CONFIG_PATH = 'config/architecture-boundaries.json';

export async function loadArchitectureBoundaries(root = process.cwd()) {
  const configPath = path.join(root, DEFAULT_CONFIG_PATH);
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${DEFAULT_CONFIG_PATH} must contain a JSON object`);
  }
  return parsed;
}

export function requireBoundarySection(config, sectionName) {
  const section = config?.[sectionName];
  if (!section || typeof section !== 'object') {
    throw new Error(`Missing architecture boundary section: ${sectionName}`);
  }
  return section;
}

export function requireNumber(section, key) {
  const value = section?.[key];
  if (!Number.isFinite(value)) {
    throw new Error(`Architecture boundary ${key} must be a finite number`);
  }
  return value;
}
