import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function readSnapshot(snapshotPath) {
  const absolutePath = path.resolve(snapshotPath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  return JSON.parse(raw);
}

export function buildPromptPack(snapshot, question) {
  const inventory = snapshot.files
    .map((file) => {
      const status = file.included ? 'included' : `skipped: ${file.reason}`;
      return `- ${file.path} (${file.bytes} bytes, ${status})`;
    })
    .join('\n');

  const files = snapshot.selectedFiles
    .map((file) => {
      return [
        `## File: ${file.path}`,
        `- sha256: ${file.hash}`,
        `- estimated tokens: ${file.tokens}`,
        '',
        '```text',
        file.content,
        '```',
      ].join('\n');
    })
    .join('\n\n');

  return [
    '# Reach Long-Context Repository Pack',
    '',
    'You are analyzing a software repository from a structured snapshot. Cite file paths when making claims. Separate observed facts from inferences. If the answer requires code changes, propose a small, testable sequence.',
    '',
    '## User Question',
    '',
    question,
    '',
    '## Snapshot Metadata',
    '',
    `- root: ${snapshot.root}`,
    `- createdAt: ${snapshot.createdAt}`,
    `- context budget: ${snapshot.budget}`,
    `- estimated selected tokens: ${snapshot.usedTokens}`,
    `- discovered files: ${snapshot.counts.discovered}`,
    `- selected files: ${snapshot.counts.selected}`,
    `- skipped binary files: ${snapshot.counts.skippedBinary}`,
    `- skipped oversized files: ${snapshot.counts.skippedOversize}`,
    `- skipped budget files: ${snapshot.counts.skippedBudget}`,
    '',
    '## Repository Inventory',
    '',
    inventory,
    '',
    '## Selected Source',
    '',
    files,
  ].join('\n');
}

export async function writePromptPack(snapshotPath, question, outPath) {
  const snapshot = await readSnapshot(snapshotPath);
  const prompt = buildPromptPack(snapshot, question);
  await fs.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
  await fs.writeFile(outPath, prompt, 'utf8');
  return { prompt, snapshot };
}
