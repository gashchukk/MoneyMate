import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { persistUserIdFromAccessToken } from '@/utils/session';

const extra = Constants.expoConfig?.extra ?? {};
export const API_BASE_URL: string = extra.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? '';

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
    await persistUserIdFromAccessToken(data.access_token);
    return data.access_token;
  } catch {
    return 'network_error'; // fetch threw — backend unreachable, don't clear session
  }
}

/** Clears tokens, RevenueCat session, and navigates to auth. */
export async function signOut() {
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('refresh_token');
  try {
    await SecureStore.deleteItemAsync('mono_request_id');
  } catch {
    /* */
  }
  try {
    await SecureStore.deleteItemAsync('user_id');
  } catch {
    /* */
  }
  try {
    const { logOutRevenueCat } = await import('@/lib/revenuecat');
    await logOutRevenueCat();
  } catch {
    /* native / web */
  }
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
      if (!skipRedirect) await signOut();
      throw new SessionExpiredError();
    }
  }

  const data = await res.json();
  if (!res.ok) {
    const d = data?.detail;
    if (d && typeof d === 'object' && d !== null && 'code' in d) {
      const err = new Error(typeof (d as { code?: string }).code === 'string' ? (d as { code: string }).code : 'Request failed');
      (err as Error & { apiDetail?: unknown; status?: number }).apiDetail = d;
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    const msg =
      typeof d === 'string'
        ? d
        : d != null
          ? JSON.stringify(d)
          : 'Request failed';
    throw new Error(msg);
  }
  return data;
}

/** Authenticated fetch returning raw text (e.g. CSV export). */
export async function apiFetchText(path: string): Promise<string> {
  const token = await SecureStore.getItemAsync('access_token');
  const makeRequest = (authToken: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    });

  let res = await makeRequest(token);
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken === 'network_error') {
      throw new Error('Network error. Please check your connection.');
    }
    if (newToken) res = await makeRequest(newToken);
    if (res.status === 401) {
      await signOut();
      throw new SessionExpiredError();
    }
  }

  if (res.status === 403) {
    let code = 'export_requires_premium';
    try {
      const j = await res.json();
      if (j?.detail?.code) code = j.detail.code;
    } catch {
      /* */
    }
    throw new Error(code);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.text();
}
