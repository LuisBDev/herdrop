import { defineBackground } from 'wxt/utils/define-background';
import { registerWorker } from '../background/register.ts';
import { registerSiteAccess } from '../site/registration.ts';

export default defineBackground(() => {
  registerWorker();
  registerSiteAccess();
});
