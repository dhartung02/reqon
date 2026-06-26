import * as SecureStore from 'expo-secure-store';
// Legacy entry: the SDK 56 main export deprecated readAsStringAsync (it warns + the new File/Directory
// API replaces it), which broke résumé upload. The legacy module keeps the base64 read working.
import * as FileSystem from 'expo-file-system/legacy';
import { getConfig } from './config';
import { timedFetch } from './http';

// Full applicant profile — mirrors the server profile shape so it's ONE profile (server-optional).
// PII/EEO is stored in the keychain for the candidate's reference; it is NEVER auto-filled or
// submitted by the apply-assist (the browser fill deliberately skips demographic fields).
export interface EduEntry { school?: string; degree?: string; field?: string; level?: string; start?: string; end?: string }
export interface WorkEntry { company?: string; role?: string; location?: string; start?: string; end?: string; description?: string }
export interface Eeo { gender?: string; pronouns?: string; race?: string; ethnicity?: string; veteran?: string; disability?: string; orientation?: string }
export interface Applicant { name?: string; email?: string; phone?: string; linkedin?: string; github?: string; website?: string; location?: string }
// A reusable answer to a recurring application question (or a saved cover note). q = the question /
// label, a = the answer, tags for filtering. Synced with the rest of the profile.
export interface SavedAnswer { id: string; q: string; a: string; tags: string[] }
// A reusable proof-point "story" the AI grounds drafts/guides in. Built via the narrative builder.
export interface Narrative { id: string; title: string; body: string; tags: string[] }
export interface Profile {
  applicant: Applicant;
  summary: string;       // professional summary (top of CV / AI grounding) — P1.7
  sectors: string[];     // sector preferences (e.g. CDP / Customer Data) — P1.7
  narratives: Narrative[]; // reusable proof-point stories (grounding for AI)
  education: EduEntry[];
  workHistory: WorkEntry[];
  awards: string[];
  certs: string[];
  volunteer: string[];
  eeo: Eeo;
  answers: SavedAnswer[];
}

const KEY = 'reqon.profile';
export const EMPTY_PROFILE: Profile = { applicant: {}, summary: '', sectors: [], narratives: [], education: [], workHistory: [], awards: [], certs: [], volunteer: [], eeo: {}, answers: [] };

export const newAnswerId = (): string => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Standard EEO / voluntary self-identification answer sets (US, common-ATS phrasing). Drives the
// app's demographics dropdowns and is mirrored on the board. Race and ethnicity are separate
// fields per OFCCP convention. Stored for the candidate's reference only — never auto-submitted.
export const EEO_OPTIONS: Record<keyof Eeo, string[]> = {
  pronouns: ['He/Him', 'She/Her', 'They/Them', 'Prefer to self-describe', 'Decline to answer'],
  gender: ['Male', 'Female', 'Non-binary', 'Prefer to self-describe', 'Decline to answer'],
  race: ['American Indian or Alaska Native', 'Asian', 'Black or African American', 'Native Hawaiian or Other Pacific Islander', 'White', 'Two or More Races', 'Decline to answer'],
  ethnicity: ['Hispanic or Latino', 'Not Hispanic or Latino', 'Decline to answer'],
  veteran: ['I am not a protected veteran', 'I identify as one or more of the classifications of a protected veteran', 'Decline to answer'],
  disability: ['Yes, I have a disability (or previously had one)', 'No, I do not have a disability', 'Decline to answer'],
  orientation: ['Heterosexual/Straight', 'Gay or Lesbian', 'Bisexual', 'Queer', 'Prefer to self-describe', 'Decline to answer'],
};

export async function getProfile(): Promise<Profile> {
  const v = await SecureStore.getItemAsync(KEY);
  if (!v) return { ...EMPTY_PROFILE };
  try {
    return { ...EMPTY_PROFILE, ...(JSON.parse(v) as Partial<Profile>) };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}
export async function setProfile(p: Profile): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(p));
}
export const profileHasData = (p: Profile) =>
  Object.values(p.applicant).some((v) => v && String(v).trim()) || p.education.length > 0 || p.workHistory.length > 0;

const normalize = (u: string) => u.trim().replace(/\/+$/, '');

function fromServer(sp: Record<string, unknown>): Profile {
  const a = (sp.applicant as Record<string, string>) || {};
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    applicant: { name: a.name, email: a.email, phone: a.phone, linkedin: a.linkedin, github: a.github, website: a.website || a.personalUrl, location: a.location },
    summary: String(sp.summary || ''),
    sectors: arr<string>(sp.sectors).map(String),
    narratives: arr<Partial<Narrative>>(sp.narratives).map((n) => ({
      id: n.id || newAnswerId(),
      title: String(n.title || ''),
      body: String(n.body || ''),
      tags: Array.isArray(n.tags) ? n.tags.map(String) : [],
    })),
    education: arr<EduEntry>(sp.education),
    workHistory: arr<WorkEntry>(sp.workHistory),
    awards: arr<string>(sp.awards),
    certs: arr<string>(sp.certs),
    volunteer: arr<string>(sp.volunteer),
    eeo: (sp.eeo as Eeo) || {},
    answers: arr<Partial<SavedAnswer>>(sp.answers).map((x) => ({
      id: x.id || newAnswerId(),
      q: String(x.q || ''),
      a: String(x.a || ''),
      tags: Array.isArray(x.tags) ? x.tags.map(String) : [],
    })),
  };
}

/** Pull the profile from the server (if configured) into local; falls back to local. */
export async function pullProfile(): Promise<Profile> {
  const { url, token } = await getConfig();
  if (!url) return getProfile();
  try {
    const r = await timedFetch(`${normalize(url)}/api/profile`, { headers: { 'X-CRM-Token': token } });
    const j = await r.json();
    if (r.ok && j.ok && j.profile) {
      const p = fromServer(j.profile);
      await setProfile(p);
      return p;
    }
  } catch {
    /* offline — use local */
  }
  return getProfile();
}

/** Save local + push to the server (if configured). */
export async function pushProfile(p: Profile): Promise<{ ok: boolean; error?: string }> {
  await setProfile(p);
  const { url, token } = await getConfig();
  if (!url) return { ok: true };
  try {
    const r = await fetch(`${normalize(url)}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token },
      body: JSON.stringify({ applicant: p.applicant, summary: p.summary, sectors: p.sectors, narratives: p.narratives, education: p.education, workHistory: p.workHistory, awards: p.awards, certs: p.certs, volunteer: p.volunteer, eeo: p.eeo, answers: p.answers }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

/** AI-draft a professional summary from the résumé/profile (server-grounded). P1.7. */
export async function draftSummary(): Promise<{ summary?: string; error?: string }> {
  const { url, token } = await getConfig();
  if (!url) return { error: 'Connect a sync server in Settings to draft a summary.' };
  try {
    const r = await fetch(`${normalize(url)}/api/profile/draft-summary`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token }, body: '{}',
    });
    const j = await r.json();
    if (!r.ok || !j.ok) return { error: j.error || `HTTP ${r.status}` };
    return { summary: j.summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'network error' };
  }
}

/** Append one saved answer to the profile and persist (local + server). Used by "save this draft". */
export async function appendAnswer(entry: { q: string; a: string; tags?: string[] }): Promise<{ ok: boolean; error?: string }> {
  const p = await getProfile();
  const answer: SavedAnswer = { id: newAnswerId(), q: entry.q.trim(), a: entry.a.trim(), tags: (entry.tags || []).map((t) => t.trim()).filter(Boolean) };
  return pushProfile({ ...p, answers: [answer, ...p.answers] });
}

/** Upload a résumé to the server (parses via profile-from-resume.py), then pull the regenerated profile. */
export async function uploadResume(uri: string, filename: string): Promise<{ ok: boolean; error?: string; profile?: Profile }> {
  const { url, token } = await getConfig();
  if (!url) return { ok: false, error: 'Connect a sync server in Settings to parse résumés.' };
  try {
    const dataBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const r = await fetch(`${normalize(url)}/api/profile/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CRM-Token': token },
      body: JSON.stringify({ filename, dataBase64 }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true, profile: await pullProfile() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'upload failed' };
  }
}
