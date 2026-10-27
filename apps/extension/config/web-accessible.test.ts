import { expect, it } from 'vitest';
import { widenContentScriptCss } from './web-accessible.ts';

const LOOPBACK = ['http://127.0.0.1/*'];

it('widens_only_content_script_css_entries', () => {
  const manifest = {
    web_accessible_resources: [
      {
        resources: ['content-scripts/capture.css'],
        use_dynamic_url: true,
        matches: [...LOOPBACK],
      },
      { resources: ['icon.png'], matches: [...LOOPBACK] },
    ],
  };

  widenContentScriptCss(manifest);

  expect(manifest.web_accessible_resources).toEqual([
    {
      resources: ['content-scripts/capture.css'],
      use_dynamic_url: true,
      matches: ['http://*/*', 'https://*/*'],
    },
    { resources: ['icon.png'], matches: LOOPBACK },
  ]);
});
