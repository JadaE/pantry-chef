// v0.0.7 "store version": the app bundle holds no deploy-specific or secret values; updates come from public GitHub Releases.
import assert from 'node:assert/strict';
import { UPDATE_URL, DOWNLOAD_RE, UPDATE_REPO_ID } from '../src/config';
import { OFF_UA } from '../src/off';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
assert.ok(Number.isInteger(UPDATE_REPO_ID) && UPDATE_REPO_ID > 0);
assert.equal(UPDATE_URL, `https://api.github.com/repositories/${UPDATE_REPO_ID}/releases/latest`);
assert.ok(DOWNLOAD_RE.test('https://github.com/Owner-1/pantry-chef/releases/download/v0.0.7/PantryChef-v0.0.7.apk') && !DOWNLOAD_RE.test('https://example.com/pantry-chef/releases/download/v1/a.apk'));
assert.equal(OFF_UA, 'PantryChef/0.0.7 (Android)'); // generic: no URL, slug or contact (also catches a stale version string)
assert.ok(!/https?:|here\.now|\.com/.test(OFF_UA));
const root = join(__dirname, '..');
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? (['node_modules', 'android', 'tests'].includes(f) ? [] : walk(p)) : /\.(tsx?|jsx?|json)$/.test(f) ? [p] : []; });
const code = [...walk(join(root, 'src')), ...walk(join(root, 'modules')), join(root, 'App.tsx')];
const src = (f: string) => readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
// App code must never import config.local.json / config.example.json / a generated config (Metro would bake values into the bundle)
const bad = code.filter(f => /(require|import)\b[^\n]*(config\.local|config\.example|generated\/)/.test(src(f)));
assert.deepEqual(bad, [], 'app code must not import deploy config: ' + bad.join(', '));
// No here.now site or secret path in app code
const hn = code.filter(f => /here\.now|(?<!api\.)github\.com\/(?!\[)[A-Za-z0-9-]+\/|api\.github\.com\/repos\//i.test(readFileSync(f, 'utf8')));
assert.deepEqual(hn, [], 'app code must not name the old private site or a GitHub account (use the repo id): ' + hn.join(', '));
assert.ok(!existsSync(join(root, 'src/generated/appconfig.json')), 'src/generated/appconfig.json must not exist (v0.0.7+)');
console.log('config tests: 7 passed');
