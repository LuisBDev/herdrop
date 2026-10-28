#!/bin/sh
set -eu

fail() {
  echo "herdrop: $*" >&2
  exit 1
}

plugin_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
version=$(sed -n 's/^version *= *"\([^"]*\)".*/\1/p' "$plugin_dir/herdr-plugin.toml" | head -n 1)
[ -n "$version" ] || fail "herdr-plugin.toml declares no version"

case "$(uname -m)" in
  x86_64 | amd64) binary_asset=herdrop-x86_64-unknown-linux-musl ;;
  *) fail "no prebuilt herdrop for $(uname -m)" ;;
esac
extension_asset=herdrop-extension.tar.gz
release_url="${HERDROP_RELEASE_BASE:-https://github.com/LuisBDev/herdrop/releases/download}"
release_url="${release_url%/}/v$version"

work="$plugin_dir/target/release-download"
rm -rf "$work"
mkdir -p "$work/extension"

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$work/$1" "$release_url/$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$work/$1" "$release_url/$1"
  else
    fail "curl or wget is required"
  fi
}

for name in SHA256SUMS "$binary_asset" "$extension_asset"; do
  download "$name" || fail "cannot download $release_url/$name"
done

for name in "$binary_asset" "$extension_asset"; do
  expected=$(awk -v name="$name" '$2 == name || $2 == "*" name { print tolower($1); exit }' "$work/SHA256SUMS")
  [ -n "$expected" ] || fail "SHA256SUMS for v$version lists no $name"
  actual=$(sha256sum "$work/$name" | cut -d ' ' -f 1)
  [ "$actual" = "$expected" ] || fail "$name does not match SHA256SUMS: expected $expected, got $actual"
done

tar -xzf "$work/$extension_asset" -C "$work/extension"
[ -f "$work/extension/manifest.json" ] || fail "$extension_asset has no manifest.json at its root"

mkdir -p "$plugin_dir/target/release"
chmod 755 "$work/$binary_asset"
mv -f "$work/$binary_asset" "$plugin_dir/target/release/herdrop"
rm -rf "$plugin_dir/extension"
mv "$work/extension" "$plugin_dir/extension"
rm -rf "$work"
echo "herdrop v$version installed from $release_url"
