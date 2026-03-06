import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.31.199:8000';

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await SecureStore.getItemAsync('access_token');

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    await SecureStore.deleteItemAsync('access_token');
    router.replace('/auth');
    throw new Error('Session expired. Please log in again.');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}
