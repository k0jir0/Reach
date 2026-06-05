function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findFile(snapshot, fileName) {
  return snapshot.selectedFiles.find((file) => file.path.replaceAll('\\', '/').endsWith(fileName));
}

function topFiles(snapshot, count = 8) {
  return snapshot.selectedFiles
    .slice()
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, count)
    .map((file) => `- ${file.path} (${file.tokens} estimated tokens)`)
    .join('\n');
}

function packageSignals(snapshot) {
  const packageFile = findFile(snapshot, 'package.json');
  if (!packageFile) {
    return '- No package.json was selected, so stack detection is limited.';
  }

  const parsed = tryParseJson(packageFile.content);
  if (!parsed) {
    return '- package.json was selected but could not be parsed.';
  }

  const dependencies = Object.keys({
    ...(parsed.dependencies || {}),
    ...(parsed.devDependencies || {}),
  }).sort();
  const scripts = Object.keys(parsed.scripts || {}).sort();

  return [
    `- package: ${parsed.name || 'unnamed'}`,
    `- scripts: ${scripts.length ? scripts.join(', ') : 'none declared'}`,
    `- dependencies: ${dependencies.slice(0, 12).join(', ') || 'none declared'}${dependencies.length > 12 ? ', ...' : ''}`,
  ].join('\n');
}

function findLikelyEntryPoints(snapshot) {
  const entryPatterns = [
    /(^|\\|\/)(src|app)(\\|\/)(index|main|app|_layout)\.(js|jsx|ts|tsx|mjs)$/i,
    /(^|\\|\/)(server|api)(\\|\/).*\.(js|ts|mjs)$/i,
    /(^|\\|\/)(package\.json|README\.md)$/i,
  ];

  const entries = snapshot.selectedFiles
    .filter((file) => entryPatterns.some((pattern) => pattern.test(file.path)))
    .slice(0, 10)
    .map((file) => `- ${file.path}`);

  return entries.length ? entries.join('\n') : '- No obvious entry points were selected.';
}

export function askLocalAnalyst(snapshot, question) {
  const selectedRatio = `${snapshot.counts.selected}/${snapshot.counts.discovered}`;
  const skipped = snapshot.counts.skippedBinary + snapshot.counts.skippedOversize + snapshot.counts.skippedBudget;

  return [
    '# Reach Local Analysis',
    '',
    '> This is a deterministic local MVP analysis, not a frontier-model response. Use `ask-agy` or `ask-llama` when a long-context model endpoint is available.',
    '',
    '## Question',
    '',
    question,
    '',
    '## Repository Snapshot',
    '',
    `- Root: ${snapshot.root}`,
    `- Created: ${snapshot.createdAt}`,
    `- Selected files: ${selectedRatio}`,
    `- Estimated selected tokens: ${snapshot.usedTokens} / ${snapshot.budget}`,
    `- Skipped files: ${skipped}`,
    '',
    '## Stack Signals',
    '',
    packageSignals(snapshot),
    '',
    '## Likely Entry Points',
    '',
    findLikelyEntryPoints(snapshot),
    '',
    '## Largest Context Contributors',
    '',
    topFiles(snapshot),
    '',
    '## MVP Assessment',
    '',
    '- The repository can be converted into an auditable context pack.',
    '- The selected files and token budget are recorded, so future answers can be traced back to exactly what the model saw.',
    '- External long-context providers can be added without changing the scanner or prompt-pack format.',
    '',
    '## Recommended Next Steps',
    '',
    '1. Run the same snapshot through `ask-agy` after Antigravity authentication and filesystem permissions are available.',
    '2. Configure `REACH_LLM_BASE_URL`, `REACH_LLM_API_KEY`, and `REACH_LLM_MODEL` for a hosted Llama/OpenAI-compatible endpoint.',
    '3. Compare local, agy, and Llama run artifacts in the dashboard before trusting any one answer.',
  ].join('\n');
}
