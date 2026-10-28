import { defineExtensionMessaging } from '@webext-core/messaging';
import type { BackgroundProtocol } from './types.ts';

export const backgroundMessenger = defineExtensionMessaging<BackgroundProtocol>();
