const kitGrid = document.getElementById('kit-grid');
const query = new URLSearchParams(window.location.search);
const highlightedType = query.get('kit');

function renderKit(kit) {
  const card = document.createElement('article');
  card.className = `card kit-card ${highlightedType === kit.type ? 'recommended' : ''}`;

  card.innerHTML = `
    <h2>${kit.name}</h2>
    <p class="subtext">${kit.description}</p>
    <p><strong>Type:</strong> ${kit.type}</p>
    <p><strong>Difficulty:</strong> ${kit.difficulty}</p>
    <p><strong>Price:</strong> $${Number(kit.price).toFixed(2)}</p>
    <button class="button primary" data-kit-id="${kit.id}">Buy Kit</button>
  `;

  const buyButton = card.querySelector('button');
  buyButton?.addEventListener('click', () => placeOrder(kit.id, kit.name));

  return card;
}

async function placeOrder(kitId, kitName) {
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  try {
    const response = await fetch('/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ kit_id: kitId })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to place order.');
    }

    window.alert(`Order placed for ${kitName}. Tracking is available on your dashboard.`);
    window.location.href = '/dashboard.html';
  } catch (error) {
    window.alert(error.message);
  }
}

async function loadKits() {
  try {
    console.log('[Store] Fetching kits from /kits');
    const response = await fetch('/kits');
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Unable to load kits.');
    }

    if (!payload.kits.length) {
      kitGrid.innerHTML = '<p class="subtext">No kits available right now.</p>';
      return;
    }

    payload.kits.forEach((kit) => {
      kitGrid.appendChild(renderKit(kit));
    });
  } catch (error) {
    console.error('[Store] Load failed:', error.message);
    kitGrid.innerHTML = `<p class="warning">Error: ${error.message}</p>`;
  }
}

loadKits();
