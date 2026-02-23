import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = 'http://192.168.31.16:8000'; // 🔁 Replace

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await SecureStore.getItemAsync('access_token');
  console.log('📡 apiFetch', path, 'token:', token ? '✅' : '❌ MISSING');

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}
