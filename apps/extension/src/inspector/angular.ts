import type { FrameworkInfo } from '../capture/types';

type GetComponent = (element: Element) => unknown;

function getComponentOf(ng: unknown): GetComponent | null {
  if (typeof ng !== 'object' || ng === null) return null;
  const fn = (ng as { getComponent?: unknown }).getComponent;
  return typeof fn === 'function' ? (fn as GetComponent) : null;
}

function constructorName(instance: unknown): string | undefined {
  if (typeof instance !== 'object' || instance === null) return undefined;
  const name = (instance as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

export function angularComponents(el: Element, ng: unknown): FrameworkInfo | null {
  const getComponent = getComponentOf(ng);
  if (!getComponent) return null;
  const components: string[] = [];
  for (let node: Element | null = el; node; node = node.parentElement) {
    const name = constructorName(getComponent(node));
    if (name) components.unshift(name);
  }
  return components.length > 0 ? { kind: 'angular', components, sourceFile: null } : null;
}
