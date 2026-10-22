/* =====================================================================
   merge-products.js
   Combines every file inside the "data" folder into ONE products.json.

   FILE ORDER = PRODUCT ORDER
   Name your files with a prefix to control the sequence:
       data/A_products.json   -> comes first
       data/B_perfumes.json   -> comes next
       data/C_janamaz.json    -> then this
   Numbers work too (natural order): 1_quran.json, 2_attar.json, 10_misc.json

   Run it from your project folder:   node merge-products.js
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT = path.join(__dirname, 'products.json');
const REQUIRED = ['id', 'name', 'category', 'price', 'image'];

/* ---------------------------------------------------------------------
   CATEGORY ORDER - edit this list to change which category shows first.
   Names must match the "category" value in your products EXACTLY
   (case-insensitive, but spelling must be the same).
   Categories not in this list go to the end.
   --------------------------------------------------------------------- */
const CATEGORY_ORDER = [
  'Legacy Attars',
  'Miswak'
];

if (!fs.existsSync(DATA_DIR)) {
  console.error('ERROR: the "data" folder was not found next to this script.');
  process.exit(1);
}

// Natural, case-insensitive sort: A_ before B_, and 2_ before 10_
const files = fs.readdirSync(DATA_DIR)
  .filter(f => f.toLowerCase().endsWith('.json'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

if (files.length === 0) {
  console.error('ERROR: no .json files found inside the "data" folder.');
  process.exit(1);
}

console.log('Merge order:');
files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
console.log('');

const all = [];
const seenIds = new Map(); // id -> file it first appeared in
let hasError = false;

files.forEach(file => {
  let list;
  try {
    list = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  } catch (e) {
    console.error(`ERROR in ${file}: not valid JSON (${e.message})`);
    hasError = true;
    return;
  }
  if (!Array.isArray(list)) {
    console.error(`ERROR in ${file}: it must start with [ and end with ] (a list of products).`);
    hasError = true;
    return;
  }

  list.forEach((p, i) => {
    const label = `${file}, product #${i + 1}${p && p.name ? ' (' + p.name + ')' : ''}`;
    if (!p || typeof p !== 'object') {
      console.error(`ERROR in ${label}: not a product object.`);
      hasError = true;
      return;
    }
    const missing = REQUIRED.filter(k => p[k] === undefined || p[k] === null || p[k] === '');
    if (missing.length) {
      console.error(`ERROR in ${label}: missing ${missing.join(', ')}`);
      hasError = true;
      return;
    }
    const id = String(p.id);
    if (seenIds.has(id)) {
      console.error(`ERROR in ${label}: id "${id}" is already used in ${seenIds.get(id)}. IDs must be unique.`);
      hasError = true;
      return;
    }
    seenIds.set(id, file);
    all.push(p); // pushed in file order, then product order inside each file
  });

  console.log(`OK  ${file}: ${list.length} products`);
});

if (hasError) {
  console.error('\nFix the errors above. products.json was NOT changed.');
  process.exit(1);
}

// Sort by CATEGORY_ORDER. Ties keep file order (then product order inside the file).
const rank = c => {
  const i = CATEGORY_ORDER.findIndex(x => x.toLowerCase() === String(c).trim().toLowerCase());
  return i === -1 ? CATEGORY_ORDER.length : i;
};
all.sort((a, b) => rank(a.category) - rank(b.category));

// Warn about categories that are not in the list (likely typos)
const unlisted = [...new Set(all.map(p => p.category))].filter(c => rank(c) === CATEGORY_ORDER.length);
if (unlisted.length) {
  console.warn(`\nNote: these categories are not in CATEGORY_ORDER, so they were placed last: ${unlisted.join(', ')}`);
}

console.log('\nCategory order in products.json:');
[...new Set(all.map(p => p.category))].forEach((c, i) => console.log(`  ${i + 1}. ${c}`));

fs.writeFileSync(OUTPUT, JSON.stringify(all, null, 2) + '\n');
console.log(`\nDone: ${all.length} products written to products.json`);