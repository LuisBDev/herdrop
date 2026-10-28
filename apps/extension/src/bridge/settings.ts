import { settingsItem } from '../storage/items.ts';

export async function bridgeBase(): Promise<string> {
  const settings = await settingsItem.getValue();
  return `http://127.0.0.1:${settings.bridgePort ?? 47821}`;
}
