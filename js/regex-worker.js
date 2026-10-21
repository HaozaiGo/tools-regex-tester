/* User patterns run only in this disposable worker, never on the UI thread. */
const MAX_REPLACEMENT_LENGTH = 1000000;

function checkReplacementSize(text, replacement, matches, truncated) {
  if (truncated) {
    throw Object.assign(new Error('More than 10,000 replacements. Narrow the pattern or shorten the text.'), { code: 'TOO_MANY_REPLACEMENTS' });
  }
  let expansions = 0;
  for (let i = 0; i < replacement.length; i++) {
    if (replacement[i] !== '$') continue;
    const next = replacement[i + 1];
    if (next === '$') { i++; continue; }
    if (next && "&`'<0123456789".includes(next)) expansions++;
  }
  // Every capture, match, prefix or suffix token expands to at most text.length.
  // Count token syntax as literal too: this intentionally overestimates output.
  const retainedLength = text.length - matches.reduce((sum, match) => sum + match.length, 0);
  const upperBound = retainedLength + matches.length * (replacement.length + expansions * text.length);
  if (upperBound > MAX_REPLACEMENT_LENGTH) {
    throw Object.assign(new Error('Replacement may exceed 1,000,000 characters. Shorten the text or replacement.'), { code: 'REPLACEMENT_TOO_LARGE' });
  }
}

self.onmessage = ({ data }) => {
  const { pattern, flags, text, replacement, mode } = data;
  const start = performance.now();
  try {
    const regex = new RegExp(pattern, flags);
    const matches = [];
    let match;
    let truncated = false;
    while ((match = regex.exec(text)) !== null) {
      if (matches.length === 10000) { truncated = true; break; }
      matches.push({ index: match.index, text: match[0], length: match[0].length,
        groups: match.slice(1), namedGroups: match.groups || {} });
      if (!regex.global) break;
      if (match[0] === '') {
        // AdvanceStringIndex must skip a surrogate pair in Unicode mode.
        const point = text.codePointAt(regex.lastIndex);
        regex.lastIndex += (regex.unicode || regex.unicodeSets) && point > 0xffff ? 2 : 1;
      }
    }
    let result = null;
    if (mode === 'replace') {
      checkReplacementSize(text, replacement, matches, truncated);
      result = text.replace(new RegExp(pattern, flags), replacement);
    }
    self.postMessage({ matches, result, truncated, elapsed: (performance.now() - start).toFixed(1) });
  } catch (error) {
    self.postMessage({ error: error.message, errorCode: error.code });
  }
};
