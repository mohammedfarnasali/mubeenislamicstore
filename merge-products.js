/* =====================================================================
   merge-products.js
   Combines every file inside the "data" folder (quran.json, attar.json,
   janamaz.json ...) into ONE products.json that your website reads.

   Run it from your project folder:   node merge-products.js
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT = path.join(__dirname, 'products.json');
const REQUIRED = ['id', 'name', 'category', 'price', 'image'];

if (!fs.existsSync(DATA_DIR)) {
  console.error('ERROR: the "data" folder was not found next to this script.');
  process.exit(1);
}

const files = fs.readdirSync(DATA_DIR)
  .filter(f => f.toLowerCase().endsWith('.json'))
  .sort();

if (files.length === 0) {
  console.error('ERROR: no .json files found inside the "data" folder.');
  process.exit(1);
}

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
    all.push(p);
  });

  console.log(`OK  ${file}: ${list.length} products`);
});

if (hasError) {
  console.error('\nFix the errors above. products.json was NOT changed.');
  process.exit(1);
}

fs.writeFileSync(OUTPUT, JSON.stringify(all, null, 2) + '\n');
console.log(`\nDone: ${all.length} products written to products.json`);
