const kitGrid = document.getElementById('kit-grid');
const productGrid = document.getElementById('product-grid');
const serviceGrid = document.getElementById('service-grid');
const detailsModal = document.getElementById('detailsModal');
const detailsModalBody = document.getElementById('details-modal-body');

const state = {
  kits: [],
  products: [],
  services: []
};

function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatCurrency(price, currency = 'ZAR') {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) return '-';

  if (currency === 'USD') return `$ ${numericPrice.toFixed(2)}`;
  if (currency === 'EUR') return `€ ${numericPrice.toFixed(2)}`;
  return `R ${numericPrice.toFixed(2)}`;
}

function lockBodyScroll(shouldLock) {
  document.body.style.overflow = shouldLock ? 'hidden' : '';
}

function getCart() {
  return JSON.parse(localStorage.getItem('cart') || '[]');
}

function setCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
}

function addToCart(item) {
  const cart = getCart();
  const existing = cart.find((entry) => entry.id === item.id && entry.type === item.type);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...item, qty: 1 });
  }

  setCart(cart);
  window.alert(`${item.name} added to cart.`);
}

function renderStoreCard(item, type, isRecommended = false) {
  const card = document.createElement('article');
  card.className = `card product-card ${isRecommended ? 'recommended' : ''}`;
  card.id = `${type}-card-${item.id}`;

  card.innerHTML = `
    ${item.image_url ? `<img src="${item.image_url}" alt="${escapeHtml(item.name)}" loading="lazy" />` : ''}
    <h3>${escapeHtml(item.name)}</h3>
    <p class="subtext">${escapeHtml(item.description || '')}</p>
    <p><strong>Price:</strong> ${formatCurrency(item.price, item.currency)}</p>
    <div class="kit-card-actions">
      <button class="button secondary details-btn" type="button" data-id="${item.id}" data-type="${type}">More Details</button>
      <button
        class="button primary add-to-cart-btn"
        type="button"
        data-id="${item.id}"
        data-type="${type}"
        data-name="${escapeHtml(item.name)}"
        data-price="${Number(item.price)}"
        data-currency="${item.currency || 'ZAR'}"
      >
        Add to Cart
      </button>
    </div>
  `;

  return card;
}

function renderKits(kits) {
  kitGrid.innerHTML = '';
  if (!kits.length) {
    kitGrid.innerHTML = '<p class="subtext">No kits available right now.</p>';
    return;
  }

  kits.forEach((kit) => kitGrid.appendChild(renderStoreCard(kit, 'kit')));
}

function renderProducts(products) {
  productGrid.innerHTML = '';
  if (!products.length) {
    productGrid.innerHTML = '<p class="subtext">No products available right now.</p>';
    return;
  }

  products.forEach((product) => productGrid.appendChild(renderStoreCard(product, 'product')));
}

function renderServices(services) {
  serviceGrid.innerHTML = '';
  if (!services.length) {
    serviceGrid.innerHTML = '<p class="subtext">No services available right now.</p>';
    return;
  }

  services.forEach((service) => serviceGrid.appendChild(renderStoreCard(service, 'service')));
}

function closeDetailsModal() {
  detailsModal.classList.add('hidden');
  detailsModal.classList.remove('open');
  lockBodyScroll(false);
}

function openDetailsModal(item) {
  detailsModalBody.innerHTML = `
    <h4>${escapeHtml(item.name)}</h4>
    <p>${escapeHtml(item.description || '')}</p>
    <h4>Instructions</h4>
    <p>${escapeHtml(item.instructions || 'No instructions available')}</p>
    ${item.image_url ? `<img src="${item.image_url}" alt="${escapeHtml(item.name)}" class="kit-main-image" loading="lazy" />` : ''}
    ${item.video_url ? `<p><a href="${item.video_url}" target="_blank" rel="noopener noreferrer">Watch video</a></p>` : ''}
  `;

  detailsModal.classList.remove('hidden');
  detailsModal.classList.add('open');
  lockBodyScroll(true);
}

async function openDetails(id, type) {
  if (type === 'kit') {
    const res = await fetch(`/kits/${id}`);
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to load kit details.');
    }

    openDetailsModal(payload.kit);
    return;
  }

  const source = type === 'product' ? state.products : state.services;
  const item = source.find((entry) => String(entry.id) === String(id));
  if (!item) {
    throw new Error('Item details not found.');
  }

  openDetailsModal(item);
}

async function loadStore() {
  try {
    const [kitsRes, productsRes, servicesRes] = await Promise.all([fetch('/kits'), fetch('/products'), fetch('/services')]);
    const [kitsPayload, productsPayload, servicesPayload] = await Promise.all([kitsRes.json(), productsRes.json(), servicesRes.json()]);

    if (!kitsRes.ok) throw new Error(kitsPayload.error || 'Unable to load kits.');
    if (!productsRes.ok) throw new Error(productsPayload.error || 'Unable to load products.');
    if (!servicesRes.ok) throw new Error(servicesPayload.error || 'Unable to load services.');

    state.kits = kitsPayload.kits || [];
    state.products = productsPayload.products || [];
    state.services = servicesPayload.services || [];

    renderKits(state.kits);
    renderProducts(state.products);
    renderServices(state.services);
  } catch (error) {
    console.error('[Store] load failed:', error);
    const message = `<p class="warning">${escapeHtml(error.message)}</p>`;
    kitGrid.innerHTML = message;
    productGrid.innerHTML = message;
    serviceGrid.innerHTML = message;
  }
}

function wireEvents() {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && detailsModal && !detailsModal.classList.contains('hidden')) {
      closeDetailsModal();
    }
  });

  document.addEventListener('click', async (e) => {
    const detailsBtn = e.target.closest('.details-btn');
    const cartBtn = e.target.closest('.add-to-cart-btn');
    const closeBtn = e.target.closest('#close-details-modal, #cancel-details-modal');

    if (detailsBtn) {
      e.preventDefault();
      try {
        await openDetails(detailsBtn.dataset.id, detailsBtn.dataset.type);
      } catch (error) {
        console.error('[Store] details error:', error);
        window.alert(error.message);
      }
      return;
    }

    if (cartBtn) {
      e.preventDefault();
      try {
        const item = {
          id: Number(cartBtn.dataset.id),
          type: cartBtn.dataset.type,
          name: cartBtn.dataset.name,
          price: Number(cartBtn.dataset.price),
          currency: cartBtn.dataset.currency || 'ZAR'
        };

        addToCart(item);
      } catch (error) {
        console.error('[Store] add-to-cart failed:', error);
        window.alert('Failed to add item to cart.');
      }
      return;
    }

    if (closeBtn || e.target === detailsModal) {
      e.preventDefault();
      closeDetailsModal();
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  wireEvents();
  closeDetailsModal();
  await loadStore();
});
