const kitGrid = document.getElementById('kit-grid');
const productGrid = document.getElementById('product-grid');
const serviceGrid = document.getElementById('service-grid');
const categoryPills = document.getElementById('category-pills');
const detailsModal = document.getElementById('detailsModal');
const detailsModalBody = document.getElementById('details-modal-body');

const state = {
  kits: [],
  products: [],
  services: [],
  categories: []
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
  const canTrackStock = type === 'product' || type === 'kit';
  const isOutOfStock = canTrackStock && (Boolean(item.is_out_of_stock) || Number(item.stock || 0) <= 0);
  const card = document.createElement('article');
  card.className = `card product-card ${isRecommended ? 'recommended' : ''}`;
  card.id = `${type}-card-${item.id}`;

  const imageSources = getItemImageSources(item, type);
  const imageMarkup = imageSources.length
    ? `
      <div class="store-image-gallery ${type === 'kit' || type === 'product' ? 'multi' : ''}">
        ${imageSources
          .map(
            (src, index) => `
              <img
                src="${src}"
                alt="${escapeHtml(item.name)} ${imageSources.length > 1 ? `image ${index + 1}` : ''}"
                loading="lazy"
                onerror="this.onerror=null;this.src='${DEFAULT_IMAGE_PLACEHOLDER}'"
              />`
          )
          .join('')}
      </div>
    `
    : '';

  card.innerHTML = `
    ${imageMarkup}
    <h3>${escapeHtml(item.name)}</h3>
    <p class="subtext">${escapeHtml(item.description || '')}</p>
    ${item.category_name ? `<p><strong>Category:</strong> ${escapeHtml(item.category_name)}</p>` : ''}
    <p><strong>Price:</strong> ${formatCurrency(item.price, item.currency)}</p>
    ${canTrackStock ? `<p><span class="stock-badge ${isOutOfStock ? 'out' : 'in'}">${isOutOfStock ? '❌ Out of Stock' : '✅ In Stock'}</span></p>` : ''}
    <div class="kit-card-actions">
      <button class="button secondary details-btn" type="button" data-id="${item.id}" data-type="${type}" data-focus="learn">📘 Learn How It Works</button>
      <button class="button secondary details-btn" type="button" data-id="${item.id}" data-type="${type}" data-focus="install">🛠 Installation Guide</button>
      <button class="button secondary details-btn" type="button" data-id="${item.id}" data-type="${type}">More Details</button>
      <button
        class="button primary add-to-cart-btn"
        type="button"
        ${isOutOfStock ? 'disabled' : ''}
        data-id="${item.id}"
        data-type="${type}"
        data-name="${escapeHtml(item.name)}"
        data-price="${Number(item.price)}"
        data-currency="${item.currency || 'ZAR'}"
      >
        Add to Cart
      </button>
      <a class="button outline" href="https://wa.me/27825551234" target="_blank" rel="noreferrer">Request Installation Help</a>
    </div>
  `;

  return card;
}

const DEFAULT_IMAGE_PLACEHOLDER = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80';

function normalizeImageValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  return [String(value).trim()].filter(Boolean);
}

function getItemImageSources(item, type) {
  const candidates = [
    item.main_image,
    ...normalizeImageValue(item.image_urls),
    ...normalizeImageValue(item.images),
    item.image_url,
    item.image_url_2,
    item.image_url_3
  ]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);

  const deduped = [...new Set(candidates)];

  if ((type === 'kit' || type === 'product') && deduped.length === 1) {
    return [deduped[0], DEFAULT_IMAGE_PLACEHOLDER];
  }

  return deduped;
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

function renderSteps(steps) {
  if (!Array.isArray(steps) || !steps.length) return '';
  return `
    <h4 class="details-section-title">Step-by-Step Instructions</h4>
    <ol class="kit-steps-list">
      ${steps
        .sort((a, b) => a.step_number - b.step_number)
        .map(
          (s) => `
        <li class="kit-step-item">
          <span class="kit-step-number">${s.step_number}</span>
          <div class="kit-step-body">
            <strong class="kit-step-title">${escapeHtml(s.title)}</strong>
            <p class="kit-step-desc">${escapeHtml(s.description || '')}</p>
            ${(s.image || s.image_url) ? `<img src="${s.image || s.image_url}" alt="${escapeHtml(s.title)}" class="kit-step-image" loading="lazy" />` : ''}
          </div>
        </li>`
        )
        .join('')}
    </ol>
  `;
}

function openDetailsModal(item, type = 'product') {
  const hasSteps = Array.isArray(item.steps) && item.steps.length > 0;
  const hasInstructions = item.instructions && item.instructions.trim();

  document.getElementById('details-modal-title').textContent = item.name || 'Details';

  const guide = item.guide || {};
  const learnHow = item.learn_how || guide.learn_how;
  const installationGuide = item.installation_guide || guide.installation_guide || item.instructions;
  const videoUrl = item.video_url || guide.video_url;

  detailsModalBody.innerHTML = `
    ${getItemImageSources(item, type)
      .map(
        (src, index) => `
          <img
            src="${src}"
            alt="${escapeHtml(item.name)} ${index + 1}"
            class="kit-main-image"
            loading="lazy"
            onerror="this.onerror=null;this.src='${DEFAULT_IMAGE_PLACEHOLDER}'"
          />`
      )
      .join('')}
    <p class="details-description">${escapeHtml(item.description || '')}</p>
    <h4 class="details-section-title">📘 Learn How It Works</h4>
    <p>${escapeHtml(learnHow || 'This item includes practical setup knowledge and usage tips.')}</p>
    <h4 class="details-section-title">🛠 Installation Guide</h4>
    <p>${escapeHtml(installationGuide || 'Follow the included guide or request installation support.')}</p>
    ${videoUrl ? `<p class="details-video-link"><a href="${videoUrl}" target="_blank" rel="noopener noreferrer">▶ Watch video guide</a></p>` : ''}
    ${hasSteps
      ? renderSteps(item.steps)
      : hasInstructions ? `<h4 class="details-section-title">Instructions</h4><p>${escapeHtml(item.instructions)}</p>` : ''
    }
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

    openDetailsModal(payload.kit, 'kit');
    return;
  }

  const source = type === 'product' ? state.products : state.services;
  const item = source.find((entry) => String(entry.id) === String(id));
  if (!item) {
    throw new Error('Item details not found.');
  }

  openDetailsModal(item, type);
}

async function loadStore() {
  try {
    const [kitsRes, productsRes, servicesRes, categoriesRes] = await Promise.all([fetch('/kits'), fetch('/products'), fetch('/services'), fetch('/categories')]);
    const [kitsPayload, productsPayload, servicesPayload, categoriesPayload] = await Promise.all([kitsRes.json(), productsRes.json(), servicesRes.json(), categoriesRes.json()]);

    if (!kitsRes.ok) throw new Error(kitsPayload.error || 'Unable to load kits.');
    if (!productsRes.ok) throw new Error(productsPayload.error || 'Unable to load products.');
    if (!servicesRes.ok) throw new Error(servicesPayload.error || 'Unable to load services.');
    if (!categoriesRes.ok) throw new Error(categoriesPayload.error || 'Unable to load categories.');

    state.kits = kitsPayload.kits || [];
    state.products = productsPayload.products || [];
    state.services = servicesPayload.services || [];
    state.categories = categoriesPayload.categories || [];

    renderCategoryPills(state.categories);
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

function renderCategoryPills(categories = []) {
  if (!categoryPills) return;
  if (!categories.length) {
    categoryPills.innerHTML = '<span class="subtext">Categories unavailable.</span>';
    return;
  }

  categoryPills.innerHTML = categories
    .map((category) => `<span class="button secondary">${escapeHtml(category.name)}</span>`)
    .join('');
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

  const CABLE_PRICES = {
    indoor: 8.5,
    outdoor: 15
  };

  const cableTypeInput = document.getElementById('cable-type');
  const metersInput = document.getElementById('cable-meters');
  const totalOutput = document.getElementById('cable-total');
  const calculateCableTotal = () => {
    const cableType = cableTypeInput?.value === 'outdoor' ? 'outdoor' : 'indoor';
    const price = CABLE_PRICES[cableType];
    const meters = Number(metersInput?.value || 0);
    totalOutput.textContent = `Estimated total: ${formatCurrency(price * meters)}`;
  };

  document.getElementById('calc-cable')?.addEventListener('click', calculateCableTotal);
  cableTypeInput?.addEventListener('change', calculateCableTotal);
  calculateCableTotal();
});
