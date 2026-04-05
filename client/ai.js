const wizardForm = document.getElementById('wizard-form');
const wizardSubmitButton = document.getElementById('wizard-submit');
const wizardResult = document.getElementById('wizard-result');
const chatShell = document.getElementById('chat-shell');

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

function renderTechnicianPrompt(message = 'This issue may require onsite setup or inspection.') {
  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  wrapper.innerHTML = `
    <p class="warning">⚠️ Technician recommended</p>
    <p class="subtext">${message}</p>
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

function renderWizardResult(payload) {
  const viewKitLink = `/store.html?kit=${encodeURIComponent(payload.recommendedKitType)}`;

  wizardResult.classList.remove('hidden');
  wizardResult.innerHTML = `
    <h3>Recommended Kit: ${payload.recommendedKitType}</h3>
    <p class="subtext">${payload.message}</p>
    ${payload.needsTechnician ? '<p class="warning">⚠️ We recommend booking a technician</p>' : ''}
    <div class="kit-card-actions">
      <a class="button secondary" href="${viewKitLink}">View Kit</a>
      <button id="continue-chat" class="button primary" type="button">Continue with AI Assistant</button>
    </div>
  `;

  document.getElementById('continue-chat')?.addEventListener('click', () => {
    chatShell.classList.remove('hidden');
    const starter = `Wizard context: problem=${payload.problem}, property=${payload.property_type}, distance=${payload.distance}, self_install=${payload.self_install}. Please provide deeper setup guidance for a ${payload.recommendedKitType} kit.`;
    if (!chatContainer.childElementCount) {
      renderMessage('Hi, I am Cable Guy AI. Tell me what is happening with your WiFi and I will guide your diagnosis.', 'ai');
    }
    renderMessage(starter, 'user');
    input.value = starter;
    chatShell.scrollIntoView({ behavior: 'smooth' });
  });
}

async function runWizard(event) {
  event.preventDefault();
  const data = new FormData(wizardForm);

  const payload = {
    problem: data.get('problem')?.toString(),
    property_type: data.get('property_type')?.toString(),
    distance: data.get('distance')?.toString(),
    self_install: data.get('self_install') === 'yes'
  };

  wizardSubmitButton.disabled = true;
  wizardResult.classList.add('hidden');

  try {
    const response = await fetch('/ai/wizard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || 'Wizard failed to evaluate answers.');
    }

    renderWizardResult({ ...body, ...payload });
  } catch (error) {
    wizardResult.classList.remove('hidden');
    wizardResult.innerHTML = `<p class="warning">Error: ${error.message}</p>`;
  } finally {
    wizardSubmitButton.disabled = false;
  }
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

  try {
    const response = await fetch('/bookings', {
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
    bookingResult.textContent = `Error: ${error.message}`;
    bookingResult.className = 'warning';
  }
});

wizardForm.addEventListener('submit', runWizard);
