import { defineExtensionMessaging } from '@webext-core/messaging';
import type { TabProtocol } from './types.ts';

export const tabMessenger = defineExtensionMessaging<TabProtocol>();
