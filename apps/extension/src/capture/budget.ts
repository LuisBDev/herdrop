import { truncate } from '../render/label.ts';

export const BUDGETS = {
  url: 2000,
  title: 200,
  selector: 500,
  readablePath: 300,
  domPath: 1000,
  classes: { count: 20, length: 64 },
  selectedText: 1000,
  visibleText: 1000,
  html: 4000,
  role: 64,
  name: 200,
  style: 200,
  nearbyText: { count: 5, length: 200 },
  nearbyElements: { count: 8, length: 120 },
  ancestors: { count: 12, length: 120 },
  components: { count: 10, length: 80 },
  sourceFile: 300,
} as const;

export function limitList(items: string[], budget: { count: number; length: number }): string[] {
  return items.slice(0, budget.count).map((item) => truncate(item, budget.length));
}
