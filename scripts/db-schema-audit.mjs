#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SCHEMA_PATH = path.join(ROOT, 'prisma/schema.prisma');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql']);
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo', 'coverage']);
const COMMON_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'userId', 'postId', 'categoryId']);
const STRICT = process.env.ARCHITECTURE_AUDIT_STRICT === '1';

const CRITICAL_INDEX_EXPECTATIONS = [
  {
    model: 'Post',
    map: 'idx_post_visible_bumped_desc',
    reason: 'Generic public post/feed listing must use visible + bumpedAt ordering.',
  },
  {
    model: 'Post',
    map: 'idx_post_category_visible_bumped_desc',
    reason: 'Category feed must stay indexed for homepage/category tabs.',
  },
  {
    model: 'Post',
    map: 'idx_post_country_visible_bumped_desc',
    reason: 'Country/location filtered feed must stay indexed for Southeast Asia browsing.',
  },
  {
    model: 'Post',
    map: 'idx_post_author_visible_bumped_desc',
    reason: 'User profile post lists must stay indexed.',
  },
  {
    model: 'Post',
    map: 'idx_post_quote_visible_created',
    reason: 'Quoted post lists must stay indexed because /api/posts supports quotedOnly.',
  },
  {
    model: 'Follow',
    map: 'idx_follow_fans_created_desc',
    reason: 'Fans list pagination must stay indexed.',
  },
  {
    model: 'Follow',
    map: 'idx_follow_following_desc',
    reason: 'Following list pagination must stay indexed.',
  },
  {
    model: 'Like',
    map: 'idx_like_user_created_post',
    reason: 'My likes pagination must stay indexed.',
  },
  {
    model: 'PostComment',
    map: 'idx_post_comment_post_visible_created',
    reason: 'Post detail comments must stay indexed.',
  },
  {
    model: 'PostRankingScore',
    map: 'idx_post_ranking_score_recommendation',
    reason: 'Recommendation ranking score lookup must stay indexed.',
  },
];

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir, output = []) {
  if (!(await pathExists(dir))) return output;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, output);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    output.push(fullPath);
  }
  return output;
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function lowerFirst(value) {
  return value ? value[0].toLowerCase() + value.slice(1) : value;
}

function countMatches(content, pattern) {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function parseModels(schema) {
  const models = [];
  const modelPattern = /model\s+(\w+)\s+\{([\s\S]*?)\n\}/g;
  let match;
  while ((match = modelPattern.exec(schema))) {
    const [, name, body] = match;
    const fields = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@') || line.startsWith('@')) continue;
      const fieldName = line.split(/\s+/)[0];
      const fieldType = line.split(/\s+/)[1] || '';
      if (!fieldName || fieldName.startsWith('@@')) continue;
      fields.push({ name: fieldName, type: fieldType, raw: line });
    }
    models.push({ name, delegate: lowerFirst(name), body, fields });
  }
  return models;
}

function parseEnums(schema) {
  const enums = [];
  const enumPattern = /enum\s+(\w+)\s+\{([\s\S]*?)\n\}/g;
  let match;
  while ((match = enumPattern.exec(schema))) {
    const values = match[2]
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter(Boolean);
    enums.push({ name: match[1], values });
  }
  return enums;
}

function collectSourceText(files) {
  return Promise.all(files.map(async (file) => {
    const content = await fs.readFile(file, 'utf8');
    return { file: toRelative(file), content };
  }));
}

function getModelUsage(model, sourceItems) {
  const delegatePattern = new RegExp(`\\bprisma\\.${model.delegate}\\b`, 'g');
  const modelPattern = new RegExp(`\\b${model.name}\\b`, 'g');
  const quotedPattern = new RegExp(`['"]${model.name}['"]`, 'g');
  let delegateRefs = 0;
  let typeRefs = 0;
  let quotedRefs = 0;
  const files = new Map();

  for (const item of sourceItems) {
    const currentDelegateRefs = countMatches(item.content, delegatePattern);
    const currentTypeRefs = countMatches(item.content, modelPattern);
    const currentQuotedRefs = countMatches(item.content, quotedPattern);
    const total = currentDelegateRefs + currentTypeRefs + currentQuotedRefs;
    if (total > 0) files.set(item.file, total);
    delegateRefs += currentDelegateRefs;
    typeRefs += currentTypeRefs;
    quotedRefs += currentQuotedRefs;
  }

  return {
    delegateRefs,
    typeRefs,
    quotedRefs,
    totalRefs: delegateRefs + typeRefs + quotedRefs,
    files: [...files.entries()].sort((a, b) => b[1] - a[1]),
  };
}

function getFieldUsage(model, field, sourceItems) {
  const fieldPattern = new RegExp(`\\b${field.name}\\b`, 'g');
  const selectPattern = new RegExp(`${field.name}\\s*:`, 'g');
  let refs = 0;
  let selectRefs = 0;
  const files = new Map();

  for (const item of sourceItems) {
    const currentRefs = countMatches(item.content, fieldPattern);
    const currentSelectRefs = countMatches(item.content, selectPattern);
    const total = currentRefs + currentSelectRefs;
    if (total > 0) files.set(item.file, total);
    refs += currentRefs;
    selectRefs += currentSelectRefs;
  }

  return {
    refs,
    selectRefs,
    totalRefs: refs + selectRefs,
    files: [...files.entries()].sort((a, b) => b[1] - a[1]),
  };
}

function findCriticalIndexFindings(models) {
  const modelsByName = new Map(models.map((model) => [model.name, model]));
  const findings = [];

  for (const expectation of CRITICAL_INDEX_EXPECTATIONS) {
    const model = modelsByName.get(expectation.model);
    if (!model) {
      findings.push({ ...expectation, type: 'missing-model' });
      continue;
    }
    if (!model.body.includes(`map: "${expectation.map}"`)) {
      findings.push({ ...expectation, type: 'missing-index' });
    }
  }

  return findings;
}

function renderFiles(files, limit = 4) {
  if (!files.length) return '-';
  const top = files.slice(0, limit).map(([file, count]) => `${file}(${count})`).join(', ');
  return files.length > limit ? `${top}, +${files.length - limit}` : top;
}

async function main() {
  if (!(await pathExists(SCHEMA_PATH))) {
    throw new Error('prisma/schema.prisma not found');
  }

  const schema = await fs.readFile(SCHEMA_PATH, 'utf8');
  const models = parseModels(schema);
  const enums = parseEnums(schema);
  const criticalIndexFindings = findCriticalIndexFindings(models);
  const sourceFiles = [
    ...(await walkFiles(path.join(ROOT, 'server'))),
    ...(await walkFiles(path.join(ROOT, 'src'))),
    ...(await walkFiles(path.join(ROOT, 'shared'))),
    ...(await walkFiles(path.join(ROOT, 'scripts'))),
  ].filter((file) => path.resolve(file) !== path.resolve(SCHEMA_PATH));
  const sourceItems = await collectSourceText(sourceFiles);

  const modelReports = models.map((model) => {
    const usage = getModelUsage(model, sourceItems);
    const fieldReports = model.fields.map((field) => ({ field, usage: getFieldUsage(model, field, sourceItems) }));
    const lowSignalFields = fieldReports
      .filter(({ field, usage }) => !COMMON_FIELDS.has(field.name) && usage.totalRefs <= 1)
      .map(({ field, usage }) => ({ name: field.name, type: field.type, totalRefs: usage.totalRefs, files: usage.files }));
    return { model, usage, fieldReports, lowSignalFields };
  });

  const lowSignalModels = modelReports.filter(({ usage }) => usage.totalRefs <= 1);
  const lowSignalFieldCount = modelReports.reduce((sum, report) => sum + report.lowSignalFields.length, 0);

  console.log('\n=== Database Schema Audit ===');
  console.log(`Models: ${models.length}`);
  console.log(`Enums: ${enums.length}`);
  console.log(`Source files scanned: ${sourceFiles.length}`);

  if (criticalIndexFindings.length > 0) {
    console.log('\nCritical index findings for API SLO:');
    criticalIndexFindings.forEach((finding) => {
      console.log(`  - ${finding.model}.${finding.map}: ${finding.type} — ${finding.reason}`);
    });
  } else {
    console.log('\nNo critical API SLO index gaps detected.');
  }

  console.log('\nModel usage inventory:');
  modelReports
    .sort((a, b) => b.usage.totalRefs - a.usage.totalRefs)
    .forEach(({ model, usage }) => {
      console.log(`  ${model.name.padEnd(28)} refs=${String(usage.totalRefs).padStart(4)} delegate=${String(usage.delegateRefs).padStart(3)} files=${renderFiles(usage.files, 3)}`);
    });

  if (lowSignalModels.length > 0) {
    console.log('\nModels with very low code signal; manual review before deleting:');
    lowSignalModels.forEach(({ model, usage }) => {
      console.log(`  - ${model.name}: refs=${usage.totalRefs}, files=${renderFiles(usage.files)}`);
    });
  } else {
    console.log('\nNo very-low-signal models found by static scan.');
  }

  console.log('\nFields with low code signal; these are cleanup candidates only after runtime/data verification:');
  let printed = 0;
  for (const report of modelReports) {
    if (report.lowSignalFields.length === 0) continue;
    console.log(`  ${report.model.name}:`);
    report.lowSignalFields.slice(0, 20).forEach((item) => {
      printed += 1;
      console.log(`    - ${item.name.padEnd(26)} ${item.type.padEnd(18)} refs=${item.totalRefs} files=${renderFiles(item.files, 2)}`);
    });
    if (report.lowSignalFields.length > 20) {
      console.log(`    ... ${report.lowSignalFields.length - 20} more`);
    }
  }
  if (printed === 0) console.log('  none');

  const summary = {
    modelCount: models.length,
    enumCount: enums.length,
    sourceFileCount: sourceFiles.length,
    criticalIndexFindings: criticalIndexFindings.length,
    lowSignalModelCount: lowSignalModels.length,
    lowSignalFieldCount,
  };
  console.log('\nSummary:', JSON.stringify(summary, null, 2));

  if (STRICT && (lowSignalModels.length > 0 || criticalIndexFindings.length > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[db-schema-audit] failed:', error);
  process.exitCode = 1;
});
