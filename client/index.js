const storeLink = document.querySelector('[data-store-link]');
const kitPreviewGrid = document.getElementById('kit-preview-grid');
const productPreviewGrid = document.getElementById('product-preview-grid');
const previewError = document.getElementById('preview-error');

function safeText(value, fallback = 'No description available yet.') {
  return (value || '').trim() || fallback;
}

function escapeHtml(text = '') {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function goToStoreOrLogin() {
  window.location.href = isLoggedIn() ? '/store.html' : '/login.html';
}

function createPreviewCard(item, type) {
  const card = document.createElement('article');
  card.className = 'card preview-card';

  const imageMarkup = item.image_url
    ? `<img src="${item.image_url}" alt="${escapeHtml(item.name || type)}" loading="lazy" />`
    : '<div class="preview-image-fallback">No image available</div>';

  card.innerHTML = `
    ${imageMarkup}
    <h3>${escapeHtml(item.name || `Untitled ${type}`)}</h3>
    <p class="subtext">${escapeHtml(safeText(item.description))}</p>
    <button class="button primary" type="button">Login to View &amp; Purchase</button>
  `;

  card.addEventListener('click', goToStoreOrLogin);
  card.querySelector('button')?.addEventListener('click', (event) => {
    event.stopPropagation();
    goToStoreOrLogin();
  });

  return card;
}

function setPreviewError(message) {
  previewError.textContent = message;
  previewError.classList.remove('hidden');
}

async function fetchCollection(url, key) {
  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || `Unable to load ${key}.`);
  }

  return Array.isArray(payload[key]) ? payload[key] : [];
}

async function loadLandingPreview() {
  try {
    const [kits, products] = await Promise.all([
      fetchCollection('/kits', 'kits'),
      fetchCollection('/products', 'products')
    ]);

    if (!kits.length) {
      kitPreviewGrid.innerHTML = '<p class="subtext">No kits available right now.</p>';
    } else {
      kits.slice(0, 3).forEach((kit) => kitPreviewGrid.appendChild(createPreviewCard(kit, 'kit')));
    }

    if (!products.length) {
      productPreviewGrid.innerHTML = '<p class="subtext">No products available right now.</p>';
    } else {
      products
        .slice(0, 6)
        .forEach((product) => productPreviewGrid.appendChild(createPreviewCard(product, 'product')));
    }
  } catch (error) {
    console.error('[Landing Preview] Failed:', error.message);
    setPreviewError(`Error loading kits/products: ${error.message}`);
  }
}

storeLink?.addEventListener('click', (event) => {
  event.preventDefault();
  goToStoreOrLogin();
});

loadLandingPreview();
