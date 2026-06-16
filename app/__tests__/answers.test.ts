import { allTags, filterAnswers, bestAnswerMatch } from '../src/answers';
import type { SavedAnswer } from '../src/sync/profile';

const ans = (id: string, q: string, a: string, tags: string[]): SavedAnswer => ({ id, q, a, tags });

const lib: SavedAnswer[] = [
  ans('1', 'Why this company?', 'I’m drawn to your data platform work.', ['cover', 'Acme']),
  ans('2', 'Salary expectations', 'Targeting the top of the posted band.', ['comp']),
  ans('3', 'Work authorization', 'Authorized in the US; no sponsorship needed.', ['screening', 'comp']),
];

describe('allTags', () => {
  it('returns sorted unique tags', () => {
    expect(allTags(lib)).toEqual(['Acme', 'comp', 'cover', 'screening']);
  });
});

describe('filterAnswers', () => {
  it('no query / tags returns all', () => {
    expect(filterAnswers(lib, '', [])).toHaveLength(3);
  });
  it('matches the question text', () => {
    expect(filterAnswers(lib, 'salary', []).map((x) => x.id)).toEqual(['2']);
  });
  it('matches the answer text, case-insensitively', () => {
    expect(filterAnswers(lib, 'SPONSORSHIP', []).map((x) => x.id)).toEqual(['3']);
  });
  it('tag filter is OR across selected tags', () => {
    expect(filterAnswers(lib, '', ['comp']).map((x) => x.id)).toEqual(['2', '3']);
    expect(filterAnswers(lib, '', ['cover', 'screening']).map((x) => x.id)).toEqual(['1', '3']);
  });
  it('combines query AND tags', () => {
    expect(filterAnswers(lib, 'authorization', ['comp']).map((x) => x.id)).toEqual(['3']);
    expect(filterAnswers(lib, 'salary', ['screening'])).toHaveLength(0);
  });
});

describe('bestAnswerMatch', () => {
  const lib2: SavedAnswer[] = [
    ans('s', 'What are your salary expectations', '$220k+', ['comp']),
    ans('b', 'Tell me about your background', 'Principal PM…', ['data', 'platform']),
    ans('w', 'Notice period', 'Two weeks', []),
  ];

  it('matches when ≥2 meaningful tokens overlap the question', () => {
    expect(bestAnswerMatch('Your salary expectations for this position?', lib2)?.id).toBe('s');
  });
  it('uses tags as match signal', () => {
    // shares "data" + "platform" via tags (+ "background")
    expect(bestAnswerMatch('data platform background', lib2)?.id).toBe('b');
  });
  it('returns null below the 2-token threshold (avoids wrong paste)', () => {
    expect(bestAnswerMatch('When can you start?', lib2)).toBeNull();
    expect(bestAnswerMatch('salary', lib2)).toBeNull(); // only 1 shared token
  });
  it('returns null for empty inputs', () => {
    expect(bestAnswerMatch('', lib2)).toBeNull();
    expect(bestAnswerMatch('salary expectations', [])).toBeNull();
  });
});
