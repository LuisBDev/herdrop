import { extname, join, normalize, sep } from 'node:path';

const [rootArg, portArg] = process.argv.slice(2);
if (!rootArg || !portArg) {
  console.error('usage: bun e2e/fixtures/serve.ts <root> <port>');
  process.exit(1);
}

const root = normalize(join(process.cwd(), rootArg));
const indexPath = join(root, 'index.html');

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveInside(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const target = normalize(join(root, decoded));
  if (target !== root && !target.startsWith(root + sep)) {
    return null;
  }
  return target;
}

function respond(path: string): Response {
  return new Response(Bun.file(path), {
    headers: { 'content-type': contentTypes[extname(path)] ?? 'application/octet-stream' },
  });
}

Bun.serve({
  port: Number(portArg),
  async fetch(request) {
    const target = resolveInside(new URL(request.url).pathname);
    if (target === null) {
      return new Response('Not found', { status: 404 });
    }
    if (target !== root && (await Bun.file(target).exists())) {
      return respond(target);
    }
    return respond(indexPath);
  },
});
