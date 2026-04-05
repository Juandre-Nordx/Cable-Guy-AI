const chatContainer = document.getElementById('chat');
const chatForm = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

const bookingSection = document.getElementById('booking-section');
const bookingForm = document.getElementById('booking-form');
const bookingResult = document.getElementById('booking-result');
const bookingKitId = document.getElementById('booking-kit-id');

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
    <p><strong>Price:</strong> ${kit.price ? `$${Number(kit.price).toFixed(2)}` : 'See store'}</p>
    <a class="button secondary" href="/store.html?kit=${encodeURIComponent(kit.type || '')}">View Kit</a>
  `;

  chatContainer.appendChild(card);

  if (bookingKitId && kit.id) {
    bookingKitId.value = String(kit.id);
  }

  scrollToBottom();
}

function renderTechnicianPrompt() {
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  wrapper.innerHTML = `
    <p class="warning">⚠️ Technician recommended</p>
    <p class="subtext">This issue may require onsite setup or inspection.</p>
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

async function sendChat(message) {
  console.log('[AI] Sending message to /chat');
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
    console.error('[AI] Chat error:', error.message);
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

  console.log('[Booking] Submitting booking to /book');

  try {
    const response = await fetch('/book', {
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
    console.error('[Booking] Failed:', error.message);
    bookingResult.textContent = `Error: ${error.message}`;
    bookingResult.className = 'warning';
  }
});

renderMessage('Hi, I am Cable Guy AI. Tell me what is happening with your WiFi and I will guide your diagnosis.', 'ai');
