// Vercel serverless function: /api/p?id=PRODUCT_ID
// Gives WhatsApp / Telegram / Facebook a rich preview (photo + title + price),
// then sends real visitors to the product page on the store.

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${req.headers.host}`;

  let product = null;
  try {
    const r = await fetch(`${origin}/products.json`);
    const list = await r.json();
    product = list.find(x => String(x.id) === id);
  } catch (e) {
    /* fall through to homepage redirect */
  }

  if (!product) {
    res.statusCode = 302;
    res.setHeader('Location', origin + '/');
    return res.end();
  }

  const esc = s => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const price = '₹' + Number(product.price).toLocaleString('en-IN');
  const title = `${product.name} - ${price}`;
  const description = product.description || 'Mubeen Islamic Store - Your One-Stop Destination for Islamic Essentials';
  const image = new URL(product.image, origin + '/').href;
  const target = `${origin}/?product=${encodeURIComponent(id)}`;
  const self = `${origin}/api/p?id=${encodeURIComponent(id)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />

<meta property="og:type" content="product" />
<meta property="og:site_name" content="Mubeen Islamic Store" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:url" content="${esc(self)}" />
<meta property="product:price:amount" content="${esc(product.price)}" />
<meta property="product:price:currency" content="INR" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />

<meta http-equiv="refresh" content="0; url=${esc(target)}" />
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
<p>Opening <a href="${esc(target)}">${esc(product.name)}</a>…</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.statusCode = 200;
  res.end(html);
};
