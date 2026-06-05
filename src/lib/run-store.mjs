import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function summarizeAnswer(answer) {
  return answer
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export function defaultRunsDir(snapshotPath) {
  return path.join(path.dirname(path.resolve(snapshotPath)), 'runs');
}

export async function saveRun(options) {
  const now = new Date();
  const id = `${safeTimestamp(now)}-${randomUUID().slice(0, 8)}`;
  const runsDir = path.resolve(options.runsDir || defaultRunsDir(options.snapshotPath));
  const promptHash = createHash('sha256').update(options.prompt || '').digest('hex').slice(0, 16);
  const answerHash = createHash('sha256').update(options.answer || '').digest('hex').slice(0, 16);

  const record = {
    schemaVersion: 1,
    id,
    createdAt: now.toISOString(),
    provider: options.provider,
    model: options.model || null,
    status: options.status || 'completed',
    snapshotPath: path.resolve(options.snapshotPath),
    snapshotRoot: options.snapshot?.root || null,
    question: options.question,
    promptHash,
    answerHash,
    answerSummary: summarizeAnswer(options.answer || options.error || ''),
    answer: options.answer || '',
    error: options.error || null,
    metadata: {
      snapshotTokens: options.snapshot?.usedTokens ?? null,
      snapshotBudget: options.snapshot?.budget ?? null,
      selectedFiles: options.snapshot?.counts?.selected ?? null,
      discoveredFiles: options.snapshot?.counts?.discovered ?? null,
    },
  };

  await fs.mkdir(runsDir, { recursive: true });
  const jsonPath = path.join(runsDir, `${id}.json`);
  const markdownPath = path.join(runsDir, `${id}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await fs.writeFile(markdownPath, renderRunMarkdown(record), 'utf8');

  return { ...record, jsonPath, markdownPath };
}

export function renderRunMarkdown(record) {
  return [
    `# Reach Run ${record.id}`,
    '',
    `- Provider: ${record.provider}`,
    `- Model: ${record.model || 'default'}`,
    `- Status: ${record.status}`,
    `- Created: ${record.createdAt}`,
    `- Snapshot: ${record.snapshotPath}`,
    '',
    '## Question',
    '',
    record.question,
    '',
    record.error ? '## Error' : '## Answer',
    '',
    record.error || record.answer,
    '',
  ].join('\n');
}
