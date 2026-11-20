export function frameMetrics(intervals) {
  const valid = intervals.filter((value) => Number.isFinite(value) && value > 0);
  if (!valid.length) throw new Error('Không đo được khung hình trong khoảng benchmark.');
  const ordered = [...valid].sort((a, b) => a - b);
  const elapsed = valid.reduce((sum, value) => sum + value, 0);
  const worstCount = Math.max(1, Math.ceil(valid.length * 0.01));
  const worst = ordered.slice(-worstCount).reduce((sum, value) => sum + value, 0);
  const round = (value) => Math.round(value * 1000) / 1000;
  return {
    avg_fps: round(1000 * valid.length / elapsed),
    p1_low_fps: round(1000 * worstCount / worst),
    frame_ms_p95: round(ordered[Math.ceil(valid.length * 0.95) - 1]),
    frames: valid.length
  };
}
