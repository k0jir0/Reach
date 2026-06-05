export function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];

    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }

    const [rawKey, rawValue] = item.slice(2).split('=', 2);
    const key = rawKey.trim();
    const next = argv[index + 1];

    if (rawValue !== undefined) {
      args[key] = rawValue;
    } else if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }

  return args;
}

export function getString(args, key, fallback = '') {
  const value = args[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export function getNumber(args, key, fallback) {
  const value = Number(args[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
