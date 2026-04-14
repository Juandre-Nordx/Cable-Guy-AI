const session = requireAuth();

const wizardQuestion = document.getElementById('wizard-question');
const wizardOptions = document.getElementById('wizard-options');
const wizardResetButton = document.getElementById('wizard-reset');
const wizardResult = document.getElementById('wizard-result');
const wizardState = { rootNodeId: null, currentNodeId: null, nodesById: new Map(), outgoingByNodeId: new Map() };

function formatCurrency(value, currency = 'ZAR') {
  const amount = Number(value || 0);
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'R';
  return `${symbol} ${amount.toFixed(2)}`;
}

function renderCurrentWizardNode() {
  const node = wizardState.nodesById.get(wizardState.currentNodeId);
  if (!node) return;

  wizardQuestion.textContent = node.title;
  const edges = wizardState.outgoingByNodeId.get(node.id) || [];
  wizardOptions.innerHTML = edges.map((edge) => `<button class="button secondary" type="button" data-next="${edge.to_node_id}">${edge.label}</button>`).join('');

  document.querySelectorAll('[data-next]').forEach((button) => {
    button.addEventListener('click', () => {
      wizardState.currentNodeId = Number(button.dataset.next);
      renderCurrentWizardNode();
    });
  });
}

async function loadWizardTree() {
  if (!wizardQuestion) return;

  try {
    const response = await fetch('/ai/wizard/tree');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Failed to load wizard tree.');

    wizardState.rootNodeId = payload.rootNodeId;
    wizardState.currentNodeId = payload.rootNodeId;
    wizardState.nodesById = new Map((payload.nodes || []).map((node) => [node.id, node]));
    wizardState.outgoingByNodeId = new Map();

    for (const edge of payload.edges || []) {
      if (!wizardState.outgoingByNodeId.has(edge.from_node_id)) wizardState.outgoingByNodeId.set(edge.from_node_id, []);
      wizardState.outgoingByNodeId.get(edge.from_node_id).push(edge);
    }

    renderCurrentWizardNode();
  } catch (error) {
    wizardResult.classList.remove('hidden');
    wizardResult.innerHTML = `<p class="warning">${error.message}</p>`;
  }
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), ...authHeaders() }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload;
}

function renderOrderItems(items = [], currency = 'ZAR') {
  return `<ul>${items.map((item) => `<li>${item.name} (${item.type}) x ${item.qty} — ${formatCurrency(Number(item.price) * Number(item.qty), currency)}</li>`).join('')}</ul>`;
}

async function loadOrders() {
  const container = document.getElementById('orders-list');
  if (!container) return;

  const payload = await apiFetch('/orders/my');
  if (!payload.orders.length) {
    container.innerHTML = '<p class="subtext">No orders yet.</p>';
    return;
  }

  container.innerHTML = payload.orders
    .map(
      (order) => `
        <details class="card">
          <summary><strong>Order #${order.id}</strong> — ${order.status}</summary>
          <p class="subtext">Placed: ${new Date(order.created_at).toLocaleString()}</p>
          <p><strong>Total:</strong> ${formatCurrency(order.total, order.currency)}</p>
          <div>${renderOrderItems(order.items, order.currency)}</div>
          <div class="progress-track"><span class="progress-fill progress-${order.status.replaceAll('_', '-')}"></span></div>
        </details>
      `
    )
    .join('');
}

function activateTab(tab = 'shop') {
  document.getElementById('shop-tab').classList.toggle('hidden', tab !== 'shop');
  document.getElementById('orders-tab').classList.toggle('hidden', tab !== 'orders');
  document.getElementById('account-tab').classList.toggle('hidden', tab !== 'account');
}

if (session) {
  document.getElementById('welcome').textContent = `Welcome, ${session.user.name}`;
  document.getElementById('account-summary').textContent = `${session.user.email} • Role: ${session.user.role}`;

  document.getElementById('logout-link').addEventListener('click', (event) => {
    event.preventDefault();
    logout();
  });

  const tab = new URLSearchParams(window.location.search).get('tab') || 'shop';
  activateTab(tab);

  document.querySelectorAll('[data-tab-link]').forEach((link) => {
    link.classList.toggle('active', link.dataset.tabLink === tab);
  });

  if (tab === 'orders') loadOrders();

  wizardResetButton?.addEventListener('click', () => {
    wizardState.currentNodeId = wizardState.rootNodeId;
    renderCurrentWizardNode();
  });

  loadWizardTree();
}
