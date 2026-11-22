/**
 * Compute median of an array of numbers.
 * @param {number[]} arr
 * @returns {number}
 */
export function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Get completion times from sessionStorage and compute median.
 * @returns {{ times: number[], median: number, count: number }}
 */
export function getCompletionStats() {
  const times = JSON.parse(sessionStorage.getItem('completionTimes') || '[]');
  return {
    times,
    median: median(times),
    count: times.length,
  };
}

/**
 * Log completion stats to console.
 */
export function logCompletionStats() {
  const stats = getCompletionStats();
  console.log('=== Time-to-Complete Report ===');
  console.log(`Samples: ${stats.count}`);
  console.log(`Times (ms): ${stats.times.join(', ')}`);
  console.log(`Median: ${stats.median}ms`);
  console.log(`Mean: ${stats.times.length ? (stats.times.reduce((a, b) => a + b, 0) / stats.times.length).toFixed(0) : 0}ms`);
  console.log('==============================');
  return stats;
}
