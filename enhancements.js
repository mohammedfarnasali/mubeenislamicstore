/* =====================================================================
   Mubeen Islamic Store - enhancements.js
   Add-on script. It does NOT modify any existing code.

   TASK 1: Tap a product card -> large popup over a blurred background
           showing the full name, full description, price, big photo.
   TASK 2: Products with a "sizes" list in products.json require a size.
           The chosen size is added to the WhatsApp message (and the
           Web3Forms email text) that the shop owner receives.

   Install: add ONE line just before </body> in index.html,
            after the existing big <script> block:
            <script src="enhancements.js"></script>
   ===================================================================== */
(function () {
  "use strict";

  var SIZE_KEY = 'mubeen_sizes';   // { productId: "M" }
  var CART_KEY = 'noor_cart';      // same key the store already uses
  var PRODUCTS = [];
  var allowAdd = false;            // lets the popup trigger the store's own Add button

  /* ---------------- helpers ---------------- */
  function readJSON(key) {
    try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : {}; }
    catch (e) { return {}; }
  }
  function getSizes() { return readJSON(SIZE_KEY); }
  function setSize(id, size) {
    var s = getSizes(); s[id] = size;
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function getCart() { return readJSON(CART_KEY); }
  // ADDED (CART FIX): cart keys are "productId::size" for products with sizes, "productId" otherwise
  function keyParts(key) {
    var i = String(key).indexOf('::');
    return i > -1 ? { id: String(key).slice(0, i), size: String(key).slice(i + 2) }
                  : { id: String(key), size: '' };
  }
  function byId(id) {
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (String(PRODUCTS[i].id) === String(id)) return PRODUCTS[i];
    }
    return null;
  }
  function sizesOf(p) {
    return p && Array.isArray(p.sizes) ? p.sizes.filter(Boolean).map(String) : [];
  }
  function fmt(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  function cssEsc(s) { return (window.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s); }

  /* ADDED (TASK 4): size-wise prices.
     products.json:  "sizePrices": { "S": 100, "M": 150, "L": 180, "XL": 200 } */
  function sizePriceOf(p, size) {
    if (!p || !p.sizePrices || size == null || size === '') return null;
    var v = Number(p.sizePrices[size]);
    return isNaN(v) ? null : v;
  }
  function priceText(p, size) {
    var exact = sizePriceOf(p, size);
    if (exact !== null) return fmt(exact);
    if (p && p.sizePrices && typeof p.sizePrices === 'object') {
      var keys = sizesOf(p).length ? sizesOf(p) : Object.keys(p.sizePrices);
      var vals = keys.map(function (k) { return Number(p.sizePrices[k]); })
                     .filter(function (v) { return !isNaN(v); });
      if (vals.length) {
        var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
        return lo === hi ? fmt(lo) : 'From ' + fmt(lo) + ' (select a size)';
      }
    }
    return fmt(p.price);
  }
  /* ADDED (TASK 1): same "unavailable" rule as index.html */
  function isUnavailable(p) {
    return !!p && (p.available === false ||
      /not\s*available|unavailable|out\s*of\s*stock|sold\s*out/i.test(String(p.badge || '')));
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add('hidden'); }, 2600);
  }

  /* ---------------- load products (for names / sizes) ---------------- */
  fetch('products.json')
    .then(function (r) { return r.json(); })
    .then(function (d) { PRODUCTS = d; decorateCart(); })
    .catch(function (e) { console.error('enhancements: could not load products.json', e); });

  /* ---------------- styles ---------------- */
  var style = document.createElement('style');
  style.textContent =
    '#productGrid article{cursor:pointer}' +
    '#productModal{-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}' +
    '@keyframes pmShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}' +
    '.pm-shake{animation:pmShake .3s ease}';
  document.head.appendChild(style);

  /* ---------------- BUG FIX 1: page zooms in when typing on mobile ----------------
     Mobile browsers (especially iPhone Safari) zoom the page when a text box with a
     font smaller than 16px is tapped, and they stay zoomed after the keyboard closes.
     Making every text box 16px on phones/tablets stops that zoom. */
  var zoomFix = document.createElement('style');
  zoomFix.textContent =
    '@media (max-width:1023px){' +
      'input,textarea,select{font-size:16px !important}' +
    '}';
  document.head.appendChild(zoomFix);

  /* ---------------- popup (TASK 1 + size picker) ---------------- */
  var modal = document.createElement('div');
  modal.id = 'productModal';
  modal.className = 'hidden fixed inset-0 z-[55] items-center justify-center px-3 py-4';
  modal.style.background = 'rgba(43,38,32,0.45)';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML =
    '<div id="pmCard" class="relative bg-cream rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto toast-in">' +
      '<button type="button" id="pmClose" aria-label="Close" class="absolute top-3 right-3 z-10 grid place-items-center w-9 h-9 rounded-full bg-white/90 text-emerald-900 shadow-card hover:bg-white">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      '</button>' +
      '<div id="pmGallery" class="relative aspect-square bg-sand overflow-hidden rounded-t-2xl" style="touch-action:pan-y">' +
        '<img id="pmImg" alt="" draggable="false" class="w-full h-full object-cover" />' +
        '<button type="button" id="pmPrev" aria-label="Previous photo" class="hidden absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 text-emerald-900 shadow-card items-center justify-center">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>' +
        '</button>' +
        '<button type="button" id="pmNext" aria-label="Next photo" class="hidden absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 text-emerald-900 shadow-card items-center justify-center">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>' +
        '</button>' +
        '<span id="pmCount" class="hidden absolute bottom-2 right-3 text-[11px] font-semibold bg-ink/60 text-cream rounded-full px-2 py-0.5"></span>' +
      '</div>' +
      '<div id="pmThumbs" class="hidden gap-2 px-5 pt-3 overflow-x-auto no-scrollbar"></div>' +
      '<div class="p-5">' +
        '<span id="pmCat" class="text-[11px] uppercase tracking-wide text-gold-700 font-semibold"></span>' +
        '<h3 id="pmName" class="font-display text-2xl text-emerald-900 leading-snug mt-1"></h3>' +
        '<p id="pmPrice" class="font-bold text-emerald-900 text-xl mt-1"></p>' +
        '<p id="pmDesc" class="text-sm text-ink-soft mt-3 whitespace-pre-line"></p>' +
        '<div id="pmSizeBox" class="hidden mt-4">' +
          '<p class="text-sm font-semibold text-ink mb-2">Select size <span class="text-red-600">*</span></p>' +
          '<div id="pmSizes" class="flex flex-wrap gap-2"></div>' +
          '<p id="pmSizeErr" class="hidden text-xs text-red-600 mt-2">Please select a size to continue.</p>' +
          '<p id="pmSizeNote" class="hidden text-xs text-gold-700 mt-2"></p>' +
        '</div>' +
        '<button type="button" id="pmAdd" class="mt-5 w-full rounded-full bg-emerald-900 text-cream font-semibold py-3 hover:bg-emerald-700 transition-colors">Add to Cart</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  var pm = {
    img: modal.querySelector('#pmImg'),
    gallery: modal.querySelector('#pmGallery'),
    prev: modal.querySelector('#pmPrev'),
    next: modal.querySelector('#pmNext'),
    count: modal.querySelector('#pmCount'),
    thumbs: modal.querySelector('#pmThumbs'),
    cat: modal.querySelector('#pmCat'),
    name: modal.querySelector('#pmName'),
    price: modal.querySelector('#pmPrice'),
    desc: modal.querySelector('#pmDesc'),
    sizeBox: modal.querySelector('#pmSizeBox'),
    sizes: modal.querySelector('#pmSizes'),
    sizeErr: modal.querySelector('#pmSizeErr'),
    sizeNote: modal.querySelector('#pmSizeNote'),
    add: modal.querySelector('#pmAdd'),
    close: modal.querySelector('#pmClose'),
    card: modal.querySelector('#pmCard')
  };
  var current = null; // { p, size }
  var photos = [], photoIdx = 0;

  /* Photos: the product's "image" first, then any extra photos listed in "images" */
  function photoList(p) {
    var list = [];
    if (p.image) list.push(p.image);
    if (Array.isArray(p.images)) {
      p.images.forEach(function (u) { if (u && list.indexOf(u) === -1) list.push(u); });
    }
    return list;
  }
  function showPhoto(i) {
    if (!photos.length) { pm.img.removeAttribute('src'); return; }
    photoIdx = (i + photos.length) % photos.length;
    pm.img.src = photos[photoIdx];
    pm.count.textContent = (photoIdx + 1) + ' / ' + photos.length;
    var t = pm.thumbs.children;
    for (var k = 0; k < t.length; k++) {
      t[k].className = 'shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 ' +
        (k === photoIdx ? 'border-emerald-900' : 'border-sand');
    }
  }
  function setupPhotos(p) {
    photos = photoList(p);
    pm.img.alt = p.name || '';
    var multi = photos.length > 1;
    pm.thumbs.innerHTML = '';
    if (multi) {
      photos.forEach(function (u, k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Photo ' + (k + 1));
        var im = document.createElement('img');
        im.src = u; im.alt = '';
        im.className = 'w-full h-full object-cover';
        b.appendChild(im);
        b.addEventListener('click', function () { showPhoto(k); });
        pm.thumbs.appendChild(b);
      });
    }
    pm.thumbs.classList.toggle('hidden', !multi);
    pm.thumbs.classList.toggle('flex', multi);
    pm.prev.classList.toggle('hidden', !multi);
    pm.prev.classList.toggle('flex', multi);
    pm.next.classList.toggle('hidden', !multi);
    pm.next.classList.toggle('flex', multi);
    pm.count.classList.toggle('hidden', !multi);
    showPhoto(0);
  }

  function paintChips() {
    var chips = pm.sizes.children;
    for (var i = 0; i < chips.length; i++) {
      var on = chips[i].getAttribute('data-size') === current.size;
      chips[i].className =
        'min-w-[44px] rounded-full border px-4 py-2 text-sm font-semibold transition-colors ' +
        (on ? 'bg-emerald-900 border-emerald-900 text-cream'
            : 'bg-white border-sand text-ink hover:border-emerald-500');
      chips[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function openModal(p) {
    var list = sizesOf(p);
    var cart = getCart();
    var saved = getSizes()[p.id];
    // CHANGED (CART FIX): the customer picks the size each time; every size becomes its own cart line
    current = { p: p, size: '' };

    setupPhotos(p);
    pm.cat.textContent = p.category || '';
    pm.name.textContent = p.name || '';
    pm.price.textContent = priceText(p, current.size); // CHANGED (TASK 4): price follows the size
    pm.desc.textContent = p.description || '';
    pm.sizeErr.classList.add('hidden');
    pm.sizeNote.classList.add('hidden');

    // ADDED (TASK 1): unavailable products cannot be added from the popup either
    var na = isUnavailable(p);
    pm.add.disabled = na;
    pm.add.textContent = na ? 'Currently Not Available' : 'Add to Cart';
    pm.add.classList.toggle('opacity-50', na);
    pm.add.classList.toggle('cursor-not-allowed', na);

    pm.sizes.innerHTML = '';
    if (list.length) {
      list.forEach(function (s) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-size', s);
        // CHANGED (TASK 4): the chip shows the size and, when prices differ, its price
        var sp = sizePriceOf(p, s);
        b.textContent = (sp !== null && p.sizePrices) ? (s + ' · ' + fmt(sp)) : s;
        b.addEventListener('click', function () {
          current.size = s;
          pm.sizeErr.classList.add('hidden');
          pm.price.textContent = priceText(p, s); // CHANGED (TASK 4)
          paintChips();
        });
        pm.sizes.appendChild(b);
      });
      paintChips();
      pm.sizeBox.classList.remove('hidden');
      // CHANGED (CART FIX): show which sizes of this product are already in the cart
      var inCart = [];
      Object.keys(cart).forEach(function (k) {
        var parts = keyParts(k);
        if (parts.id === String(p.id) && parts.size) inCart.push(parts.size + ' ×' + cart[k]);
      });
      if (inCart.length) {
        pm.sizeNote.textContent = 'Already in your cart: ' + inCart.join(', ') +
          '. Each size is added as a separate item.';
        pm.sizeNote.classList.remove('hidden');
      }
    } else {
      pm.sizeBox.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    pm.card.scrollTop = 0;
  }

  function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
    current = null;
  }

  function addFromModal() {
    if (!current) return;
    var p = current.p;
    if (isUnavailable(p)) { toast('Sorry, this product is currently not available'); return; } // ADDED (TASK 1)
    if (sizesOf(p).length) {
      if (!current.size) {
        pm.sizeErr.classList.remove('hidden');
        pm.sizes.classList.remove('pm-shake');
        void pm.sizes.offsetWidth;
        pm.sizes.classList.add('pm-shake');
        return;
      }
      setSize(p.id, current.size);
    }
    // Use the store's own Add button so the cart logic stays untouched
    var btn = document.querySelector('#productGrid [data-add="' + cssEsc(p.id) + '"]');
    if (btn) {
      allowAdd = true;
      try { btn.click(); } finally { allowAdd = false; }
      closeModal();
    } else {
      toast('Please try again from the product list.');
      closeModal();
    }
  }

  pm.add.addEventListener('click', addFromModal);
  pm.close.addEventListener('click', closeModal);
  pm.prev.addEventListener('click', function () { showPhoto(photoIdx - 1); });
  pm.next.addEventListener('click', function () { showPhoto(photoIdx + 1); });
  document.addEventListener('keydown', function (e) {
    if (!current || photos.length < 2) return;
    if (e.key === 'ArrowLeft') showPhoto(photoIdx - 1);
    if (e.key === 'ArrowRight') showPhoto(photoIdx + 1);
  });
  // swipe left / right on the photo
  var touchX = null;
  pm.gallery.addEventListener('touchstart', function (e) {
    touchX = e.touches.length === 1 ? e.touches[0].clientX : null;
  }, { passive: true });
  pm.gallery.addEventListener('touchend', function (e) {
    if (touchX === null || photos.length < 2) return;
    var dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (dx <= -40) showPhoto(photoIdx + 1);
    else if (dx >= 40) showPhoto(photoIdx - 1);
  }, { passive: true });
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) closeModal();
  });

  /* Tap on a product card (not on its Add / Share buttons) -> open popup */
  document.addEventListener('click', function (e) {
    var card = e.target.closest('#productGrid article');
    if (!card) return;
    if (e.target.closest('[data-add],[data-share],a')) return;
    var b = card.querySelector('[data-add]');
    if (!b) return;
    var p = byId(b.getAttribute('data-add'));
    if (p) openModal(p);
  });

  /* Card "Add" on a product that needs a size -> open popup instead (size is mandatory).
     Runs in the capture phase so it fires before the store's own handler. */
  document.addEventListener('click', function (e) {
    if (allowAdd) return;
    var btn = e.target.closest('#productGrid [data-add]');
    if (!btn) return;
    var p = byId(btn.getAttribute('data-add'));
    if (p && isUnavailable(p)) return; // ADDED (TASK 1): the store itself shows "not available"
    if (p && sizesOf(p).length) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openModal(p);
    }
  }, true);

  /* ---------------- size selector inside the cart drawer ---------------- */
  function decorateCart() {
    var box = document.getElementById('cartItems');
    if (!box) return;
    var sizes = getSizes();
    box.querySelectorAll('[data-remove]').forEach(function (rm) {
      var id = rm.getAttribute('data-remove');
      // CHANGED (CART FIX): lines that already have a size show it as text, so only an old line without a size gets the dropdown
      if (id.indexOf('::') !== -1) return;
      var p = byId(id);
      var list = sizesOf(p);
      if (!list.length) return;
      var info = rm.closest('.flex-1');
      if (!info || info.querySelector('.mb-size')) return;

      var wrap = document.createElement('div');
      wrap.className = 'mb-size flex items-center gap-2 mt-1.5';
      var lab = document.createElement('span');
      lab.className = 'text-xs text-ink-soft';
      lab.textContent = 'Size:';
      var sel = document.createElement('select');
      var ph = document.createElement('option');
      ph.value = ''; ph.textContent = 'Select size';
      sel.appendChild(ph);
      list.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s;
        // CHANGED (TASK 4): show the price next to the size when it has its own price
        var sp = sizePriceOf(p, s);
        o.textContent = (sp !== null && p.sizePrices) ? (s + ' - ' + fmt(sp)) : s;
        sel.appendChild(o);
      });
      sel.value = (sizes[id] && list.indexOf(sizes[id]) > -1) ? sizes[id] : '';
      function paintSel() {
        sel.className = 'text-xs rounded-lg border bg-white px-2 py-1 ' +
          (sel.value ? 'border-sand' : 'border-red-400');
      }
      paintSel();
      sel.addEventListener('change', function () {
        paintSel();
        // CHANGED (CART FIX): move this old line to "id::size" (price and totals update automatically)
        if (sel.value && typeof window.setCartLineSize === 'function') window.setCartLineSize(id, sel.value);
      });
      wrap.appendChild(lab);
      wrap.appendChild(sel);
      info.insertBefore(wrap, rm.parentElement);
    });
  }
  var cartBox = document.getElementById('cartItems');
  if (cartBox) new MutationObserver(decorateCart).observe(cartBox, { childList: true });

  /* ---------------- block checkout if a size is missing ---------------- */
  function missingSizeItems() {
    var cart = getCart(), out = [];
    Object.keys(cart).forEach(function (key) {
      // CHANGED (CART FIX): a line is missing its size when it is a sized product without "::size"
      var parts = keyParts(key);
      var p = byId(parts.id), list = sizesOf(p);
      if (list.length && list.indexOf(parts.size) === -1 && out.indexOf(p) === -1) out.push(p);
    });
    return out;
  }
  function blockIfMissing(e) {
    var m = missingSizeItems();
    if (!m.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    toast('Please select a size for: ' + m.map(function (p) { return p.name; }).join(', '));
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('#checkoutBtn')) blockIfMissing(e);
  }, true);
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'checkoutForm') blockIfMissing(e);
  }, true);

  /* ---------------- put the size into the order message (TASK 2) ---------------- */
  // Turns "• Name  ×2  —  ₹400" into "• Name (Size: M)  ×2  —  ₹400"
  function patchSummary(text) {
    if (typeof text !== 'string') return text;
    var cart = getCart(), sizes = getSizes();
    Object.keys(cart).forEach(function (id) {
      var p = byId(id);
      if (!p || !sizesOf(p).length || !sizes[id]) return;
      var from = '• ' + p.name + '  ×';
      var to = '• ' + p.name + ' (Size: ' + sizes[id] + ')  ×';
      text = text.split(from).join(to);
    });
    return text;
  }

  // WhatsApp message (shop owner sees this)
  var nativeOpen = window.open;
  window.open = function (url) {
    try {
      if (typeof url === 'string' && url.indexOf('https://wa.me/') === 0) {
        var i = url.indexOf('?text=');
        if (i > -1) {
          var txt = decodeURIComponent(url.slice(i + 6));
          url = url.slice(0, i + 6) + encodeURIComponent(patchSummary(txt));
        }
      }
    } catch (err) { /* send the original message if anything goes wrong */ }
    return nativeOpen.apply(window, [url].concat(Array.prototype.slice.call(arguments, 1)));
  };

  // Email copy sent through Web3Forms
  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      var u = typeof input === 'string' ? input : (input && input.url) || '';
      if (u.indexOf('api.web3forms.com') > -1 && init && typeof init.body === 'string') {
        var b = JSON.parse(init.body);
        if (b.order_summary) b.order_summary = patchSummary(b.order_summary);
        if (b.message) b.message = patchSummary(b.message);
        init = Object.assign({}, init, { body: JSON.stringify(b) });
      }
    } catch (err) { /* fall through with the original request */ }
    return nativeFetch.call(window, input, init);
  };

  /* ---------------- BUG FIX 2: new category should start from the first product ----------------
     When a category button is tapped while the page is scrolled far down (near the footer),
     jump back to the top of the product list so the new category is shown from its start. */
  function scrollToProductsTop() {
    var main = document.querySelector('main');
    var header = document.querySelector('header');
    if (!main) return;
    var top = main.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight : 0) - 8;
    if (window.scrollY <= top) return;            // already above the list: leave the page alone
    var root = document.documentElement;
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';           // jump instantly instead of a long smooth scroll
    window.scrollTo(0, Math.max(0, top));
    root.style.scrollBehavior = prev;
  }
  // Capture phase: runs before the store re-draws the category buttons.
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#categoryRow .cat-pill')) {
      setTimeout(scrollToProductsTop, 0);         // wait until the new products are drawn
    }
  }, true);
})();