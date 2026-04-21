import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};
const rawBase = (extra.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? '') as string;
/** Trailing slashes break paths like `/auth/apple` → `//auth/apple` (404 on some hosts). */
export const API_BASE_URL: string = rawBase.replace(/\/+$/, '');

export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired. Please log in again.');
    this.name = 'SessionExpiredError';
  }
}

// Returns new token, null (token truly invalid), or 'network_error' (unreachable)
async function refreshAccessToken(): Promise<string | null | 'network_error'> {
  const refreshToken = await SecureStore.getItemAsync('refresh_token');
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null; // server explicitly rejected — token invalid
    const data = await res.json();
    await SecureStore.setItemAsync('access_token', data.access_token);
    await SecureStore.setItemAsync('refresh_token', data.refresh_token);
    return data.access_token;
  } catch {
    return 'network_error'; // fetch threw — backend unreachable, don't clear session
  }
}

async function clearSession() {
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('refresh_token');
  router.replace('/auth');
}

export async function apiFetch(path: string, options: RequestInit = {}, { skipRedirect = false } = {}) {
  const token = await SecureStore.getItemAsync('access_token');

  const makeRequest = (authToken: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...options.headers,
      },
    });

  let res = await makeRequest(token);

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken === 'network_error') {
      throw new Error('Network error. Please check your connection.');
    }
    if (newToken) {
      res = await makeRequest(newToken);
    }
    if (res.status === 401) {
      if (!skipRedirect) await clearSession();
      throw new SessionExpiredError();
    }
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}
