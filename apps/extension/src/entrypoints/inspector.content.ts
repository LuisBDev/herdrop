import { defineContentScript } from 'wxt/utils/define-content-script';
import { serveInspector } from '../inspector/channel';

export default defineContentScript({
  matches: ['http://127.0.0.1/*'],
  world: 'MAIN',
  registration: 'runtime',
  runAt: 'document_start',
  main() {
    serveInspector(window);
  },
});
