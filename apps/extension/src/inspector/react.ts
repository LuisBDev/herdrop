import type { FrameworkInfo } from '../capture/types';

type Fiber = { type: unknown; return: Fiber | null };

const FIBER_PREFIX = '__reactFiber$';

function functionName(fn: unknown): string | undefined {
  if (typeof fn !== 'function') return undefined;
  const named = fn as { displayName?: unknown; name?: unknown };
  const name = named.displayName ?? named.name;
  return typeof name === 'string' ? name : undefined;
}

function componentName(type: unknown): string | undefined {
  if (typeof type === 'function') return functionName(type);
  if (typeof type !== 'object' || type === null) return undefined;
  const wrapper = type as { displayName?: unknown; render?: unknown; type?: unknown };
  const inner = functionName(wrapper.render) ?? functionName(wrapper.type);
  if (inner === undefined) return undefined;
  return typeof wrapper.displayName === 'string' ? wrapper.displayName : inner;
}

function wrapsPrevious(type: unknown, previous: unknown): boolean {
  if (previous === undefined || typeof type !== 'object' || type === null) return false;
  return (type as { type?: unknown }).type === previous;
}

export function reactComponents(el: Element): FrameworkInfo | null {
  const key = Object.keys(el).find((k) => k.startsWith(FIBER_PREFIX));
  if (!key) return null;
  const components: string[] = [];
  let previous: unknown;
  for (
    let fiber = (el as unknown as Record<string, Fiber | undefined>)[key] ?? null;
    fiber;
    fiber = fiber.return
  ) {
    const name = wrapsPrevious(fiber.type, previous) ? undefined : componentName(fiber.type);
    if (name && !name.startsWith('_')) components.unshift(name);
    previous = fiber.type;
  }
  return components.length > 0 ? { kind: 'react', components, sourceFile: null } : null;
}
