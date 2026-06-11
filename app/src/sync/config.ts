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
