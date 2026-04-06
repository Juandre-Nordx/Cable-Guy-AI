const kitGrid = document.getElementById('kit-grid');
const productGrid = document.getElementById('product-grid');
const serviceGrid = document.getElementById('service-grid');
const orderPopup = document.getElementById('orderPopup');
const query = new URLSearchParams(window.location.search);
const highlightedCategory = query.get('category');
const highlightedProductId = Number(query.get('product_id') || 0);
const highlightedKitId = Number(query.get('kit_id') || 0);
const highlightedServiceId = Number(query.get('service_id') || 0);
let isPlacingOrder = false;

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
  card.className = `card kit-card ${highlightedCategory === kit.category || highlightedKitId === kit.id ? 'recommended' : ''}`;
  card.id = `kit-card-${kit.id}`;

  const embedUrl = toEmbedUrl(kit.video_url);
  const detailsId = `kit-details-${kit.id}`;

  card.innerHTML = `
    <h2>${kit.name}</h2>
    <p class="subtext">${kit.description}</p>
    <p class="guide-label">Easy Installation Guide Included</p>
    ${kit.requires_technician ? '<p class="warning">⚠️ Recommended: Professional Installation</p>' : ''}
    <p><strong>Category:</strong> ${kit.category}</p>
    <p><strong>Difficulty:</strong> ${kit.difficulty}</p>
    <p><strong>Price:</strong> ${formatCurrency(kit.price, kit.currency)}</p>
    <div class="kit-card-actions">
      <button class="button secondary view-details-btn" type="button" data-id="${kit.id}" data-toggle-details="${detailsId}">View Details</button>
      <button class="button primary place-order-btn" type="button" data-id="${kit.id}" data-kit-name="${escapeHtml(kit.name)}">Place Order</button>
    </div>
    <section id="${detailsId}" class="kit-details hidden">
      ${kit.image_url ? `<img src="${kit.image_url}" alt="${kit.name}" class="kit-main-image" loading="lazy" />` : ''}
      <h4>Installation Guide</h4>
      ${formatInstructions(kit.instructions || '')}
      ${Array.isArray(kit.steps) && kit.steps.length ? `<div class="kit-steps"><h4>Step-by-Step</h4>${kit.steps.map(renderStep).join('')}</div>` : ''}
      ${embedUrl ? `<div class="kit-video"><h4>Video</h4><iframe src="${embedUrl}" title="${kit.name} installation video" loading="lazy" allowfullscreen></iframe></div>` : ''}
    </section>
  `;

  return card;
}

function renderProduct(product) {
  const card = document.createElement('article');
  card.className = `card product-card ${highlightedProductId === product.id ? 'recommended' : ''}`;
  card.id = `product-card-${product.id}`;

  card.innerHTML = `
    ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" loading="lazy" />` : ''}
    <h3>${product.name}</h3>
    <p class="subtext">${product.description || ''}</p>
    <p><strong>Category:</strong> ${product.category}</p>
    <p><strong>Price:</strong> ${formatCurrency(product.price, product.currency)}</p>
  `;

  return card;
}

function renderService(service) {
  const card = document.createElement('article');
  card.className = `card product-card ${highlightedServiceId === service.id ? 'recommended' : ''}`;
  card.id = `service-card-${service.id}`;

  card.innerHTML = `
    <h3>${service.name}</h3>
    <p class="subtext">${service.description || ''}</p>
    <p><strong>Price:</strong> ${formatCurrency(service.price, service.currency)}</p>
  `;

  return card;
}

function formatCurrency(price, currency = 'ZAR') {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) return '-';
  if (currency === 'ZAR') return `R ${numericPrice.toFixed(2)}`;
  if (currency === 'USD') return `$ ${numericPrice.toFixed(2)}`;
  return `${numericPrice.toFixed(2)}`;
}

async function withButtonLoading(button, loadingText, action) {
  const originalLabel = button?.textContent || '';
  if (button) {
    button.disabled = true;
    button.textContent = loadingText;
  }

  try {
    await action();
  } catch (error) {
    console.error(error);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}

function lockBodyScroll(shouldLock) {
  document.body.style.overflow = shouldLock ? 'hidden' : '';
}

function showOrderPopup() {
  if (!orderPopup) return;
  orderPopup.classList.remove('hidden');
  orderPopup.classList.add('open');
  lockBodyScroll(true);
}

function closeOrderPopup() {
  if (!orderPopup) return;
  orderPopup.classList.add('hidden');
  orderPopup.classList.remove('open');
  lockBodyScroll(false);
}

function highlightRequestedItems() {
  const targets = [];
  if (highlightedProductId > 0) targets.push(document.getElementById(`product-card-${highlightedProductId}`));
  if (highlightedKitId > 0) targets.push(document.getElementById(`kit-card-${highlightedKitId}`));

  if (!targets.length && highlightedServiceId > 0) {
    targets.push(document.getElementById(`service-card-${highlightedServiceId}`));
    targets.push(serviceGrid);
  }

  const first = targets.find(Boolean);
  first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function placeOrder(kitId, kitName) {
  if (isPlacingOrder) return;
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  try {
    isPlacingOrder = true;
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

    console.log('Order created:', payload);
    const popupTitle = document.getElementById('order-flow-title');
    if (popupTitle) {
      popupTitle.textContent = `Order placed for ${kitName}`;
    }
    showOrderPopup();
  } catch (error) {
    console.error('Order error:', error);
    window.alert(error.message);
  } finally {
    isPlacingOrder = false;
  }
}

async function handlePlaceOrder(event) {
  event.preventDefault();
  console.log('Button clicked');

  const button = event.currentTarget;
  const id = Number(button?.dataset.id || 0);
  const kitName = button?.dataset.kitName || 'your kit';

  if (!id) {
    console.error('Place order missing data-id');
    return;
  }

  console.log('Place order clicked:', id);
  await withButtonLoading(button, 'Processing...', () => placeOrder(id, kitName));
}

async function handleViewDetails(event) {
  event.preventDefault();
  console.log('Button clicked');

  const button = event.currentTarget;
  const id = button?.dataset.id;
  const detailsId = button?.dataset.toggleDetails;

  console.log('View details clicked:', id);

  try {
    if (!detailsId) {
      window.location.href = `/product.html?id=${encodeURIComponent(id || '')}`;
      return;
    }

    const details = document.getElementById(detailsId);
    const isHidden = details?.classList.contains('hidden');
    details?.classList.toggle('hidden', !isHidden);
    button.textContent = isHidden ? 'Hide Details' : 'View Details';
    details?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    console.error('View details error:', error);
  }
}

function wirePopupControls() {
  if (!orderPopup) return;

  const confirmButton = document.getElementById('confirm-order-flow');
  const cancelButton = document.getElementById('cancel-order-flow');
  const closeButton = document.getElementById('close-order-popup');

  confirmButton?.addEventListener('click', () => {
    closeOrderPopup();
    window.location.href = '/dashboard.html';
  });
  cancelButton?.addEventListener('click', closeOrderPopup);
  closeButton?.addEventListener('click', closeOrderPopup);

  orderPopup.addEventListener('click', (event) => {
    if (event.target === orderPopup) {
      closeOrderPopup();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !orderPopup.classList.contains('hidden')) {
      closeOrderPopup();
    }
  });
}

function bindStoreButtonEvents() {
  document.querySelectorAll('.place-order-btn').forEach((button) => {
    if (button.dataset.bound === 'true') return;
    button.addEventListener('click', handlePlaceOrder);
    button.dataset.bound = 'true';
  });

  document.querySelectorAll('.view-details-btn').forEach((button) => {
    if (button.dataset.bound === 'true') return;
    button.addEventListener('click', handleViewDetails);
    button.dataset.bound = 'true';
  });
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
    bindStoreButtonEvents();
    highlightRequestedItems();
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
    highlightRequestedItems();
  } catch (error) {
    console.error('[Store] Products load failed:', error.message);
    productGrid.innerHTML = `<p class="warning">Error: ${error.message}</p>`;
  }
}

async function loadServices() {
  if (!serviceGrid) return;

  try {
    console.log('[Store] Fetching services from /services');
    const response = await fetch('/services');
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Unable to load services.');
    }

    if (!payload.services.length) {
      serviceGrid.innerHTML = '<p class="subtext">No services available right now.</p>';
      return;
    }

    payload.services.forEach((service) => {
      serviceGrid.appendChild(renderService(service));
    });
    highlightRequestedItems();
  } catch (error) {
    console.error('[Store] Services load failed:', error.message);
    serviceGrid.innerHTML = `<p class="warning">Error: ${error.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadKits();
  loadProducts();
  loadServices();
  wirePopupControls();
  closeOrderPopup();
});
