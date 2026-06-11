import * as SecureStore from 'expo-secure-store';

// Sync server config (server URL + full-auth token), kept in the device keychain via
// expo-secure-store — never in plain storage or the DB.
const URL_KEY = 'reqon.serverUrl';
const TOKEN_KEY = 'reqon.token';

export interface SyncConfig {
  url: string;
  token: string;
}

export async function getConfig(): Promise<SyncConfig> {
  const [url, token] = await Promise.all([
    SecureStore.getItemAsync(URL_KEY),
    SecureStore.getItemAsync(TOKEN_KEY),
  ]);
  return { url: url ?? '', token: token ?? '' };
}

export async function setConfig(c: SyncConfig): Promise<void> {
  await SecureStore.setItemAsync(URL_KEY, c.url.trim());
  await SecureStore.setItemAsync(TOKEN_KEY, c.token.trim());
}

// On-device scout preference. 'auto' = run only when NO server is configured (when synced, the
// server's scout is the single source of truth); 'on'/'off' force it regardless.
const SCOUT_KEY = 'reqon.scoutMode';
export type ScoutMode = 'auto' | 'on' | 'off';

export async function getScoutMode(): Promise<ScoutMode> {
  const v = await SecureStore.getItemAsync(SCOUT_KEY);
  return v === 'on' || v === 'off' ? v : 'auto';
}

export async function setScoutMode(m: ScoutMode): Promise<void> {
  await SecureStore.setItemAsync(SCOUT_KEY, m);
}

/** Resolve whether the on-device scout should run. */
export const scoutEnabled = (mode: ScoutMode, serverConfigured: boolean): boolean =>
  mode === 'on' ? true : mode === 'off' ? false : !serverConfigured;
