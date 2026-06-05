import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_IGNORES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.reach',
  '.next',
  '.nuxt',
  '.expo',
  '.turbo',
  '.vite',
  '.cache',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
  'vendor',
]);

const TEXT_EXTENSIONS = new Set([
  '.bat',
  '.c',
  '.cmd',
  '.config',
  '.cpp',
  '.cs',
  '.css',
  '.csv',
  '.env',
  '.example',
  '.go',
  '.h',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.lock',
  '.log',
  '.md',
  '.mjs',
  '.php',
  '.ps1',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

const SECRET_PATTERNS = [
  /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi,
  /secret\s*[:=]\s*['"][^'"]+['"]/gi,
  /token\s*[:=]\s*['"][^'"]+['"]/gi,
  /password\s*[:=]\s*['"][^'"]+['"]/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function redactPotentialSecrets(text) {
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      const separator = match.includes('=') ? '=' : ':';
      const key = match.split(separator)[0]?.trim() || 'secret';
      return `${key}${separator} "[REDACTED]"`;
    });
  }
  return redacted;
}

function isLikelyTextFile(filePath, sample) {
  const extension = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) {
    return true;
  }
  if (sample.includes(0)) {
    return false;
  }
  return sample.toString('utf8').replace(/[\t\r\n -~]/g, '').length < sample.length * 0.05;
}

function priorityForFile(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/').toLowerCase();
  if (/(^|\/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|requirements\.txt|pyproject\.toml|cargo\.toml|go\.mod)$/.test(normalized)) {
    return 100;
  }
  if (/(^|\/)(readme|agents|claude|contributing|architecture|security)\.md$/.test(normalized)) {
    return 95;
  }
  if (/(^|\/)(src|app|pages|components|lib|server|api)\//.test(normalized)) {
    return 80;
  }
  if (/\.(test|spec)\.(js|jsx|ts|tsx|py|go|rs)$/.test(normalized)) {
    return 70;
  }
  if (/\.(md|txt|yaml|yml|json)$/.test(normalized)) {
    return 60;
  }
  return 40;
}

async function walk(root, current, files) {
  const entries = await fs.readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    if (DEFAULT_IGNORES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath);

    if (entry.isDirectory()) {
      await walk(root, absolutePath, files);
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath });
    }
  }
}

async function readSample(filePath, size = 4096) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(size);
    const result = await handle.read(buffer, 0, size, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

export async function scanRepository(options) {
  const root = path.resolve(options.repo);
  const budget = options.budget;
  const maxFileBytes = options.maxFileBytes;
  const discovered = [];
  await walk(root, root, discovered);

  const inventory = [];
  let skippedBinary = 0;
  let skippedOversize = 0;

  for (const file of discovered) {
    const stats = await fs.stat(file.absolutePath);
    const sample = await readSample(file.absolutePath);
    const textLike = isLikelyTextFile(file.absolutePath, sample);

    if (!textLike) {
      skippedBinary += 1;
      inventory.push({
        path: file.relativePath,
        bytes: stats.size,
        included: false,
        reason: 'binary',
      });
      continue;
    }

    if (stats.size > maxFileBytes) {
      skippedOversize += 1;
      inventory.push({
        path: file.relativePath,
        bytes: stats.size,
        included: false,
        reason: `over ${maxFileBytes} bytes`,
      });
      continue;
    }

    const raw = await fs.readFile(file.absolutePath, 'utf8');
    const content = redactPotentialSecrets(raw);
    inventory.push({
      path: file.relativePath,
      bytes: stats.size,
      hash: createHash('sha256').update(raw).digest('hex').slice(0, 16),
      included: true,
      priority: priorityForFile(file.relativePath),
      tokens: estimateTokens(content),
      content,
    });
  }

  const included = inventory
    .filter((file) => file.included)
    .sort((a, b) => b.priority - a.priority || a.path.localeCompare(b.path));

  const selected = [];
  let usedTokens = 0;
  const reserveTokens = 6000;
  const contentBudget = Math.max(0, budget - reserveTokens);

  for (const file of included) {
    if (usedTokens + file.tokens > contentBudget) {
      file.included = false;
      file.reason = 'outside token budget';
      continue;
    }

    selected.push(file);
    usedTokens += file.tokens;
  }

  const snapshot = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    root,
    budget,
    usedTokens,
    estimatedTotalTokens: inventory.reduce((sum, file) => sum + (file.tokens || 0), 0),
    counts: {
      discovered: discovered.length,
      selected: selected.length,
      skippedBinary,
      skippedOversize,
      skippedBudget: inventory.filter((file) => file.reason === 'outside token budget').length,
    },
    files: inventory.map((file) => {
      const { content, ...metadata } = file;
      return metadata;
    }),
    selectedFiles: selected.map((file) => ({
      path: file.path,
      bytes: file.bytes,
      hash: file.hash,
      tokens: file.tokens,
      priority: file.priority,
      content: file.content,
    })),
  };

  return snapshot;
}
