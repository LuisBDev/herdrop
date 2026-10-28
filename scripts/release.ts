import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
const CARGO_TOML = 'apps/bridge/Cargo.toml';
const TOP_LEVEL_VERSION = /^(version = ")([^"]+)(")$/gm;

const SITES: { file: string; pattern: RegExp }[] = [
  { file: CARGO_TOML, pattern: TOP_LEVEL_VERSION },
  {
    file: 'apps/bridge/Cargo.lock',
    pattern: /^(\[\[package\]\]\nname = "herdrop"\nversion = ")([^"]+)(")$/gm,
  },
  { file: 'apps/bridge/herdr-plugin.toml', pattern: TOP_LEVEL_VERSION },
];

function fail(message: string): never {
  console.error(`release: ${message}`);
  process.exit(1);
}

function git(...args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) {
    fail(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

function versionIn(file: string, pattern: RegExp): { text: string; version: string } {
  const text = readFileSync(join(ROOT, file), 'utf8');
  const found = [...text.matchAll(pattern)];
  const version = found[0]?.[2];
  if (found.length !== 1 || version === undefined) {
    fail(`${file}: expected one herdrop version, found ${found.length}`);
  }
  return { text, version };
}

const version = process.argv[2] ?? '';
if (!SEMVER.test(version)) fail('usage: bun run release <major.minor.patch[-prerelease]>');
const tag = `v${version}`;

if (git('status', '--porcelain') !== '') fail('commit or stash your changes first');
if (git('tag', '--list', tag) !== '') fail(`${tag} already exists`);

const current = versionIn(CARGO_TOML, TOP_LEVEL_VERSION).version;
if (current === version) fail(`the version is already ${version}`);

const bumped = SITES.map(({ file, pattern }) => {
  const site = versionIn(file, pattern);
  if (site.version !== current) {
    fail(`${file} says ${site.version}, but ${CARGO_TOML} says ${current}`);
  }
  return { file, text: site.text.replace(pattern, `$1${version}$3`) };
});
for (const { file, text } of bumped) writeFileSync(join(ROOT, file), text);

git('add', ...SITES.map((site) => site.file));
git('commit', '--quiet', '-m', `chore(release): ${tag}`);
git('tag', '--annotate', tag, '-m', tag);

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
console.log(`Committed chore(release): ${tag} and tagged ${tag} on ${branch}.`);
if (branch !== 'master') {
  console.log('The release workflow publishes only tags whose commit is on master.');
}
console.log(`Publish with: git push --atomic origin ${branch} ${tag}`);
