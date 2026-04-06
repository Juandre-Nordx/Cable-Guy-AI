const hasStoreAccess = typeof requireStoreAccess === 'function' ? requireStoreAccess() : true;

const kitGrid = document.getElementById('kit-grid');
const productGrid = document.getElementById('product-grid');
const orderFlowModal = document.getElementById('order-flow-modal');
const query = new URLSearchParams(window.location.search);
const highlightedCategory = query.get('category');
const CURRENCY_SYMBOLS = { ZAR: 'R', USD: '$', EUR: '€' };
let showOrderPopup = false;

function escapeHtml(text = '') {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatInstructions(text = '') {
  if (!text.trim()) {
    return '<p class="subtext">No installation instructions added yet.</p>';
  }

  return `<p>${escapeHtml(text).replaceAll('\n', '<br />')}</p>`;
}

function toEmbedUrl(videoUrl) {
  if (!videoUrl) return null;

  try {
    const parsed = new URL(videoUrl);
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    return videoUrl;
  } catch (_error) {
    return null;
  }
}

function renderStep(step) {
  return `
    <article class="kit-step">
      <h5>Step ${step.step_number}: ${escapeHtml(step.title || 'Untitled')}</h5>
      <p>${escapeHtml(step.description || '')}</p>
      ${step.image_url ? `<img src="${step.image_url}" alt="Step ${step.step_number} image" loading="lazy" />` : ''}
    </article>
  `;
}

function renderKit(kit) {
  const card = document.createElement('article');
  card.className = `card kit-card ${highlightedCategory === kit.category ? 'recommended' : ''}`;

  const embedUrl = toEmbedUrl(kit.video_url);
  const detailsId = `kit-details-${kit.id}`;

  card.innerHTML = `
    <h2>${kit.name}</h2>
    <p class="subtext">${kit.description}</p>
    <p class="guide-label">Easy Installation Guide Included</p>
    ${kit.requires_technician ? '<p class="warning">⚠️ Recommended: Professional Installation</p>' : ''}
    <p><strong>Category:</strong> ${kit.category}</p>
    <p><strong>Difficulty:</strong> ${kit.difficulty}</p>
    <p><strong>Price:</strong> ${formatPrice(kit.price, kit.currency)}</p>
    <div class="kit-card-actions">
      <button class="button secondary" data-toggle-details="${detailsId}">View Details</button>
      <button class="button primary" data-kit-id="${kit.id}">Place Order</button>
    </div>
    <section id="${detailsId}" class="kit-details hidden">
      ${kit.image_url ? `<img src="${kit.image_url}" alt="${kit.name}" class="kit-main-image" loading="lazy" />` : ''}
      <h4>Installation Guide</h4>
      ${formatInstructions(kit.instructions || '')}
      ${Array.isArray(kit.steps) && kit.steps.length ? `<div class="kit-steps"><h4>Step-by-Step</h4>${kit.steps.map(renderStep).join('')}</div>` : ''}
      ${embedUrl ? `<div class="kit-video"><h4>Video</h4><iframe src="${embedUrl}" title="${kit.name} installation video" loading="lazy" allowfullscreen></iframe></div>` : ''}
    </section>
  `;

  const buyButton = card.querySelector('[data-kit-id]');
  buyButton?.addEventListener('click', () => placeOrder(kit.id, kit.name));

  const detailsButton = card.querySelector('[data-toggle-details]');
  detailsButton?.addEventListener('click', () => {
    const details = card.querySelector(`#${detailsId}`);
    const isHidden = details?.classList.contains('hidden');
    details?.classList.toggle('hidden', !isHidden);
    detailsButton.textContent = isHidden ? 'Hide Details' : 'View Details';
  });

  return card;
}

function renderProduct(product) {
  const card = document.createElement('article');
  card.className = 'card product-card';

  card.innerHTML = `
    ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" loading="lazy" />` : ''}
    <h3>${product.name}</h3>
    <p class="subtext">${product.description || ''}</p>
    <p><strong>Category:</strong> ${product.category}</p>
    <p><strong>Price:</strong> ${formatPrice(product.price, product.currency)}</p>
  `;

  return card;
}

function formatPrice(amount, currency = 'ZAR') {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return '-';

  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  const formatted = numericAmount.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(numericAmount) ? 0 : 2,
    maximumFractionDigits: 2
  });
  return `${symbol} ${formatted}`;
}

function toggleOrderFlowModal() {
  if (!orderFlowModal) return;
  orderFlowModal.classList.toggle('hidden', !showOrderPopup);
}

function showOrderFlowModalAfterClick() {
  if (!orderFlowModal) return Promise.resolve(true);

  showOrderPopup = true;
  toggleOrderFlowModal();

  return new Promise((resolve) => {
    const confirmButton = document.getElementById('confirm-order-flow');
    const cancelButton = document.getElementById('cancel-order-flow');
    const closeButton = document.getElementById('close-order-flow');

    const cleanup = (confirmed) => {
      showOrderPopup = false;
      toggleOrderFlowModal();
      confirmButton?.removeEventListener('click', onConfirm);
      cancelButton?.removeEventListener('click', onCancel);
      closeButton?.removeEventListener('click', onCancel);
      resolve(confirmed);
    };

    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);

    confirmButton?.addEventListener('click', onConfirm);
    cancelButton?.addEventListener('click', onCancel);
    closeButton?.addEventListener('click', onCancel);
  });
}

async function placeOrder(kitId, kitName) {
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  const confirmed = await showOrderFlowModalAfterClick();
  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch('/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ kit_id: kitId })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to place order.');
    }

    window.alert(`Order placed for ${kitName}. Tracking is available on your dashboard.`);
    window.location.href = '/dashboard.html';
  } catch (error) {
    window.alert(error.message);
  }
}

async function loadKits() {
  try {
    console.log('[Store] Fetching kits from /kits');
    const response = await fetch('/kits');
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Unable to load kits.');
    }

    if (!payload.kits.length) {
      kitGrid.innerHTML = '<p class="subtext">No kits available right now.</p>';
      return;
    }

    payload.kits.forEach((kit) => {
      kitGrid.appendChild(renderKit(kit));
    });
  } catch (error) {
    console.error('[Store] Kits load failed:', error.message);
    kitGrid.innerHTML = `<p class="warning">Error: ${error.message}</p>`;
  }
}

async function loadProducts() {
  try {
    console.log('[Store] Fetching products from /products');
    const response = await fetch('/products');
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Unable to load products.');
    }

    if (!payload.products.length) {
      productGrid.innerHTML = '<p class="subtext">No products available right now.</p>';
      return;
    }

    payload.products.forEach((product) => {
      productGrid.appendChild(renderProduct(product));
    });
  } catch (error) {
    console.error('[Store] Products load failed:', error.message);
    productGrid.innerHTML = `<p class="warning">Error: ${error.message}</p>`;
  }
}

if (hasStoreAccess) {
  loadKits();
  loadProducts();
}
