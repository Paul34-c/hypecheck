// Récupère les prix de revente de chaque article et construit l'historique.
const fs = require('fs');
const SneaksAPI = require('sneaks-api');
const sneaks = new SneaksAPI();

const OUT = 'data/prices.json';
const articles = JSON.parse(fs.readFileSync('articles.json', 'utf8'));
fs.mkdirSync('data', { recursive: true });
const data = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getProduct(styleId) {
  const call = new Promise((resolve, reject) => {
    sneaks.getProductPrices(styleId, (err, product) => (err ? reject(err) : resolve(product)));
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('délai dépassé (45 s)')), 45000));
  return Promise.race([call, timeout]);
}

// Prix le plus bas par site de revente, quelle que soit la forme des données reçues.
function lowestBySite(product) {
  const out = {};
  const direct = product && product.lowestResellPrice;
  if (direct && typeof direct === 'object') {
    for (const [site, v] of Object.entries(direct)) {
      if (typeof v === 'number' && v > 0) out[site] = v;
    }
  }
  const bySize = product && product.resellPrices;
  if (bySize && typeof bySize === 'object') {
    for (const [site, sizes] of Object.entries(bySize)) {
      if (out[site] || !sizes || typeof sizes !== 'object') continue;
      const nums = Object.values(sizes).filter((v) => typeof v === 'number' && v > 0);
      if (nums.length) out[site] = Math.min(...nums);
    }
  }
  return out;
}

(async () => {
  const today = new Date().toISOString().slice(0, 10);
  let ok = 0;
  for (const a of articles) {
    try {
      const product = await getProduct(a.styleId);
      const prices = lowestBySite(product);
      if (!Object.keys(prices).length) throw new Error('aucun prix reçu');
      const item = data[a.id] || { styleId: a.styleId, history: [] };
      item.links = (product && product.resellLinks) || item.links || {};
      item.history = item.history.filter((h) => h.date !== today);
      item.history.push({ date: today, currency: 'USD', prices });
      data[a.id] = item;
      ok++;
      console.log('OK  ', a.id, JSON.stringify(prices));
    } catch (e) {
      console.log('ECHEC', a.id, '-', e.message);
    }
    await sleep(5000);
  }
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
  console.log(`${ok}/${articles.length} articles mis à jour`);
  if (ok === 0) process.exit(1);
})();
