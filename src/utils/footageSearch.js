/**
 * Safe footage filtering and AI metadata formatting utility.
 * Prevents TypeError when camera, title, or timestamp are null/undefined,
 * and eliminates literal 'undefined' rendering for AI tags.
 */

export function safeFootageFilter(footageList = [], selectedTag = 'ALL', searchQuery = '') {
  if (!Array.isArray(footageList)) return [];

  const q = (searchQuery || '').trim().toLowerCase();

  return footageList.filter((item) => {
    if (!item || typeof item !== 'object') return false;

    // Filter by tag if specified
    if (selectedTag !== 'ALL') {
      const tag = (item.aiTag || '').toLowerCase();
      if (tag !== selectedTag.toLowerCase()) return false;
    }

    if (!q) return true;

    // Safe string checks with nullish coalescing
    const titleMatch = (item.title || '').toLowerCase().includes(q);
    const timeMatch = (item.timestamp || '').toLowerCase().includes(q);
    const cameraMatch = (item.camera || '').toLowerCase().includes(q);
    const tagMatch = (item.aiTag || '').toLowerCase().includes(q);

    return titleMatch || timeMatch || cameraMatch || tagMatch;
  });
}

export function formatFootageAi(clip) {
  if (!clip || typeof clip !== 'object') {
    return { tagText: 'Unclassified', hasTag: false };
  }

  const rawTag = clip.aiTag;
  const rawConf = clip.confidence;

  if (!rawTag || rawTag === 'undefined') {
    return { tagText: 'Unclassified', hasTag: false };
  }

  let confStr = '';
  if (rawConf != null && rawConf !== 'undefined') {
    if (typeof rawConf === 'number') {
      confStr = ` (${(rawConf <= 1 ? rawConf * 100 : rawConf).toFixed(1)}%)`;
    } else {
      confStr = ` (${rawConf})`;
    }
  }

  return {
    tagText: `${rawTag}${confStr}`,
    hasTag: true
  };
}
