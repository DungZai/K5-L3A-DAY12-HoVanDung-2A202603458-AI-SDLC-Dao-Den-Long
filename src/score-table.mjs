export const SCORE_NAME = /^[A-Za-z0-9_]{3,12}$/;

export function scoreSubmission(input) {
  if (!input || typeof input.name !== 'string' || !SCORE_NAME.test(input.name)) {
    throw new Error('Tên cần từ 3 đến 12 chữ cái, chữ số hoặc dấu gạch dưới.');
  }
  if (!Number.isSafeInteger(input.score) || input.score < 0
      || !Number.isSafeInteger(input.nights_won) || input.nights_won < 0 || input.nights_won > 3
      || !Number.isSafeInteger(input.seed)) throw new Error('Điểm, số Đêm hoặc seed không hợp lệ.');
  const { name, score, nights_won, seed } = input;
  return { name, score, nights_won, seed };
}

export function topScores(entries) {
  return [...entries].sort((a, b) => b.score - a.score || Date.parse(a.achieved_at) - Date.parse(b.achieved_at)).slice(0, 10);
}
