import { allTags, filterAnswers } from '../src/answers';
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
