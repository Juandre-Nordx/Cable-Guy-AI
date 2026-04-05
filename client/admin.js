const session = requireAuth();

if (session && session.user.role !== 'admin') {
  window.location.href = '/login.html';
}

const ORDER_STATUSES = ['placed', 'processing', 'out_for_delivery', 'delivered', 'done'];
const state = {
  users: [],
  orders: [],
  products: [],
  kits: [],
  services: []
};

if (session) {
  bindLayoutEvents();
  bindFormEvents();
  bootAdmin();
}

function bindLayoutEvents() {
  document.getElementById('logout-button').addEventListener('click', logout);

  document.querySelectorAll('.admin-nav-link').forEach((button) => {
    button.addEventListener('click', () => activateSection(button.dataset.target));
  });

  document.getElementById('refresh-users').addEventListener('click', loadUsers);
  document.getElementById('refresh-orders').addEventListener('click', loadOrders);
  document.getElementById('refresh-products').addEventListener('click', loadProducts);
  document.getElementById('refresh-kits').addEventListener('click', loadKits);
  document.getElementById('refresh-services').addEventListener('click', loadServices);
}

function bindFormEvents() {
  document.getElementById('product-form').addEventListener('submit', submitProduct);
  document.getElementById('kit-form').addEventListener('submit', submitKit);
  document.getElementById('service-form').addEventListener('submit', submitService);
}

async function bootAdmin() {
  try {
    await Promise.all([loadDashboard(), loadUsers(), loadOrders(), loadProducts(), loadKits(), loadServices()]);
    setGlobalMessage('Admin dashboard loaded.', 'success');
  } catch (error) {
    console.error('[Admin] boot failed:', error);
    setGlobalMessage(error.message || 'Admin dashboard failed to load.', 'warning');
  }
}

function activateSection(sectionId) {
  document.querySelectorAll('.admin-section').forEach((section) => {
    section.classList.toggle('hidden', section.id !== sectionId);
  });

  document.querySelectorAll('.admin-nav-link').forEach((button) => {
    button.classList.toggle('active', button.dataset.target === sectionId);
  });

  const activeLabel = document.querySelector(`.admin-nav-link[data-target="${sectionId}"]`)?.textContent;
  document.getElementById('section-title').textContent = activeLabel || 'Dashboard';
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${session.token}`
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return payload;
}

async function loadDashboard() {
  const [dashboardPayload, productsPayload, kitsPayload] = await Promise.all([
    apiFetch('/admin/dashboard'),
    fetch('/products').then((response) => response.json()),
    fetch('/kits').then((response) => response.json())
  ]);

  document.getElementById('total-users').textContent = dashboardPayload.stats.total_users;
  document.getElementById('total-orders').textContent = dashboardPayload.stats.total_orders;
  document.getElementById('orders-by-status').textContent = JSON.stringify(dashboardPayload.stats.orders_by_status, null, 2);
  document.getElementById('total-products').textContent = productsPayload.products?.length || 0;
  document.getElementById('total-kits').textContent = kitsPayload.kits?.length || 0;
}

async function loadUsers() {
  const payload = await apiFetch('/admin/users');
  state.users = payload.users || [];
  renderUsersTable();
}

function renderUsersTable() {
  const rows = state.users
    .map(
      (user) => `
      <tr>
        <td>${user.name}</td>
        <td>${user.email}</td>
        <td>${user.contact_number || '-'}</td>
        <td><span class="role-chip">${user.role}</span></td>
        <td>${new Date(user.created_at).toLocaleString()}</td>
      </tr>
    `
    )
    .join('');

  document.getElementById('users-table-wrap').innerHTML = state.users.length
    ? `<table><thead><tr><th>Name</th><th>Email</th><th>Contact</th><th>Role</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="subtext">No users found.</p>';
}

async function loadOrders() {
  const payload = await apiFetch('/admin/orders');
  state.orders = payload.orders || [];
  renderOrdersTable();
}

function renderOrdersTable() {
  const rows = state.orders
    .map(
      (order) => `
      <tr>
        <td>${order.id}</td>
        <td>${order.customer_name || order.customer_email || '-'}</td>
        <td>${order.kit_name || '-'}</td>
        <td>
          <select data-order-id="${order.id}">
            ${ORDER_STATUSES.map((status) => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${status}</option>`).join('')}
          </select>
        </td>
        <td>${new Date(order.created_at).toLocaleString()}</td>
        <td>
          <div class="admin-order-actions">
            <button class="button secondary" data-update-order="${order.id}">Update</button>
            <button class="button secondary" data-toggle-notes="${order.id}">Notes</button>
          </div>
        </td>
      </tr>
      <tr id="order-notes-row-${order.id}" class="hidden">
        <td colspan="6">
          <div class="order-notes-panel">
            <div id="order-notes-${order.id}" class="order-notes-feed subtext">Loading notes...</div>
            <form class="order-note-form" data-order-note-form="${order.id}">
              <textarea name="message" rows="2" placeholder="Add note"></textarea>
              <button class="button primary" type="submit">Save Note</button>
            </form>
          </div>
        </td>
      </tr>
    `
    )
    .join('');

  document.getElementById('orders-table-wrap').innerHTML = state.orders.length
    ? `<table><thead><tr><th>Order ID</th><th>User</th><th>Kit</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="subtext">No orders found.</p>';

  document.querySelectorAll('[data-update-order]').forEach((button) => {
    button.addEventListener('click', async () => {
      const orderId = button.dataset.updateOrder;
      const status = document.querySelector(`select[data-order-id="${orderId}"]`)?.value;
      if (!status) return;

      try {
        await apiFetch(`/admin/orders/${orderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });

        setGlobalMessage(`Order #${orderId} updated to ${status}.`, 'success');
        await loadOrders();
        await loadDashboard();
      } catch (error) {
        console.error('[Admin] order update failed:', error.message);
        setGlobalMessage(error.message, 'warning');
      }
    });
  });

  document.querySelectorAll('[data-toggle-notes]').forEach((button) => {
    button.addEventListener('click', async () => {
      const orderId = button.dataset.toggleNotes;
      const row = document.getElementById(`order-notes-row-${orderId}`);
      const hidden = row.classList.contains('hidden');
      row.classList.toggle('hidden', !hidden);
      button.textContent = hidden ? 'Hide Notes' : 'Notes';

      if (hidden) {
        await loadAdminOrderNotes(orderId);
      }
    });
  });

  document.querySelectorAll('[data-order-note-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const orderId = form.dataset.orderNoteForm;
      const message = form.querySelector('textarea[name="message"]')?.value?.trim();
      if (!message) return;

      try {
        await apiFetch(`/admin/orders/${orderId}/note`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        });

        form.reset();
        await loadAdminOrderNotes(orderId);
        setGlobalMessage(`Note added to order #${orderId}.`, 'success');
      } catch (error) {
        setGlobalMessage(error.message, 'warning');
      }
    });
  });
}

async function loadAdminOrderNotes(orderId) {
  const notesContainer = document.getElementById(`order-notes-${orderId}`);
  if (!notesContainer) return;

  try {
    const payload = await apiFetch(`/orders/${orderId}/notes`);
    if (!payload.notes.length) {
      notesContainer.innerHTML = '<p class="subtext">No notes yet.</p>';
      return;
    }

    notesContainer.innerHTML = payload.notes
      .map(
        (note) => `
          <p class="order-note ${note.created_by === 'admin' ? 'admin' : 'user'}">
            <strong>[${note.created_by === 'admin' ? 'Admin' : 'User'}]</strong>
            ${note.message}
            <span class="subtext">${new Date(note.created_at).toLocaleString()}</span>
          </p>
        `
      )
      .join('');
  } catch (error) {
    notesContainer.innerHTML = `<p class="warning">${error.message}</p>`;
  }
}

async function submitProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);

  const image = formData.get('image');
  let imageUrl = '';

  try {
    if (image && image.size > 0) {
      imageUrl = await uploadImage(image);
      console.log('[Admin] image uploaded:', imageUrl);
    }

    const productPayload = {
      name: formData.get('name')?.toString().trim(),
      category: formData.get('category')?.toString().trim(),
      price: Number(formData.get('price')),
      cost: Number(formData.get('cost')),
      description: formData.get('description')?.toString().trim() || '',
      image_url: imageUrl || null
    };

    await apiFetch('/admin/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productPayload)
    });

    setFormMessage('product-message', 'Product added successfully.', 'success');
    form.reset();
    await loadProducts();
    await loadDashboard();
  } catch (error) {
    console.error('[Admin] product submit failed:', error.message);
    setFormMessage('product-message', error.message, 'warning');
  }
}

async function submitKit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);

  let imageUrl = '';

  try {
    const image = data.get('image');
    if (image && image.size > 0) {
      imageUrl = await uploadImage(image);
    }

    const payload = {
      name: data.get('name')?.toString().trim(),
      type: data.get('type')?.toString(),
      price: Number(data.get('price')),
      difficulty: data.get('difficulty')?.toString(),
      requires_technician: data.get('requires_technician') === 'on',
      description: data.get('description')?.toString().trim() || '',
      instructions: data.get('instructions')?.toString().trim() || '',
      image_url: imageUrl || null,
      video_url: data.get('video_url')?.toString().trim() || null
    };

    await apiFetch('/admin/kit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setFormMessage('kit-message', 'Kit added successfully.', 'success');
    form.reset();
    await loadKits();
    await loadDashboard();
  } catch (error) {
    console.error('[Admin] kit submit failed:', error.message);
    setFormMessage('kit-message', error.message, 'warning');
  }
}

async function submitService(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);

  const payload = {
    name: data.get('name')?.toString().trim(),
    description: data.get('description')?.toString().trim() || '',
    price: Number(data.get('price'))
  };

  try {
    await apiFetch('/admin/service', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setFormMessage('service-message', 'Service added successfully.', 'success');
    form.reset();
    await loadServices();
  } catch (error) {
    console.error('[Admin] service submit failed:', error.message);
    setFormMessage('service-message', error.message, 'warning');
  }
}

async function uploadImage(file) {
  const payload = new FormData();
  payload.append('image', file);

  const response = await fetch('/admin/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.token}` },
    body: payload
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || 'Image upload failed.');
  }

  return body.imageUrl;
}

async function loadProducts() {
  const payload = await fetch('/products').then((response) => response.json());
  state.products = payload.products || [];
  renderProductsTable();
}

function renderProductsTable() {
  const rows = state.products
    .map(
      (product) => `
      <tr>
        <td>${product.id}</td>
        <td>${product.name}</td>
        <td>${product.category}</td>
        <td>$${Number(product.price).toFixed(2)}</td>
        <td>${product.image_url ? `<a href="${product.image_url}" target="_blank" rel="noopener noreferrer">Image</a>` : '-'}</td>
      </tr>
    `
    )
    .join('');

  document.getElementById('products-table-wrap').innerHTML = state.products.length
    ? `<table><thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Price</th><th>Image</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="subtext">No products found.</p>';
}

async function loadKits() {
  const payload = await fetch('/kits').then((response) => response.json());
  state.kits = payload.kits || [];
  renderKitsTable();
}

function renderKitsTable() {
  const rows = state.kits
    .map(
      (kit) => `
      <tr>
        <td>${kit.id}</td>
        <td>${kit.name}</td>
        <td>${kit.type}</td>
        <td>$${Number(kit.price).toFixed(2)}</td>
        <td>${kit.difficulty}</td>
        <td>${kit.requires_technician ? 'Yes' : 'No'}</td>
        <td>${kit.instructions ? 'Included' : '-'}</td>
        <td>${kit.image_url ? `<a href="${kit.image_url}" target="_blank" rel="noopener noreferrer">Image</a>` : '-'}</td>
        <td>${kit.video_url ? `<a href="${kit.video_url}" target="_blank" rel="noopener noreferrer">Video</a>` : '-'}</td>
      </tr>
    `
    )
    .join('');

  document.getElementById('kits-table-wrap').innerHTML = state.kits.length
    ? `<table><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Price</th><th>Difficulty</th><th>Technician</th><th>Guide</th><th>Image</th><th>Video</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="subtext">No kits found.</p>';
}

async function loadServices() {
  const payload = await fetch('/services').then((response) => response.json());
  state.services = payload.services || [];
  renderServicesTable();
}

function renderServicesTable() {
  const rows = state.services
    .map(
      (service) => `
      <tr>
        <td>${service.id}</td>
        <td>${service.name}</td>
        <td>${service.description}</td>
        <td>$${Number(service.price).toFixed(2)}</td>
      </tr>
    `
    )
    .join('');

  document.getElementById('services-table-wrap').innerHTML = state.services.length
    ? `<table><thead><tr><th>ID</th><th>Name</th><th>Description</th><th>Price</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="subtext">No services found.</p>';
}

function setGlobalMessage(message, style = 'subtext') {
  const element = document.getElementById('global-message');
  element.className = style;
  element.textContent = message;
}

function setFormMessage(id, message, style = 'subtext') {
  const element = document.getElementById(id);
  element.className = style;
  element.textContent = message;
  setGlobalMessage(message, style);
}
