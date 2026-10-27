const UNSTABLE = [
  /^(css|sc|jsx|svelte|emotion|ng-tns)-/,
  /__[A-Za-z0-9_-]{5,}$/,
  /^_[A-Za-z0-9]{5,}$/,
];

function isHashLike(name: string): boolean {
  return name.length >= 6 && /\d/.test(name) && /[A-Za-z]/.test(name) && !/[-_]/.test(name);
}

function isStable(name: string): boolean {
  return !isHashLike(name) && !UNSTABLE.some((pattern) => pattern.test(name));
}

export function stableClasses(el: Element): string[] {
  return Array.from(el.classList).filter(isStable);
}
