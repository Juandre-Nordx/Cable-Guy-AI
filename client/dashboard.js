const session = requireAuth();

const recommendedKits = [
  {
    name: 'Stay Online Kit (UPS)',
    description: 'Keep your router online during load shedding and power cuts.',
    price: 1499,
    currency: 'ZAR',
    image:
      'https://images.unsplash.com/photo-1545259741-2ea3ebf61fa3?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Room Boost Kit',
    description: 'Eliminate weak-signal rooms with stable whole-home coverage.',
    price: 1299,
    currency: 'ZAR',
    image:
      'https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Home Security Kit',
    description: 'Protect entry points with smart cameras and mobile alerts.',
    price: 2499,
    currency: 'ZAR',
    image:
      'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Pro Security Kit',
    description: 'Advanced multi-camera setup for full home monitoring.',
    price: 3999,
    currency: 'ZAR',
    image:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80'
  }
];

function formatCurrency(value, currency = 'ZAR') {
  const amount = Number(value || 0);
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'R';
  return `${symbol} ${amount.toFixed(2)}`;
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders()
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.');
  }

  return payload;
}

function renderMessage(text, sender = 'ai') {
  const chatContainer = document.getElementById('chat');
  if (!chatContainer) return;

  const bubble = document.createElement('div');
  bubble.className = `message ${sender}`;
  bubble.textContent = text;
  chatContainer.appendChild(bubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;
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

function renderRecommendedKits() {
  const container = document.getElementById('recommended-kits');
  if (!container) return;

  container.innerHTML = recommendedKits
    .map(
      (kit) => `
        <article class="card dashboard-kit-card">
          <img src="${kit.image}" alt="${kit.name}" loading="lazy" />
          <h3>${kit.name}</h3>
          <p class="subtext">${kit.description}</p>
          <p><strong>Price:</strong> ${formatCurrency(kit.price, kit.currency)}</p>
          <div class="card-actions">
            <a class="button primary" href="/store.html">Buy Now</a>
            <a class="button outline" href="https://wa.me/27825551234" target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </article>
      `
    )
    .join('');
}

async function loadOrderNotes(orderId) {
  return apiFetch(`/orders/${orderId}/notes`);
}

async function renderOrderNotes(orderId) {
  const container = document.getElementById(`order-notes-${orderId}`);
  if (!container) return;

  try {
    const payload = await loadOrderNotes(orderId);
    if (!payload.notes.length) {
      container.innerHTML = '<p class="subtext">No notes yet.</p>';
      return;
    }

    container.innerHTML = payload.notes
      .map(
        (note) => `
          <p class="order-note ${note.created_by === 'admin' ? 'admin' : 'user'}">
            <strong>[${note.created_by === 'admin' ? 'Admin' : 'You'}]</strong>
            ${note.message}
            <span class="subtext">${new Date(note.created_at).toLocaleString()}</span>
          </p>
        `
      )
      .join('');
  } catch (error) {
    container.innerHTML = `<p class="warning">${error.message}</p>`;
  }
}

function renderOrderItems(items = [], currency = 'ZAR') {
  if (!items.length) {
    return '<p class="subtext">No order items found.</p>';
  }

  return `
    <ul>
      ${items
        .map(
          (item) =>
            `<li>${item.name} (${item.type}) x ${item.qty} — ${formatCurrency(Number(item.price) * Number(item.qty), currency)}</li>`
        )
        .join('')}
    </ul>
  `;
}

async function loadOrders() {
  const container = document.getElementById('orders-list');
  if (!container) return;

  container.innerHTML = '<p class="subtext">Loading orders...</p>';

  try {
    const payload = await apiFetch('/orders/my');

    if (!payload.orders.length) {
      container.innerHTML = '<p class="subtext">No orders yet. Visit the store to place one.</p>';
      return;
    }

    container.innerHTML = payload.orders
      .map(
        (order) => `
          <article class="card">
            <p><strong>Order #${order.id}</strong></p>
            <p>Status: <strong>${order.status === 'done' ? 'Order Completed' : order.status}</strong></p>
            <p>Total: <strong>${formatCurrency(order.total, order.currency)}</strong></p>
            <div>${renderOrderItems(order.items, order.currency)}</div>
            <p class="subtext">Placed: ${new Date(order.created_at).toLocaleString()}</p>
            <div id="order-notes-${order.id}" class="order-notes-feed subtext">Loading notes...</div>
            <form class="order-note-form" data-user-note-form="${order.id}">
              <textarea name="message" rows="2" placeholder="Reply to admin"></textarea>
              <button class="button secondary" type="submit" ${order.status === 'done' ? 'disabled' : ''}>Send</button>
            </form>
          </article>
        `
      )
      .join('');

    await Promise.all(payload.orders.map((order) => renderOrderNotes(order.id)));

    document.querySelectorAll('[data-user-note-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const orderId = form.dataset.userNoteForm;
        const order = payload.orders.find((entry) => String(entry.id) === String(orderId));
        if (order?.status === 'done') {
          return;
        }

        const message = form.querySelector('textarea[name="message"]')?.value?.trim();
        if (!message) return;

        try {
          await apiFetch(`/orders/${orderId}/note`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
          });

          form.reset();
          await renderOrderNotes(orderId);
        } catch (error) {
          window.alert(error.message);
        }
      });
    });
  } catch (error) {
    container.innerHTML = `<p class="warning">${error.message}</p>`;
  }
}

function initDashboardAssistant() {
  const chatForm = document.getElementById('chat-form');
  const input = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');

  if (!chatForm || !input || !sendButton) return;

  renderMessage('Hi! Tell me your WiFi or security issue and I will guide you.');

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
    } catch (error) {
      renderMessage(`Error: ${error.message}`, 'ai');
    } finally {
      sendButton.disabled = false;
      input.focus();
    }
  });
}

if (session) {
  document.getElementById('welcome').textContent = `Welcome, ${session.user.name}`;
  document.getElementById('logout-link').addEventListener('click', (event) => {
    event.preventDefault();
    logout();
  });

  renderRecommendedKits();
  initDashboardAssistant();
  loadOrders();
}
