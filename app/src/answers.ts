import type { SavedAnswer } from './sync/profile';

// Pure search/filter for the saved-answers library. Query matches the question or the answer text
// (case-insensitive); tag filtering is OR (an answer matches if it carries any of the active tags).

export function allTags(answers: SavedAnswer[]): string[] {
  const set = new Set<string>();
  for (const ans of answers) for (const t of ans.tags) if (t.trim()) set.add(t.trim());
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function filterAnswers(answers: SavedAnswer[], query: string, activeTags: string[]): SavedAnswer[] {
  const q = query.trim().toLowerCase();
  const tags = activeTags.filter(Boolean);
  return answers.filter((ans) => {
    if (q && !ans.q.toLowerCase().includes(q) && !ans.a.toLowerCase().includes(q)) return false;
    if (tags.length && !tags.some((t) => ans.tags.includes(t))) return false;
    return true;
  });
}
