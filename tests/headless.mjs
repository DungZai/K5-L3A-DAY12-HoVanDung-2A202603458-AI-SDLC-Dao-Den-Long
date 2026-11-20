import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const contract = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
export const tuning = contract.tuning;
export const isolated = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false };
const script = fileURLToPath(new URL('../scripts/headless.mjs', import.meta.url));

export function cli({ night = 1, seed = 42, scenario, inputs, ticks = 100, snapshot = 10 } = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'dao-den-long-'));
  try {
    const out = join(folder, 'output.jsonl');
    const args = [script, '--seed', String(seed), '--night', String(night), '--ticks', String(ticks),
      '--snapshot-every', String(snapshot), '--out', out];
    for (const [name, data] of Object.entries({ scenario, inputs })) {
      if (data === undefined) continue;
      const path = join(folder, name + '.json');
      writeFileSync(path, JSON.stringify(data));
      args.push('--' + name, path);
    }
    const start = performance.now();
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30_000 });
    const elapsedMs = performance.now() - start;
    if (result.status !== 0) return { ...result, elapsedMs };
    const raw = readFileSync(out, 'utf8');
    const records = raw.trimEnd().split('\n').map(JSON.parse);
    return { ...result, elapsedMs, raw, records, end: records.at(-1),
      events: records.filter(({ type }) => type === 'event'),
      snapshots: records.filter(({ type }) => type === 'snapshot') };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
