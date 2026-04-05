const session = requireAuth();

if (session) {
  document.getElementById('welcome').textContent = `Welcome, ${session.user.name}`;
  document.getElementById('logout-link').addEventListener('click', (event) => {
    event.preventDefault();
    logout();
  });

  loadOrders();
}

async function loadOrders() {
  const container = document.getElementById('orders-list');
  container.innerHTML = '<p class="subtext">Loading orders...</p>';

  try {
    const response = await fetch('/orders/my', { headers: authHeaders() });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load orders.');
    }

    if (!payload.orders.length) {
      container.innerHTML = '<p class="subtext">No orders yet. Visit the store to place one.</p>';
      return;
    }

    container.innerHTML = payload.orders
      .map(
        (order) => `
          <article class="card">
            <p><strong>Order #${order.id}</strong></p>
            <p>Kit: ${order.kit_name || 'Unknown'} (${order.kit_type || '-'})</p>
            <p>Status: <strong>${order.status}</strong></p>
            <p class="subtext">Placed: ${new Date(order.created_at).toLocaleString()}</p>
          </article>
        `
      )
      .join('');
  } catch (error) {
    container.innerHTML = `<p class="warning">${error.message}</p>`;
  }
}
