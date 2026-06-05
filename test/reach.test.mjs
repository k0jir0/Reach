import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { askLocalAnalyst } from '../src/lib/local-analyst.mjs';
import { buildPromptPack } from '../src/lib/prompt-pack.mjs';
import { saveRun } from '../src/lib/run-store.mjs';
import { scanRepository } from '../src/lib/scanner.mjs';

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reach-test-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.mkdir(path.join(root, 'node_modules', 'ignored'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture-app', scripts: { test: 'node --test' }, dependencies: { express: '^5.0.0' } }, null, 2),
    'utf8',
  );
  await fs.writeFile(path.join(root, 'README.md'), '# Fixture\n', 'utf8');
  await fs.writeFile(path.join(root, 'src', 'index.ts'), 'const apiKey = "super-secret";\nexport const value = 1;\n', 'utf8');
  await fs.writeFile(path.join(root, 'node_modules', 'ignored', 'file.js'), 'throw new Error("ignore me");\n', 'utf8');
  return root;
}

test('scanner snapshots text files, skips dependencies, and redacts simple secrets', async () => {
  const root = await makeFixture();
  const snapshot = await scanRepository({ repo: root, budget: 100_000, maxFileBytes: 100_000 });

  assert.equal(snapshot.counts.discovered, 3);
  assert.equal(snapshot.counts.selected, 3);
  assert.equal(snapshot.selectedFiles.some((file) => file.path.includes('node_modules')), false);

  const sourceFile = snapshot.selectedFiles.find((file) => file.path.endsWith('src\\index.ts') || file.path.endsWith('src/index.ts'));
  assert.ok(sourceFile);
  assert.match(sourceFile.content, /\[REDACTED\]/);
  assert.doesNotMatch(sourceFile.content, /super-secret/);
});

test('prompt pack includes question, inventory, and selected source', async () => {
  const root = await makeFixture();
  const snapshot = await scanRepository({ repo: root, budget: 100_000, maxFileBytes: 100_000 });
  const prompt = buildPromptPack(snapshot, 'What is this app?');

  assert.match(prompt, /What is this app\?/);
  assert.match(prompt, /Repository Inventory/);
  assert.match(prompt, /package\.json/);
  assert.match(prompt, /Selected Source/);
});

test('local analyst produces an end-to-end answer without a network model', async () => {
  const root = await makeFixture();
  const snapshot = await scanRepository({ repo: root, budget: 100_000, maxFileBytes: 100_000 });
  const answer = askLocalAnalyst(snapshot, 'Review this repo.');

  assert.match(answer, /Reach Local Analysis/);
  assert.match(answer, /fixture-app/);
  assert.match(answer, /Recommended Next Steps/);
});

test('run store persists machine-readable and markdown artifacts', async () => {
  const root = await makeFixture();
  const snapshot = await scanRepository({ repo: root, budget: 100_000, maxFileBytes: 100_000 });
  const runsDir = path.join(root, '.reach', 'runs');
  const run = await saveRun({
    provider: 'local',
    model: 'local-heuristic',
    snapshotPath: path.join(root, '.reach', 'snapshot.json'),
    snapshot,
    question: 'Review this repo.',
    prompt: buildPromptPack(snapshot, 'Review this repo.'),
    answer: askLocalAnalyst(snapshot, 'Review this repo.'),
    status: 'completed',
    runsDir,
  });

  const json = JSON.parse(await fs.readFile(run.jsonPath, 'utf8'));
  const markdown = await fs.readFile(run.markdownPath, 'utf8');

  assert.equal(json.status, 'completed');
  assert.equal(json.provider, 'local');
  assert.match(markdown, /Reach Run/);
});
