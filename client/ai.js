const session = requireAuth();

const wizardForm = document.getElementById('wizard-form');
const wizardResult = document.getElementById('wizard-result');
const wizardQuestion = document.getElementById('wizard-question');
const wizardOptions = document.getElementById('wizard-options');
const wizardResetButton = document.getElementById('wizard-reset');
const chatShell = document.getElementById('chat-shell');

const chatContainer = document.getElementById('chat');
const chatForm = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

const bookingSection = document.getElementById('booking-section');
const bookingForm = document.getElementById('booking-form');
const bookingResult = document.getElementById('booking-result');
const bookingKitId = document.getElementById('booking-kit-id');
const wizardState = {
  rootNodeId: null,
  currentNodeId: null,
  nodesById: new Map(),
  outgoingByNodeId: new Map()
};

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function renderMessage(text, sender = 'ai') {
  const bubble = document.createElement('div');
  bubble.className = `message ${sender}`;
  bubble.textContent = text;
  chatContainer.appendChild(bubble);
  scrollToBottom();
}

function renderKitCard(kit) {
  if (!kit) return;

  const card = document.createElement('article');
  card.className = 'card kit-card';

  card.innerHTML = `
    <h3>${kit.name}</h3>
    <p class="subtext">${kit.description || 'AI recommended this kit based on your diagnosis.'}</p>
    <p><strong>Price:</strong> ${kit.price ? formatCurrency(kit.price, kit.currency) : 'See store'}</p>
    <a class="button secondary" href="/store.html?category=${encodeURIComponent(kit.category || '')}">View Kit</a>
  `;

  chatContainer.appendChild(card);

  if (bookingKitId && kit.id) {
    bookingKitId.value = String(kit.id);
  }

  scrollToBottom();
}

function renderTechnicianPrompt(message = 'This issue may require onsite setup or inspection.') {
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  wrapper.innerHTML = `
    <p class="warning">⚠️ Technician recommended</p>
    <p class="subtext">${message}</p>
    <button class="button secondary" id="jump-to-booking">Book Installation</button>
  `;

  chatContainer.appendChild(wrapper);
  bookingSection.classList.remove('hidden');

  const button = document.getElementById('jump-to-booking');
  button?.addEventListener('click', () => {
    bookingSection.scrollIntoView({ behavior: 'smooth' });
  });

  scrollToBottom();
}

function renderWizardResult(payload) {
  const viewKitLink = payload.category ? `/store.html?category=${encodeURIComponent(payload.category)}` : '/store.html';
  const recommendedItems = Array.isArray(payload.recommendedItems) ? payload.recommendedItems : [];
  const recommendedSection = recommendedItems.length
    ? `
      <section class="recommended-section">
        <h4>Recommended for You</h4>
        <div class="recommended-scroll">
          ${recommendedItems
            .map(
              (item) => `
                <article class="card recommended-item-card">
                  ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" loading="lazy" />` : '<div class="recommended-image-placeholder">No Image</div>'}
                  <h5>${item.name || `${item.type} #${item.id}`}</h5>
                  <p class="subtext">${item.type}</p>
                  <p><strong>Price:</strong> ${formatCurrency(item.price, item.currency)}</p>
                  <div class="kit-card-actions">
                    <a class="button secondary" href="${buildStoreLink(item)}">View</a>
                    <button class="button primary" type="button" data-buy-item="${encodeURIComponent(JSON.stringify({ type: item.type, id: item.id, category: item.category || '' }))}">Buy</button>
                  </div>
                </article>
              `
            )
            .join('')}
        </div>
      </section>
    `
    : '';

  wizardResult.classList.remove('hidden');
  wizardResult.innerHTML = `
    <h3>Recommended Category: ${payload.category || 'General'}</h3>
    <p class="subtext">${payload.message}</p>
    ${payload.needsTechnician ? '<p class="warning">⚠️ We recommend booking a technician</p>' : '<p class="success">✅ No onsite technician required.</p>'}
    ${recommendedSection}
    <div class="kit-card-actions">
      <a class="button secondary" href="${viewKitLink}">Visit Store</a>
      <button id="book-teck" class="button primary" type="button">Book a teck</button>
    </div>
  `;

  document.getElementById('book-teck')?.addEventListener('click', () => {
    bookingSection.classList.remove('hidden');
    bookingSection.scrollIntoView({ behavior: 'smooth' });
  });

  wizardResult.querySelectorAll('[data-buy-item]').forEach((button) => {
    button.addEventListener('click', () => {
      const raw = button.getAttribute('data-buy-item');
      if (!raw) return;
      handleWizardBuy(raw);
    });
  });
}

function buildStoreLink(item) {
  const params = new URLSearchParams();
  if (item.type === 'product') params.set('product_id', item.id);
  if (item.type === 'kit') params.set('kit_id', item.id);
  if (item.type === 'service') params.set('service_id', item.id);
  if (item.category) params.set('category', item.category);
  const query = params.toString();
  return `/store.html${query ? `?${query}` : ''}`;
}

function handleWizardBuy(rawItem) {
  let item;
  try {
    item = JSON.parse(decodeURIComponent(rawItem));
  } catch (_error) {
    return;
  }

  if (!localStorage.getItem('token')) {
    window.location.href = '/login.html';
    return;
  }

  window.location.href = buildStoreLink(item);
}

function resolveItemLink(item, action = 'view') {
  if (item.type === 'product') return `/store.html#product-grid`;
  if (item.type === 'service') return '/store.html';
  if (item.type === 'kit') {
    const base = `/store.html?category=${encodeURIComponent(item.category || '')}`;
    return action === 'buy' ? `${base}#kit-grid` : base;
  }
  return '/store.html';
}

function formatCurrency(price, currency = 'ZAR') {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) return 'Contact us';
  if (currency === 'ZAR') return `R ${numericPrice.toFixed(2)}`;
  if (currency === 'USD') return `$ ${numericPrice.toFixed(2)}`;
  return `${numericPrice.toFixed(2)}`;
}

function setWizardTree(payload) {
  wizardState.rootNodeId = payload.rootNodeId;
  wizardState.currentNodeId = payload.rootNodeId;
  wizardState.nodesById = new Map((payload.nodes || []).map((node) => [node.id, node]));
  wizardState.outgoingByNodeId = new Map();

  for (const edge of payload.edges || []) {
    if (!wizardState.outgoingByNodeId.has(edge.from_node_id)) {
      wizardState.outgoingByNodeId.set(edge.from_node_id, []);
    }
    wizardState.outgoingByNodeId.get(edge.from_node_id).push(edge);
  }
}

function renderCurrentWizardNode() {
  const node = wizardState.nodesById.get(wizardState.currentNodeId);
  if (!node) {
    wizardQuestion.textContent = 'Wizard configuration is incomplete.';
    wizardOptions.innerHTML = '';
    return;
  }

  if (node.type === 'result') {
    wizardQuestion.textContent = 'Diagnosis complete.';
    wizardOptions.innerHTML = '';
    renderWizardResult({
      message: node.message || 'No recommendation message configured.',
      category: node.category || null,
      needsTechnician: Boolean(node.needs_technician),
      recommendedItems: node.recommendedItems || node.recommended_items || []
    });
    return;
  }

  wizardResult.classList.add('hidden');
  wizardQuestion.textContent = node.title;
  const edges = wizardState.outgoingByNodeId.get(node.id) || [];
  if (!edges.length) {
    wizardOptions.innerHTML = '<p class="subtext">No options configured for this question yet.</p>';
    return;
  }

  wizardOptions.innerHTML = edges
    .map(
      (edge) =>
        `<button class="button secondary" type="button" data-wizard-next="${edge.to_node_id}">${edge.label}</button>`
    )
    .join('');

  document.querySelectorAll('[data-wizard-next]').forEach((button) => {
    button.addEventListener('click', () => {
      wizardState.currentNodeId = Number(button.dataset.wizardNext);
      renderCurrentWizardNode();
    });
  });
}

async function loadWizardTree() {
  try {
    const response = await fetch('/ai/wizard/tree');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Failed to load wizard tree.');
    setWizardTree(payload);
    renderCurrentWizardNode();
  } catch (error) {
    wizardResult.classList.remove('hidden');
    wizardResult.innerHTML = `<p class="warning">Error: ${error.message}</p>`;
  }
}

async function sendChat(message) {
  const response = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Unexpected server error.');
  }

  return payload;
}

if (session) {
  chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();

    if (!message) return;

    renderMessage(message, 'user');
    input.value = '';
    sendButton.disabled = true;

    try {
      const payload = await sendChat(message);
      renderMessage(payload.reply, 'ai');

      if (payload.recommendedKit) {
        renderKitCard(payload.recommendedKit);
      }

      if (payload.needsTechnician) {
        renderTechnicianPrompt();
      }
    } catch (error) {
      renderMessage(`Error: ${error.message}`, 'ai');
    } finally {
      sendButton.disabled = false;
      input.focus();
    }
  });

  bookingForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const body = {
      name: document.getElementById('booking-name').value.trim(),
      phone: document.getElementById('booking-phone').value.trim(),
      address: document.getElementById('booking-address').value.trim(),
      kit_id: Number(document.getElementById('booking-kit-id').value || 0)
    };

    if (!body.kit_id) {
      delete body.kit_id;
    }

    try {
      const response = await fetch('/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Booking request failed.');
      }

      bookingResult.textContent = `Booking created successfully. Reference #${payload.booking.id}`;
      bookingResult.className = 'success';
      bookingForm.reset();
    } catch (error) {
      bookingResult.textContent = `Error: ${error.message}`;
      bookingResult.className = 'warning';
    }
  });

  wizardForm.addEventListener('submit', (event) => event.preventDefault());
  wizardResetButton?.addEventListener('click', () => {
    wizardState.currentNodeId = wizardState.rootNodeId;
    wizardResult.classList.add('hidden');
    renderCurrentWizardNode();
  });

  loadWizardTree();
}
