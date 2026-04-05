const form = document.getElementById('login-form');
const result = document.getElementById('result');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const body = {
    email: document.getElementById('email').value.trim(),
    password: document.getElementById('password').value
  };

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Login failed.');
    }

    saveSession(payload.token, payload.user);
    result.className = 'success';
    result.textContent = 'Login successful. Redirecting...';
    redirectAfterAuth(payload);
  } catch (error) {
    result.className = 'warning';
    result.textContent = error.message;
  }
});
