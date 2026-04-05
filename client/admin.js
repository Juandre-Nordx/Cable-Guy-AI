const session = requireAuth();

if (session) {
  if (session.user.role !== 'admin') {
    window.location.href = '/dashboard.html';
  } else {
    document.getElementById('logout-link').addEventListener('click', (event) => {
      event.preventDefault();
      logout();
    });

    loadAdminData();
  }
}

async function loadAdminData() {
  try {
    const [dashboardResponse, ordersResponse] = await Promise.all([
      fetch('/admin/dashboard', { headers: authHeaders() }),
      fetch('/admin/orders', { headers: authHeaders() })
    ]);

    const dashboardPayload = await dashboardResponse.json();
    const ordersPayload = await ordersResponse.json();

    if (!dashboardResponse.ok) throw new Error(dashboardPayload.error || 'Failed loading admin stats.');
    if (!ordersResponse.ok) throw new Error(ordersPayload.error || 'Failed loading orders.');

    document.getElementById('total-users').textContent = String(dashboardPayload.stats.total_users);
    document.getElementById('total-orders').textContent = String(dashboardPayload.stats.total_orders);
    document.getElementById('orders-by-status').textContent = JSON.stringify(dashboardPayload.stats.orders_by_status, null, 2);

    renderOrdersTable(ordersPayload.orders);
  } catch (error) {
    document.getElementById('orders-table').innerHTML = `<p class="warning">${error.message}</p>`;
  }
}

function renderOrdersTable(orders) {
  const statuses = ['placed', 'processing', 'out_for_delivery', 'delivered', 'done'];
  const rows = orders
    .map(
      (order) => `
      <tr>
        <td>${order.id}</td>
        <td>${order.customer_name || '-'}</td>
        <td>${order.customer_email || '-'}</td>
        <td>${order.kit_name || '-'}</td>
        <td>
          <select data-order-id="${order.id}">
            ${statuses.map((status) => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${status}</option>`).join('')}
          </select>
        </td>
        <td><button class="button secondary" data-save-order-id="${order.id}">Update</button></td>
      </tr>
    `
    )
    .join('');

  document.getElementById('orders-table').innerHTML = `
    <table>
      <thead>
        <tr><th>ID</th><th>User</th><th>Email</th><th>Kit</th><th>Status</th><th>Action</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  document.querySelectorAll('[data-save-order-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-save-order-id');
      const select = document.querySelector(`select[data-order-id="${id}"]`);
      await updateOrderStatus(id, select.value);
    });
  });
}

async function updateOrderStatus(orderId, status) {
  try {
    const response = await fetch(`/admin/orders/${orderId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status })
    });

    const payload = await response.json();

    if (!response.ok) throw new Error(payload.error || 'Failed to update status.');

    await loadAdminData();
  } catch (error) {
    window.alert(error.message);
  }
}
