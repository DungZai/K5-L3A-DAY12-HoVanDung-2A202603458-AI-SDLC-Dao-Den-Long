import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { scoreSubmission, topScores } from '../src/score-table.mjs';

export function readLeaderboard(directory) {
  try {
    const entries = JSON.parse(readFileSync(join(directory, 'leaderboard.json'), 'utf8')).entries;
    if (!Array.isArray(entries)) throw new Error('Dữ liệu bảng xếp hạng bị lỗi.');
    return { entries: topScores(entries) };
  } catch (error) {
    if (error.code === 'ENOENT') return { entries: [] };
    throw error;
  }
}

export function recordScore(directory, input, now = new Date()) {
  const entry = { ...scoreSubmission(input), achieved_at: now.toISOString() };
  const data = { entries: topScores([...readLeaderboard(directory).entries, entry]) };
  mkdirSync(directory, { recursive: true });
  const temp = join(directory, `leaderboard-${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    renameSync(temp, join(directory, 'leaderboard.json'));
  } catch (error) {
    try { unlinkSync(temp); } catch { /* The file may not have been created. */ }
    throw error;
  }
  return data;
}
