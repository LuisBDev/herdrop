import { defineBackground } from 'wxt/utils/define-background';
import { registerWorker } from '../background/register.ts';
import { registerSelfUpdate } from '../background/self-update.ts';
import { registerSiteAccess } from '../site/registration.ts';

export default defineBackground(() => {
  registerWorker();
  registerSiteAccess();
  registerSelfUpdate();
});
