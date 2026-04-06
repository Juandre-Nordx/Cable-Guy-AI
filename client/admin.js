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
  services: [],
  wizard: {
    nodes: [],
    edges: [],
    selectedConnections: [],
    selectedNodeId: null,
    connectMode: false,
    connectSourceId: null
  }
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
  document.getElementById('refresh-wizard').addEventListener('click', loadWizardBuilder);
  document.getElementById('wizard-add-node').addEventListener('click', createWizardNodeDraft);
  document.getElementById('wizard-connect-mode').addEventListener('click', toggleWizardConnectMode);
}

function bindFormEvents() {
  document.getElementById('product-form').addEventListener('submit', submitProduct);
  document.getElementById('kit-form').addEventListener('submit', submitKit);
  document.getElementById('service-form').addEventListener('submit', submitService);
  document.getElementById('wizard-node-form').addEventListener('submit', submitWizardNode);
  document.getElementById('wizard-delete-node').addEventListener('click', deleteWizardNodeBySelection);
  document.getElementById('wizard-edge-form').addEventListener('submit', submitWizardEdge);
  document.querySelector('#wizard-node-form select[name="type"]').addEventListener('change', toggleWizardResultFields);
}

async function bootAdmin() {
  try {
    await Promise.all([loadDashboard(), loadUsers(), loadOrders(), loadProducts(), loadKits(), loadServices(), loadWizardBuilder()]);
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
      category: data.get('category')?.toString(),
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
        <td>${kit.category}</td>
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
    ? `<table><thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Price</th><th>Difficulty</th><th>Technician</th><th>Guide</th><th>Image</th><th>Video</th></tr></thead><tbody>${rows}</tbody></table>`
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

async function loadWizardBuilder() {
  const [nodesPayload, edgesPayload] = await Promise.all([apiFetch('/admin/wizard/nodes'), apiFetch('/admin/wizard/edges')]);
  state.wizard.nodes = nodesPayload.nodes || [];
  state.wizard.edges = edgesPayload.edges || [];

  if (!state.wizard.nodes.some((node) => node.id === state.wizard.selectedNodeId)) {
    state.wizard.selectedNodeId = state.wizard.nodes[0]?.id || null;
  }

  renderWizardBuilder();
  await loadWizardConnections(state.wizard.selectedNodeId);
}

function renderWizardBuilder() {
  renderWizardNodeList();
  renderWizardGraph();
  renderWizardNodeEditor();
  renderWizardEdgeEditor();
  updateWizardConnectModeButton();
}

async function loadWizardConnections(nodeId) {
  const edgeList = document.getElementById('wizard-edge-list');
  const countLabel = document.getElementById('wizard-connection-count');
  if (!nodeId) {
    state.wizard.selectedConnections = [];
    countLabel.textContent = '0';
    edgeList.innerHTML = '<p class="subtext">Select a node to manage connections.</p>';
    return;
  }

  try {
    const payload = await apiFetch(`/admin/wizard/edges?node_id=${nodeId}`);
    state.wizard.selectedConnections = payload.edges || [];
    renderExistingConnections();
  } catch (error) {
    state.wizard.selectedConnections = [];
    countLabel.textContent = '0';
    edgeList.innerHTML = `<p class="warning">${error.message}</p>`;
  }
}

function renderWizardNodeList() {
  const list = document.getElementById('wizard-node-list');
  if (!state.wizard.nodes.length) {
    list.innerHTML = '<p class="subtext">No nodes yet.</p>';
    return;
  }

  list.innerHTML = state.wizard.nodes
    .map(
      (node) => `
      <button type="button" class="wizard-node-item ${node.id === state.wizard.selectedNodeId ? 'selected' : ''}" data-wizard-node="${node.id}">
        <strong>${escapeHtml(node.title)}</strong>
        <div class="wizard-node-type">${node.type} #${node.id}</div>
      </button>
    `
    )
    .join('');

  document.querySelectorAll('[data-wizard-node]').forEach((button) => {
    button.addEventListener('click', () => {
      handleWizardNodeClick(Number(button.dataset.wizardNode));
    });
  });
}

function renderWizardNodeEditor() {
  const form = document.getElementById('wizard-node-form');
  const node = state.wizard.nodes.find((entry) => entry.id === state.wizard.selectedNodeId);
  const messageLabel = form.querySelector('[data-role="wizard-message-field"]');

  if (!node) {
    form.reset();
    form.elements.id.value = '';
    messageLabel.classList.remove('hidden');
    return;
  }

  form.elements.id.value = String(node.id);
  form.elements.title.value = node.title || '';
  form.elements.type.value = node.type || 'question';
  form.elements.message.value = node.message || '';
  form.elements.category.value = node.category || '';
  form.elements.needs_technician.checked = Boolean(node.needs_technician);
  toggleWizardResultFields();
}

function renderWizardEdgeEditor() {
  const node = state.wizard.nodes.find((entry) => entry.id === state.wizard.selectedNodeId);
  const targetSelect = document.getElementById('wizard-edge-target');
  const edgeList = document.getElementById('wizard-edge-list');

  const options = state.wizard.nodes
    .filter((entry) => entry.id !== state.wizard.selectedNodeId)
    .map((entry) => `<option value="${entry.id}">${escapeHtml(entry.title)} (#${entry.id})</option>`)
    .join('');

  targetSelect.innerHTML = options || '<option value="">No target nodes</option>';

  if (!node) {
    edgeList.innerHTML = '<p class="subtext">Select a node to edit connections.</p>';
    return;
  }
  renderExistingConnections();
}

function renderExistingConnections() {
  const edgeList = document.getElementById('wizard-edge-list');
  const countLabel = document.getElementById('wizard-connection-count');
  const currentNodeId = state.wizard.selectedNodeId;

  if (!currentNodeId) {
    countLabel.textContent = '0';
    edgeList.innerHTML = '<p class="subtext">Select a node to manage connections.</p>';
    return;
  }

  const outgoing = state.wizard.selectedConnections || [];
  countLabel.textContent = `${outgoing.length}`;

  if (!outgoing.length) {
    edgeList.innerHTML = '<p class="subtext">No outgoing connections yet.</p>';
    return;
  }

  edgeList.innerHTML = outgoing
    .map((edge) => {
      const targetOptions = state.wizard.nodes
        .filter((entry) => entry.id !== currentNodeId)
        .map(
          (entry) => `<option value="${entry.id}" ${entry.id === edge.to_node_id ? 'selected' : ''}>${escapeHtml(entry.title)} (#${entry.id})</option>`
        )
        .join('');

      return `
        <div class="wizard-edge-pill wizard-edge-edit" data-edge-row="${edge.id}">
          <input type="text" value="${escapeHtml(edge.label)}" data-edge-label="${edge.id}" />
          <select data-edge-target="${edge.id}">${targetOptions}</select>
          <button class="button primary" type="button" data-save-edge="${edge.id}">Save</button>
          <button class="button secondary" type="button" data-delete-edge="${edge.id}">Delete</button>
        </div>
      `;
    })
    .join('');

  document.querySelectorAll('[data-save-edge]').forEach((button) => {
    button.addEventListener('click', () => updateWizardEdge(Number(button.dataset.saveEdge)));
  });

  document.querySelectorAll('[data-delete-edge]').forEach((button) => {
    button.addEventListener('click', () => deleteWizardEdge(Number(button.dataset.deleteEdge), true));
  });
}

function renderWizardGraph() {
  const graph = document.getElementById('wizard-graph');
  if (!state.wizard.nodes.length) {
    graph.innerHTML = '<p class="subtext">Create your first node to start building the tree.</p>';
    return;
  }

  const layout = computeWizardLayout();
  const nodeBoxes = state.wizard.nodes
    .map((node) => {
      const position = layout.get(node.id) || { x: 20, y: 20 };
      return `
        <button
          type="button"
          class="wizard-node-box ${node.type} ${node.id === state.wizard.selectedNodeId ? 'selected' : ''}"
          style="left:${position.x}px; top:${position.y}px;"
          data-wizard-graph-node="${node.id}"
        >
          <strong>${escapeHtml(node.title)}</strong>
          <div class="wizard-node-type">${node.type}</div>
        </button>
      `;
    })
    .join('');

  const edgeLines = state.wizard.edges
    .map((edge) => {
      const from = layout.get(edge.from_node_id);
      const to = layout.get(edge.to_node_id);
      if (!from || !to) return '';
      const x1 = from.x + 180;
      const y1 = from.y + 35;
      const x2 = to.x;
      const y2 = to.y + 35;
      const labelX = (x1 + x2) / 2;
      const labelY = (y1 + y2) / 2 - 6;
      return `
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#334155" stroke-width="2"></line>
        <text x="${labelX}" y="${labelY}" fill="#0f172a" font-size="11" text-anchor="middle">${escapeHtml(edge.label)}</text>
      `;
    })
    .join('');

  graph.innerHTML = `
    <svg viewBox="0 0 1500 1200" preserveAspectRatio="none">${edgeLines}</svg>
    ${nodeBoxes}
  `;

  document.querySelectorAll('[data-wizard-graph-node]').forEach((button) => {
    button.addEventListener('click', () => handleWizardNodeClick(Number(button.dataset.wizardGraphNode)));
  });
}

function computeWizardLayout() {
  const outgoingMap = new Map();
  const incomingCount = new Map(state.wizard.nodes.map((node) => [node.id, 0]));

  for (const edge of state.wizard.edges) {
    if (!outgoingMap.has(edge.from_node_id)) outgoingMap.set(edge.from_node_id, []);
    outgoingMap.get(edge.from_node_id).push(edge.to_node_id);
    incomingCount.set(edge.to_node_id, (incomingCount.get(edge.to_node_id) || 0) + 1);
  }

  const roots = state.wizard.nodes.filter((node) => (incomingCount.get(node.id) || 0) === 0).map((node) => node.id);
  const queue = roots.length ? [...roots] : [state.wizard.nodes[0].id];
  const depth = new Map(queue.map((id) => [id, 0]));

  while (queue.length) {
    const currentId = queue.shift();
    const nextDepth = (depth.get(currentId) || 0) + 1;
    for (const nextId of outgoingMap.get(currentId) || []) {
      if (!depth.has(nextId) || nextDepth < depth.get(nextId)) {
        depth.set(nextId, nextDepth);
        queue.push(nextId);
      }
    }
  }

  for (const node of state.wizard.nodes) {
    if (!depth.has(node.id)) depth.set(node.id, 0);
  }

  const columns = new Map();
  for (const node of state.wizard.nodes) {
    const column = depth.get(node.id) || 0;
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(node.id);
  }

  const layout = new Map();
  const sortedColumns = Array.from(columns.keys()).sort((a, b) => a - b);
  for (const column of sortedColumns) {
    const ids = columns.get(column);
    ids.forEach((id, rowIndex) => {
      layout.set(id, { x: 30 + column * 240, y: 30 + rowIndex * 110 });
    });
  }

  return layout;
}

function handleWizardNodeClick(nodeId) {
  if (state.wizard.connectMode) {
    if (!state.wizard.connectSourceId) {
      state.wizard.connectSourceId = nodeId;
      setFormMessage('wizard-edge-message', `Connection source selected: node #${nodeId}. Now click the target node.`, 'subtext');
      return;
    }

    if (state.wizard.connectSourceId === nodeId) {
      setFormMessage('wizard-edge-message', 'Choose a different target node.', 'warning');
      return;
    }

    const label = window.prompt('Connection label (example: Yes, No, Fibre):');
    if (!label?.trim()) return;

    createWizardEdge({ from_node_id: state.wizard.connectSourceId, to_node_id: nodeId, label: label.trim() });
    state.wizard.connectSourceId = null;
    return;
  }

  state.wizard.selectedNodeId = nodeId;
  renderWizardBuilder();
  loadWizardConnections(nodeId);
}

function toggleWizardConnectMode() {
  state.wizard.connectMode = !state.wizard.connectMode;
  state.wizard.connectSourceId = null;
  updateWizardConnectModeButton();
  setFormMessage('wizard-edge-message', state.wizard.connectMode ? 'Connect mode enabled. Click source node then target node.' : '', 'subtext');
}

function updateWizardConnectModeButton() {
  const button = document.getElementById('wizard-connect-mode');
  button.textContent = `Connect: ${state.wizard.connectMode ? 'On' : 'Off'}`;
  button.classList.toggle('primary', state.wizard.connectMode);
  button.classList.toggle('secondary', !state.wizard.connectMode);
}

function toggleWizardResultFields() {
  const form = document.getElementById('wizard-node-form');
  const isResult = form.elements.type.value === 'result';
  form.querySelector('[data-role="wizard-message-field"]').classList.toggle('hidden', !isResult);
}

function createWizardNodeDraft() {
  const form = document.getElementById('wizard-node-form');
  form.reset();
  form.elements.id.value = '';
  form.elements.type.value = 'question';
  toggleWizardResultFields();
  state.wizard.selectedNodeId = null;
  renderWizardBuilder();
}

async function submitWizardNode(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = Number(form.elements.id.value || 0);
  const payload = {
    title: form.elements.title.value.trim(),
    type: form.elements.type.value,
    message: form.elements.message.value.trim(),
    category: form.elements.category.value.trim() || null,
    needs_technician: form.elements.needs_technician.checked
  };

  try {
    if (id) {
      await apiFetch(`/admin/wizard/node/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setFormMessage('wizard-node-message', 'Node updated.', 'success');
    } else {
      const response = await apiFetch('/admin/wizard/node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      state.wizard.selectedNodeId = response.node.id;
      setFormMessage('wizard-node-message', 'Node created.', 'success');
    }

    await loadWizardBuilder();
  } catch (error) {
    setFormMessage('wizard-node-message', error.message, 'warning');
  }
}

async function deleteWizardNodeBySelection() {
  const nodeId = state.wizard.selectedNodeId;
  if (!nodeId) {
    setFormMessage('wizard-node-message', 'Select a node first.', 'warning');
    return;
  }

  if (!window.confirm(`Delete node #${nodeId}? Related connections will be removed.`)) return;

  try {
    await apiFetch(`/admin/wizard/node/${nodeId}`, { method: 'DELETE' });
    state.wizard.selectedNodeId = null;
    setFormMessage('wizard-node-message', 'Node deleted.', 'success');
    await loadWizardBuilder();
  } catch (error) {
    setFormMessage('wizard-node-message', error.message, 'warning');
  }
}

async function submitWizardEdge(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const fromNodeId = state.wizard.selectedNodeId;
  const toNodeId = Number(form.elements.to_node_id.value);
  const label = form.elements.label.value.trim();

  if (!fromNodeId) {
    setFormMessage('wizard-edge-message', 'Select a source node first.', 'warning');
    return;
  }

  await createWizardEdge({ from_node_id: fromNodeId, to_node_id: toNodeId, label });
  form.reset();
}

async function createWizardEdge(payload) {
  try {
    await apiFetch('/admin/wizard/edge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setFormMessage('wizard-edge-message', 'Connection created.', 'success');
    await loadWizardBuilder();
    await loadWizardConnections(state.wizard.selectedNodeId);
  } catch (error) {
    setFormMessage('wizard-edge-message', error.message, 'warning');
  }
}

async function updateWizardEdge(edgeId) {
  const labelInput = document.querySelector(`[data-edge-label="${edgeId}"]`);
  const targetSelect = document.querySelector(`[data-edge-target="${edgeId}"]`);
  const label = labelInput?.value?.trim();
  const toNodeId = Number(targetSelect?.value);

  try {
    await apiFetch(`/admin/wizard/edge/${edgeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, to_node_id: toNodeId })
    });

    setFormMessage('wizard-edge-message', 'Connection updated.', 'success');
    await loadWizardBuilder();
    await loadWizardConnections(state.wizard.selectedNodeId);
  } catch (error) {
    setFormMessage('wizard-edge-message', error.message, 'warning');
  }
}

async function deleteWizardEdge(edgeId, confirmDelete = false) {
  if (confirmDelete) {
    const ok = window.confirm('Are you sure you want to delete this connection?');
    if (!ok) return;
  }

  try {
    await apiFetch(`/admin/wizard/edge/${edgeId}`, { method: 'DELETE' });
    setFormMessage('wizard-edge-message', 'Connection deleted.', 'success');
    await loadWizardBuilder();
    await loadWizardConnections(state.wizard.selectedNodeId);
  } catch (error) {
    setFormMessage('wizard-edge-message', error.message, 'warning');
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
