import { act, createElement, forwardRef, memo } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { angularComponents } from './angular';
import { reactComponents } from './react';

const StatCard = forwardRef<HTMLParagraphElement>(function StatCard(_props, ref) {
  return createElement('p', { ref }, 'Total');
});

const InvoiceList = memo(function InvoiceList() {
  return createElement(StatCard);
});

function App() {
  return createElement(InvoiceList);
}

it('reads_react_component_chain', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(App));
  });
  const p = container.querySelector('p') as Element;
  expect(reactComponents(p)).toEqual({
    kind: 'react',
    components: ['App', 'InvoiceList', 'StatCard'],
    sourceFile: null,
  });
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

it('angular_components_table', () => {
  class InvoiceListComponent {}
  class StatCardComponent {}
  const host = document.createElement('app-invoice-list');
  const child = document.createElement('app-stat-card');
  const leaf = document.createElement('span');
  host.append(document.createElement('div'));
  host.firstElementChild?.append(child);
  child.append(leaf);
  document.body.append(host);
  const instances = new Map<Element, object>([
    [host, new InvoiceListComponent()],
    [child, new StatCardComponent()],
  ]);
  const ng = { getComponent: (node: Element) => instances.get(node) ?? null };
  expect(angularComponents(leaf, ng)).toEqual({
    kind: 'angular',
    components: ['InvoiceListComponent', 'StatCardComponent'],
    sourceFile: null,
  });
  expect(angularComponents(leaf, undefined)).toBeNull();
  host.remove();
});
