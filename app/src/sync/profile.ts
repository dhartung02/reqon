import * as SecureStore from 'expo-secure-store';
// Legacy entry: the SDK 56 main export deprecated readAsStringAsync (it warns + the new File/Directory
// API replaces it), which broke résumé upload. The legacy module keeps the base64 read working.
import * as FileSystem from 'expo-file-system/legacy';
import { getConfig } from './config';

// Full applicant profile — mirrors the server profile shape so it's ONE profile (server-optional).
// PII/EEO is stored in the keychain for the candidate's reference; it is NEVER auto-filled or
// submitted by the apply-assist (the browser fill deliberately skips demographic fields).
export interface EduEntry { school?: string; degree?: string; field?: string; level?: string; start?: string; end?: string }
export interface WorkEntry { company?: string; role?: string; start?: string; end?: string; description?: string }
export interface Eeo { gender?: string; pronouns?: string; race?: string; ethnicity?: string; veteran?: string; disability?: string; orientation?: string }
export interface Applicant { name?: string; email?: string; phone?: string; linkedin?: string; github?: string; website?: string; location?: string }
export interface Profile {
  applicant: Applicant;
  education: EduEntry[];
  workHistory: WorkEntry[];
  awards: string[];
  certs: string[];
  volunteer: string[];
  eeo: Eeo;
}

const KEY = 'reqon.profile';
export const EMPTY_PROFILE: Profile = { applicant: {}, education: [], workHistory: [], awards: [], certs: [], volunteer: [], eeo: {} };

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
    education: arr<EduEntry>(sp.education),
    workHistory: arr<WorkEntry>(sp.workHistory),
    awards: arr<string>(sp.awards),
    certs: arr<string>(sp.certs),
    volunteer: arr<string>(sp.volunteer),
    eeo: (sp.eeo as Eeo) || {},
  };
}

/** Pull the profile from the server (if configured) into local; falls back to local. */
export async function pullProfile(): Promise<Profile> {
  const { url, token } = await getConfig();
  if (!url) return getProfile();
  try {
    const r = await fetch(`${normalize(url)}/api/profile`, { headers: { 'X-CRM-Token': token } });
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
      body: JSON.stringify({ applicant: p.applicant, education: p.education, workHistory: p.workHistory, awards: p.awards, certs: p.certs, volunteer: p.volunteer, eeo: p.eeo }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
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
