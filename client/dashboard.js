const session = requireAuth();

if (session) {
  document.getElementById('welcome').textContent = `Welcome, ${session.user.name}`;
  document.getElementById('logout-link').addEventListener('click', (event) => {
    event.preventDefault();
    logout();
  });

  loadOrders();
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

async function loadOrders() {
  const container = document.getElementById('orders-list');
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
            <p>Kit: ${order.kit_name || 'Unknown'} (${order.kit_category || '-'})</p>
            <p>Status: <strong>${order.status === 'done' ? 'Order Completed' : order.status}</strong></p>
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
