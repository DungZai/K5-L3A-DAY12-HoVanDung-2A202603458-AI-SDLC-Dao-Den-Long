import { scoreSubmission, topScores } from './score-table.mjs';

const storageKey = 'dao-den-long-local-leaderboard';

function browserEntries() {
  const entries = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
  if (!Array.isArray(entries)) throw new Error('Dữ liệu bảng xếp hạng bị lỗi.');
  return topScores(entries);
}

export async function leaderboard(submission) {
  const entry = submission ? scoreSubmission(submission) : null;
  const response = await fetch('/api/leaderboard', entry ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry)
  } : { cache: 'no-store' });
  if ([404, 405, 501].includes(response.status)) {
    const entries = browserEntries();
    if (!entry) return entries;
    const next = topScores([...entries, { ...entry, achieved_at: new Date().toISOString() }]);
    localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Không lưu được điểm.');
  return data.entries;
}
