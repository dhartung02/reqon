import * as SecureStore from 'expo-secure-store';

// Applicant profile for the in-app browser's apply-assist. PII → keychain (expo-secure-store).
// Mirrors the factual fields the desktop guidance pre-fills; never includes passwords/EEO/consent.
export interface Profile {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
  website?: string;
}

const KEY = 'reqon.profile';

export async function getProfile(): Promise<Profile> {
  const v = await SecureStore.getItemAsync(KEY);
  try {
    return v ? (JSON.parse(v) as Profile) : {};
  } catch {
    return {};
  }
}

export async function setProfile(p: Profile): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(p));
}

export const profileHasData = (p: Profile) => Object.values(p).some((v) => v && v.trim());
