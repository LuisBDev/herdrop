import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'happy-dom',
  },
});
