import * as SecureStore from "expo-secure-store";

const KEY = "MONOBANK_API_TOKEN";

export const saveMonoToken = async (token: string) => {
  await SecureStore.setItemAsync(KEY, token);
};

export const getMonoToken = async () => {
  return await SecureStore.getItemAsync(KEY);
};

export const deleteMonoToken = async () => {
  await SecureStore.deleteItemAsync(KEY);
};
