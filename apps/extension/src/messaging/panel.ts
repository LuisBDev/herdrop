import { defineExtensionMessaging } from '@webext-core/messaging';
import type { PanelProtocol } from './types.ts';

export const panelMessenger = defineExtensionMessaging<PanelProtocol>();
