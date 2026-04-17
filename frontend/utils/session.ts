import * as SecureStore from 'expo-secure-store';
import { getUserIdFromJwt } from '@/utils/jwt';

export async function persistUserIdFromAccessToken(accessToken: string): Promise<void> {
  const id = getUserIdFromJwt(accessToken);
  if (id != null) await SecureStore.setItemAsync('user_id', String(id));
}

export async function clearStoredUserId(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync('user_id');
  } catch {
    /* */
  }
}
