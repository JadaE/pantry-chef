// Live smoke test of the recipe pipeline against TheMealDB (network). AsyncStorage is mocked in memory.
const mem = new Map<string, string>();
const mock = { getItem: async (k: string) => mem.get(k) ?? null, setItem: async (k: string, v: string) => { mem.set(k, v); }, getAllKeys: async () => [...mem.keys()], multiRemove: async (ks: string[]) => ks.forEach(k => mem.delete(k)) };
const p = require.resolve('@react-native-async-storage/async-storage');
require.cache[p] = { id: p, filename: p, loaded: true, exports: { __esModule: true, default: mock } } as any;
(async () => {
  const { buildCandidates, recipeDetail } = require('../src/recipes');
  const L = require('../src/logic');
  const items = ['Chicken Breasts', 'Eggs', 'Rice', 'Garlic', 'Onion', 'Milk', 'Butter', 'Spinach'].map((name, i) => ({ id: String(i), name, category: 'Other', quantity: 1, unit: 'pcs', percentLeft: 100, purchasedOn: null, expiresOn: null, photoUri: null, notes: '', createdAt: 0, updatedAt: 0 }));
  const t0 = Date.now();
  const { byCat, cats } = await buildCandidates(items, []);
  console.log('cats', cats.length, 'ms', Date.now() - t0);
  for (const c of cats) {
    const top = L.pickForCategory(byCat[c], 0); if (!top) { console.log(c, '-'); continue; }
    const d = await recipeDetail(top.id); const cov = L.recipeCoverage(d, L.pantryNames(items), true);
    console.log(`${c.padEnd(14)} hits=${top.hits} ${top.name} | have ${cov.have}/${cov.total} | steps ${L.splitSteps(d.instructions).length}`);
  }
  const profiles = [{ ...L.newProfile('Person A'), dislikes: ['cucumber'] }, { ...L.newProfile('Person B'), dislikes: ['banana'] }];
  let skipped = 0;
  for (const c of cats) for (const cand of (byCat[c] || []).slice(0, 6)) { const d = await recipeDetail(cand.id); const cf = L.recipeConflicts(d, profiles); if (cf.length) { skipped++; console.log('  skip', c, '|', d.name, '|', L.conflictText(cf)); } else break; }
  console.log('skipped (household A: cucumber, B: banana):', skipped);
  const t1 = Date.now(); await buildCandidates(items, []); console.log('cached rebuild ms', Date.now() - t1);
})();
