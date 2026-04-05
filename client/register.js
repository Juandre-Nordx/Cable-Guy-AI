const form = document.getElementById('register-form');
const result = document.getElementById('result');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const body = {
    name: document.getElementById('name').value.trim(),
    contact_number: document.getElementById('contact_number').value.trim(),
    email: document.getElementById('email').value.trim(),
    address: document.getElementById('address').value.trim(),
    password: document.getElementById('password').value
  };

  try {
    const response = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Registration failed.');
    }

    saveSession(payload.token, payload.user);
    result.className = 'success';
    result.textContent = payload.message || 'Registration successful. Redirecting...';
    const role = payload.role || payload.user?.role;
    window.location.href = role === 'admin' ? '/admin.html' : '/dashboard.html';
  } catch (error) {
    result.className = 'warning';
    result.textContent = error.message;
  }
});
