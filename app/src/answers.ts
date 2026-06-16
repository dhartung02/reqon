import type { SavedAnswer } from './sync/profile';

// Pure search/filter for the saved-answers library. Query matches the question or the answer text
// (case-insensitive); tag filtering is OR (an answer matches if it carries any of the active tags).

export function allTags(answers: SavedAnswer[]): string[] {
  const set = new Set<string>();
  for (const ans of answers) for (const t of ans.tags) if (t.trim()) set.add(t.trim());
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// Keyword match a form question to a saved answer (apply-assist auto-fill). Imperfect by nature —
// paraphrased questions share no keywords — so it requires ≥2 shared meaningful tokens before
// claiming a match, biasing toward "leave blank" over "paste the wrong answer".
const STOP = new Set(
  'the a an to of for in on at and or your you our we us is are be do does did what why how when where which who please describe tell about this that these those role position company companies team teams with as it its their have has will would can could should i my me'.split(' '),
);
const tokenize = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9+#]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));

export function bestAnswerMatch(question: string, answers: SavedAnswer[]): SavedAnswer | null {
  const q = new Set(tokenize(question));
  if (!q.size) return null;
  let best: SavedAnswer | null = null;
  let bestScore = 0;
  for (const a of answers) {
    const at = new Set([...tokenize(a.q), ...a.tags.flatMap(tokenize)]);
    let score = 0;
    for (const w of at) if (q.has(w)) score++;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return bestScore >= 2 ? best : null;
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
