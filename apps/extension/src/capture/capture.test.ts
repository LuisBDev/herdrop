import { expect, it } from 'vitest';
import { captureElement } from './capture';

function mount(html: string): Element {
  document.body.innerHTML = html;
  const el = document.querySelector('[data-target]');
  if (!el) throw new Error('missing target');
  return el;
}

it('capture_has_every_section', () => {
  window.history.pushState({}, '', '/dash?tab=1#top');
  document.title = 'Dashboard';
  const el = mount(
    '<main><ul class="stats"><li class="card">Revenue</li><li class="card"><p class="stat-value" data-target style="background-color: red; display: block">  $4,200\n  total </p></li><li class="card">Users</li></ul></main>',
  );
  const framework = {
    kind: 'react' as const,
    components: ['Stat', 'Card'],
    sourceFile: 'src/Stat.tsx',
  };
  const capture = captureElement(el, { selectedText: 'total', framework });
  expect(capture.page.url).toBe('http://localhost:3000/dash');
  expect(capture.page.title).toBe('Dashboard');
  expect(capture.target.tag).toBe('p');
  expect(capture.target.classes).toEqual(['stat-value']);
  expect(capture.target.selectedText).toBe('total');
  expect(capture.target.visibleText).toBe('$4,200 total');
  expect(capture.styles.background).toBe('red');
  expect(capture.styles.display).toBe('block');
  expect(capture.nearby.ancestors).toEqual(['li.card', 'ul.stats', 'main', 'body']);
  expect(capture.nearby.elements).toEqual([]);
  expect(capture.framework).toEqual(framework);
  expect(capture.html).toContain('stat-value');
});

it('budgets_truncate_long_values', () => {
  const el = mount(
    `<div class="${Array.from({ length: 30 }, (_, i) => `c${i}`).join(' ')}" data-target>${'x'.repeat(5000)}</div>`,
  );
  const framework = {
    kind: 'angular' as const,
    components: Array.from({ length: 12 }, (_, i) => `C${i}`),
    sourceFile: null,
  };
  const capture = captureElement(el, { selectedText: '', framework });
  expect(capture.target.visibleText).toHaveLength(1000);
  expect(capture.target.visibleText.endsWith('…')).toBe(true);
  expect(capture.target.classes).toHaveLength(20);
  expect(capture.framework?.components).toHaveLength(10);
});
