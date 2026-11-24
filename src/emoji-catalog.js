const modifier = /[\u{1F3FB}-\u{1F3FF}]/u;
const base = value => value.replace(/[\u{1F3FB}-\u{1F3FF}\uFE0F]/gu, '');

export function createEmojiCatalog(data) {
  const byEmoji = new Map(data.items.map(item => [item.e, item]));
  const toneBases = new Set(data.items.filter(item => item.g === 'People & Body' && modifier.test(item.e)).map(item => base(item.e)));
  const supportsTone = item => item.g === 'People & Body' && toneBases.has(base(item.e));
  function candidates({ group, subgroup = '', query = '', recent = [], searchScope = 'all' }) {
    const q = query.trim().toLowerCase();
    if (!q && group === 'recent') return recent.map(e => byEmoji.get(e)).filter(Boolean);
    return data.items.filter(item => q ? item.k.includes(q) && (searchScope !== 'category' || group === 'recent' || item.g === group) : item.g === group && (!subgroup || item.s === subgroup));
  }
  function filter(options) {
    const items = candidates(options);
    if (options.group === 'recent' && !options.query?.trim()) return items;
    return items.filter(item => {
      if (!supportsTone(item) || options.tone === 'all') return true;
      const tones = [...item.e].filter(c => modifier.test(c));
      return options.tone ? tones.length > 0 && tones.every(c => c === options.tone) : tones.length === 0;
    });
  }
  return { byEmoji, candidates, filter, supportsTone };
}
