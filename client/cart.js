const session = requireAuth();
const cartItems = document.getElementById('cart-items');
const cartTotal = document.getElementById('cart-total');
const checkoutModal = document.getElementById('checkoutModal');

function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatCurrency(amount, currency = 'ZAR') {
  const value = Number(amount || 0);
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'R';
  return `${symbol} ${value.toFixed(2)}`;
}

function getCart() {
  return JSON.parse(localStorage.getItem('cart') || '[]');
}

function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
}

function clearCart() {
  localStorage.removeItem('cart');
}

function renderCart() {
  const cart = getCart();

  if (!cart.length) {
    cartItems.innerHTML = '<p class="subtext">Your cart is empty.</p>';
    cartTotal.textContent = formatCurrency(0);
    return;
  }

  cartItems.innerHTML = cart
    .map(
      (item) => `
      <article class="card">
        <p><strong>${escapeHtml(item.name)}</strong></p>
        <p class="subtext">${escapeHtml(item.type)}</p>
        <p>Qty: ${item.qty}</p>
    <p>Price: ${formatCurrency(item.price, item.currency)}</p>
        <button
          class="button secondary remove-cart-item"
          type="button"
          data-id="${item.id}"
          data-type="${item.type}"
        >
          Remove Item
        </button>
      </article>
    `
    )
    .join('');

  const total = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
  const currency = cart[0]?.currency || 'ZAR';
  cartTotal.textContent = formatCurrency(total, currency);
}

function openCheckoutModal() {
  checkoutModal.classList.remove('hidden');
  checkoutModal.classList.add('open');
}

function closeCheckoutModal() {
  checkoutModal.classList.add('hidden');
  checkoutModal.classList.remove('open');
}

async function checkout() {
  const cart = getCart();
  if (!cart.length) {
    window.alert('Your cart is empty.');
    return;
  }

  if (!session) {
    window.location.href = '/login.html';
    return;
  }

  try {
    const res = await fetch('/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify({ items: cart })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Checkout failed.');
    }

    clearCart();
    closeCheckoutModal();
    renderCart();
    window.alert(`Order #${data.order.id} created successfully.`);
    window.location.href = '/dashboard.html';
  } catch (error) {
    console.error('[Cart] checkout failed:', error);
    window.alert(error.message);
  }
}

function removeCartItem(id, type) {
  const updated = getCart().filter((item) => !(String(item.id) === String(id) && item.type === type));
  saveCart(updated);
  renderCart();
}

document.addEventListener('click', async (event) => {
  const removeBtn = event.target.closest('.remove-cart-item');
  const checkoutBtn = event.target.closest('#checkout-btn');
  const closeModalBtn = event.target.closest('#close-checkout-modal, #cancel-checkout-btn');
  const confirmCheckoutBtn = event.target.closest('#confirm-checkout-btn');

  if (removeBtn) {
    event.preventDefault();
    removeCartItem(removeBtn.dataset.id, removeBtn.dataset.type);
    return;
  }

  if (checkoutBtn) {
    event.preventDefault();
    openCheckoutModal();
    return;
  }

  if (closeModalBtn || event.target === checkoutModal) {
    event.preventDefault();
    closeCheckoutModal();
    return;
  }

  if (confirmCheckoutBtn) {
    event.preventDefault();
    confirmCheckoutBtn.disabled = true;
    confirmCheckoutBtn.textContent = 'Processing...';
    await checkout();
    confirmCheckoutBtn.disabled = false;
    confirmCheckoutBtn.textContent = 'Confirm Order';
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && checkoutModal && !checkoutModal.classList.contains('hidden')) {
    closeCheckoutModal();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  renderCart();
  closeCheckoutModal();
});
