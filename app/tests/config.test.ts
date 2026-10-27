// config.ts must work both with a real config.local.json and with only the committed config.example.json.
import assert from 'node:assert/strict';
import { SITE, UPDATE_URL, CONFIGURED } from '../src/config';
import { OFF_UA } from '../src/off';
assert.ok(SITE.startsWith('https://') && SITE.endsWith('.here.now/'));
assert.ok(UPDATE_URL.startsWith(SITE) && UPDATE_URL.endsWith('/version.json'));
assert.ok(OFF_UA.startsWith('PantryChef/') && OFF_UA.includes(SITE));
console.log(`config tests: 3 passed (${CONFIGURED ? 'real config.local.json' : 'config.example.json fallback'})`);
