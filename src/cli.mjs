#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseArgs, getNumber, getString } from './lib/args.mjs';
import { askLocalAnalyst } from './lib/local-analyst.mjs';
import { buildPromptPack, readSnapshot, writePromptPack } from './lib/prompt-pack.mjs';
import { askAgy, askOpenAICompatible } from './lib/providers.mjs';
import { saveRun } from './lib/run-store.mjs';
import { scanRepository } from './lib/scanner.mjs';
import { startServer } from './lib/server.mjs';

const command = process.argv[2] || '--help';
const args = parseArgs(process.argv.slice(3));

function help() {
  console.log(`Reach

Commands:
  scan       Snapshot a repository into structured JSON.
  prompt     Build a long-context prompt pack from a snapshot.
  ask-local  Run the full loop with a deterministic local analyst.
  ask-agy    Send a prompt pack to agy --print.
  ask-llama  Send a prompt pack to an OpenAI-compatible Llama endpoint.
  run        Ask using --provider local, agy, or llama.
  serve      Start a small local dashboard.

Examples:
  node ./src/cli.mjs scan --repo ../Class1/mobile/expo/profile-card-app --out .reach/profile-card.json --budget 1000000
  node ./src/cli.mjs prompt --snapshot .reach/profile-card.json --question "What should we improve?" --out .reach/profile-card.prompt.md
  node ./src/cli.mjs ask-local --snapshot .reach/profile-card.json --question "Review this repo."
  node ./src/cli.mjs ask-agy --snapshot .reach/profile-card.json --question "Review this repo."
  node ./src/cli.mjs ask-llama --snapshot .reach/profile-card.json --question "Find architecture risks."
  node ./src/cli.mjs serve --port 7331
`);
}

async function saveCompletedRun({ provider, model, snapshotPath, snapshot, question, prompt, answer }) {
  const run = await saveRun({
    provider,
    model,
    snapshotPath,
    snapshot,
    question,
    prompt,
    answer,
    status: 'completed',
  });
  console.error(`Run saved: ${run.jsonPath}`);
  return run;
}

async function saveFailedRun({ provider, model, snapshotPath, snapshot, question, prompt, error }) {
  const run = await saveRun({
    provider,
    model,
    snapshotPath,
    snapshot,
    question,
    prompt,
    answer: '',
    error: error instanceof Error ? error.message : String(error),
    status: 'failed',
  });
  console.error(`Failed run saved: ${run.jsonPath}`);
  return run;
}

async function askWithProvider(provider, snapshotPath, question, options = {}) {
  const snapshot = await readSnapshot(snapshotPath);
  const prompt = buildPromptPack(snapshot, question);
  const model = options.model || '';

  try {
    if (provider === 'local') {
      const answer = askLocalAnalyst(snapshot, question);
      await saveCompletedRun({ provider, model: 'local-heuristic', snapshotPath, snapshot, question, prompt, answer });
      return answer;
    }

    if (provider === 'agy') {
      const result = await askAgy(prompt, {
        model,
        workspace: snapshot.root,
        cwd: snapshot.root,
        timeout: options.timeout || '10m',
      });
      const answer = result.stdout.trim();
      await saveCompletedRun({ provider, model, snapshotPath, snapshot, question, prompt, answer });
      if (result.stderr.trim()) {
        console.error(result.stderr.trim());
      }
      return answer;
    }

    if (provider === 'llama') {
      const answer = await askOpenAICompatible(prompt, {
        baseUrl: options.baseUrl,
        model,
        apiKey: options.apiKey,
      });
      await saveCompletedRun({ provider, model: model || process.env.REACH_LLM_MODEL || 'llama-4-scout', snapshotPath, snapshot, question, prompt, answer });
      return answer;
    }

    throw new Error(`Unknown provider: ${provider}`);
  } catch (error) {
    await saveFailedRun({ provider, model, snapshotPath, snapshot, question, prompt, error });
    throw error;
  }
}

async function main() {
  if (command === '--help' || command === '-h' || command === 'help') {
    help();
    return;
  }

  if (command === 'scan') {
    const repo = getString(args, 'repo', '.');
    const out = getString(args, 'out', '.reach/snapshot.json');
    const budget = getNumber(args, 'budget', 1_000_000);
    const maxFileBytes = getNumber(args, 'max-file-bytes', 350_000);
    const snapshot = await scanRepository({ repo, budget, maxFileBytes });

    await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
    await fs.writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    console.log(`Snapshot written: ${out}`);
    console.log(`Selected ${snapshot.counts.selected}/${snapshot.counts.discovered} files, estimated ${snapshot.usedTokens}/${snapshot.budget} tokens.`);
    return;
  }

  if (command === 'prompt') {
    const snapshotPath = getString(args, 'snapshot');
    const question = getString(args, 'question', 'Analyze this repository and recommend next steps.');
    const out = getString(args, 'out', '.reach/prompt.md');

    if (!snapshotPath) {
      throw new Error('--snapshot is required');
    }

    await writePromptPack(snapshotPath, question, out);
    console.log(`Prompt pack written: ${out}`);
    return;
  }

  if (command === 'ask-local') {
    const snapshotPath = getString(args, 'snapshot');
    const question = getString(args, 'question', 'Analyze this repository and recommend next steps.');

    if (!snapshotPath) {
      throw new Error('--snapshot is required');
    }

    const answer = await askWithProvider('local', snapshotPath, question);
    console.log(answer.trim());
    return;
  }

  if (command === 'ask-agy') {
    const snapshotPath = getString(args, 'snapshot');
    const question = getString(args, 'question', 'Analyze this repository and recommend next steps.');

    if (!snapshotPath) {
      throw new Error('--snapshot is required');
    }

    const answer = await askWithProvider('agy', snapshotPath, question, {
      model: getString(args, 'model'),
      timeout: getString(args, 'timeout', '10m'),
    });

    console.log(answer.trim());
    return;
  }

  if (command === 'ask-llama') {
    const snapshotPath = getString(args, 'snapshot');
    const question = getString(args, 'question', 'Analyze this repository and recommend next steps.');

    if (!snapshotPath) {
      throw new Error('--snapshot is required');
    }

    const answer = await askWithProvider('llama', snapshotPath, question, {
      baseUrl: getString(args, 'base-url'),
      model: getString(args, 'model'),
      apiKey: getString(args, 'api-key'),
    });

    console.log(answer.trim());
    return;
  }

  if (command === 'run') {
    const provider = getString(args, 'provider', 'local');
    const snapshotPath = getString(args, 'snapshot');
    const question = getString(args, 'question', 'Analyze this repository and recommend next steps.');

    if (!snapshotPath) {
      throw new Error('--snapshot is required');
    }

    const answer = await askWithProvider(provider, snapshotPath, question, {
      baseUrl: getString(args, 'base-url'),
      model: getString(args, 'model'),
      apiKey: getString(args, 'api-key'),
      timeout: getString(args, 'timeout', '10m'),
    });

    console.log(answer.trim());
    return;
  }

  if (command === 'serve') {
    startServer(getNumber(args, 'port', 7331));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
