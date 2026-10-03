#!/usr/bin/env node
// Rewrites jsDelivr / unpkg <script>/<link> URLs in a project's HTML files to
// local copies under <project>/vendor/, fetched from the npm registry.
// The web sandbox blocks those CDNs (the render fails with
// "sub_timeline_script_failure"), but registry.npmjs.org is reachable.
//
//   node localize-cdn.mjs <project-dir>
//
// Idempotent: already-local paths are left alone; re-running is a no-op.
import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative} from 'node:path';

const root = process.argv[2];
if (!root || !existsSync(root)) {
  console.error('usage: node localize-cdn.mjs <project-dir>');
  process.exit(2);
}

const CDN = /https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/((?:@[\w.-]+\/)?[\w.-]+)@([\w.-]+)\/([^"'\s)]+)/g;

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'vendor' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const cache = mkdtempSync(join(tmpdir(), 'localize-cdn-'));
const fetched = new Set();
let rewrites = 0;

for (const file of htmlFiles(root)) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(CDN, (url, pkg, ver, path) => {
    const spec = `${pkg}@${ver}`;
    // Copy the whole package, not just the referenced file: ES modules import
    // their siblings relatively (three's examples/jsm pulls in Pass.js etc.).
    const pkgDir = join(root, 'vendor', pkg);
    const dest = join(pkgDir, path);
    if (!existsSync(dest)) {
      if (!fetched.has(spec)) {
        execFileSync('npm', ['install', '--no-save', '--silent', '--prefix', cache, spec], {stdio: 'inherit'});
        fetched.add(spec);
        mkdirSync(dirname(pkgDir), {recursive: true});
        cpSync(join(cache, 'node_modules', pkg), pkgDir, {recursive: true});
      }
      if (!existsSync(dest)) {
        console.error(`not in the npm package: ${spec}/${path} — left as ${url}`);
        return url;
      }
    }
    rewrites++;
    return relative(dirname(file), dest).split('\\').join('/');
  });
  if (out !== src) writeFileSync(file, out);
}

console.log(`localized ${rewrites} CDN reference(s)`);
