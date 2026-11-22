/**
 * Basic spam checks for complaint text.
 * @param {string} text
 * @returns {{ isSpam: boolean, reason: string }}
 */
export function checkSpam(text) {
  if (!text || text.trim().length === 0) {
    return { isSpam: false, reason: '' };
  }

  const lower = text.toLowerCase();

  // Check for excessive URLs
  const urlCount = (lower.match(/https?:\/\//g) || []).length;
  if (urlCount > 3) {
    return { isSpam: true, reason: 'Too many URLs' };
  }

  // Check for repeated characters (spam pattern)
  if (/(.)\1{10,}/.test(text)) {
    return { isSpam: true, reason: 'Repeated characters' };
  }

  // Check for common spam phrases
  const spamPhrases = ['buy now', 'click here', 'free money', 'win lottery', 'subscribe', 'followers', 'cheap', 'discount code'];
  const spamCount = spamPhrases.filter((p) => lower.includes(p)).length;
  if (spamCount >= 2) {
    return { isSpam: true, reason: 'Spam phrases detected' };
  }

  // Check minimum length for non-empty
  if (text.trim().length < 5 && text.trim().length > 0) {
    return { isSpam: true, reason: 'Text too short' };
  }

  return { isSpam: false, reason: '' };
}
