// Vercel serverless function: /api/p?id=PRODUCT_ID
// Gives WhatsApp / Telegram / Facebook a rich preview (photo + title + price),
// then sends real visitors to the product page on the store.

// WhatsApp is unreliable with .webp preview images. If a .jpg/.jpeg/.png copy
// with the same name exists next to the .webp, use that copy for the preview instead.
async function pickShareImage(imagePath, origin) {
  const original = new URL(imagePath, origin + '/').href;
  if (!/\.webp(\?.*)?$/i.test(original)) return original;
  for (const ext of ['jpg', 'jpeg', 'png']) {
    const candidate = original.replace(/\.webp(\?.*)?$/i, '.' + ext);
    try {
      const r = await fetch(candidate, { method: 'HEAD' });
      const type = r.headers.get('content-type') || '';
      if (r.ok && type.startsWith('image/')) return candidate;
    } catch (e) { /* try the next extension */ }
  }
  return original;
}

function imageMime(url) {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

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
  const image = await pickShareImage(product.image, origin);
  const target = `${origin}/?product=${encodeURIComponent(id)}`;
  const self = `${origin}/api/p?id=${encodeURIComponent(id)}`;

  // FIX: the old page used <meta http-equiv="refresh" content="0">. WhatsApp/Facebook
  // crawlers follow that redirect, land on the homepage (which has no og:image) and
  // show only the link + title. Now the redirect is JavaScript-only: real visitors are
  // redirected, but crawlers (which don't run JS) stay on this page and read the photo.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />

<meta property="og:type" content="product" />
<meta property="og:site_name" content="Mubeen Islamic Store" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:image:secure_url" content="${esc(image)}" />
<meta property="og:image:type" content="${imageMime(image)}" />
<meta property="og:image:alt" content="${esc(product.name)}" />
<meta property="og:url" content="${esc(self)}" />
<meta property="product:price:amount" content="${esc(product.price)}" />
<meta property="product:price:currency" content="INR" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />

<link rel="image_src" href="${esc(image)}" />
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
<p>Opening <a href="${esc(target)}">${esc(product.name)}</a>...</p>
<noscript><p><a href="${esc(target)}">Continue to the store</a></p></noscript>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.statusCode = 200;
  res.end(html);
};