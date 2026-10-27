// config.ts must work both with a real config.local.json and with only the committed config.example.json.
import assert from 'node:assert/strict';
import { SITE, UPDATE_URL, CONFIGURED } from '../src/config';
import { OFF_UA } from '../src/off';
assert.ok(SITE.startsWith('https://') && SITE.endsWith('.here.now/'));
assert.ok(UPDATE_URL.startsWith(SITE) && UPDATE_URL.endsWith('/version.json'));
assert.equal(OFF_UA, 'PantryChef/0.0.5 (Android)'); // generic: no URL, slug or contact (also catches a stale version string)
assert.ok(!/https?:|here\.now|\.com/.test(OFF_UA) && !OFF_UA.includes(SITE));
// App code must never import config.local.json (Metro would bake keystorePassword etc. into the bundle)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root = join(__dirname, '..');
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? (['node_modules', 'android', 'tests', 'generated'].includes(f) ? [] : walk(p)) : /\.(tsx?|jsx?)$/.test(f) ? [p] : []; });
const code = [...walk(join(root, 'src')), ...walk(join(root, 'modules')), join(root, 'App.tsx')];
const bad = code.filter(f => /(require|import)\b[^\n]*config\.local/.test(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')));
assert.deepEqual(bad, [], 'app code must not import config.local.json: ' + bad.join(', '));
const gen = join(root, 'src/generated/appconfig.json');
try { const g = JSON.parse(readFileSync(gen, 'utf8')); assert.deepEqual(Object.keys(g).sort(), ['slug', 'updateChannelPath'], 'generated appconfig.json must hold only slug + updateChannelPath'); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
console.log(`config tests: 5 passed (${CONFIGURED ? 'real config.local.json' : 'config.example.json fallback'})`);
