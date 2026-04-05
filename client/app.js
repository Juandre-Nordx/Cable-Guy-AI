const chatContainer = document.getElementById('chat');
const chatForm = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

const kitCatalog = {
  'Wireless Bridge Kit': {
    description: 'Point-to-point wireless bridge for long distance links between buildings.',
    url: '#'
  },
  'Home WiFi Kit': {
    description: 'Mesh WiFi pack for whole-home coverage and stable roaming.',
    url: '#'
  },
  'Business Kit': {
    description: 'Higher-capacity network bundle for offices, shops, and multi-device environments.',
    url: '#'
  }
};

function detectKit(message) {
  const text = message.toLowerCase();

  if (text.includes('bridge')) return 'Wireless Bridge Kit';
  if (text.includes('business kit')) return 'Business Kit';
  if (text.includes('home wifi kit')) return 'Home WiFi Kit';

  return null;
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function renderMessage(text, sender = 'ai') {
  const row = document.createElement('div');
  row.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;

  const bubble = document.createElement('div');
  bubble.className = `max-w-[80%] rounded-2xl px-4 py-3 whitespace-pre-wrap shadow-sm ${
    sender === 'user'
      ? 'bg-slate-800 text-white rounded-br-sm'
      : 'bg-white border border-slate-200 text-slate-900 rounded-bl-sm'
  }`;
  bubble.textContent = text;

  row.appendChild(bubble);
  chatContainer.appendChild(row);

  const detectedKit = sender === 'ai' ? detectKit(text) : null;
  if (detectedKit) {
    renderKitCard(detectedKit);
  }

  scrollToBottom();
}

function renderKitCard(kitName) {
  const kit = kitCatalog[kitName];
  if (!kit) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'flex justify-start';

  const card = document.createElement('article');
  card.className = 'max-w-[80%] bg-indigo-50 border border-indigo-200 rounded-xl p-4 shadow-sm';
  card.innerHTML = `
    <h3 class="font-semibold text-indigo-900">${kitName}</h3>
    <p class="text-sm text-indigo-800 mt-1">${kit.description}</p>
    <a href="${kit.url}" class="inline-block mt-3 text-sm font-medium bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700">
      Buy Now
    </a>
  `;

  wrapper.appendChild(card);
  chatContainer.appendChild(wrapper);
  scrollToBottom();
}

function showLoading() {
  const row = document.createElement('div');
  row.id = 'loading-row';
  row.className = 'flex justify-start';
  row.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-2 text-slate-500">
      <span class="w-2.5 h-2.5 bg-slate-400 rounded-full animate-bounce"></span>
      <span class="w-2.5 h-2.5 bg-slate-400 rounded-full animate-bounce [animation-delay:120ms]"></span>
      <span class="w-2.5 h-2.5 bg-slate-400 rounded-full animate-bounce [animation-delay:240ms]"></span>
    </div>
  `;

  chatContainer.appendChild(row);
  scrollToBottom();
}

function hideLoading() {
  const loading = document.getElementById('loading-row');
  if (loading) loading.remove();
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  renderMessage(message, 'user');
  input.value = '';
  input.focus();
  sendButton.disabled = true;
  showLoading();

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Unexpected server error');
    }

    renderMessage(payload.reply, 'ai');
  } catch (error) {
    renderMessage(`Error: ${error.message}`, 'ai');
  } finally {
    hideLoading();
    sendButton.disabled = false;
  }
});

renderMessage(
  'Hi, I am Cable Guy AI. Tell me what network issue you are facing and I will ask a few diagnostic questions first.',
  'ai'
);
