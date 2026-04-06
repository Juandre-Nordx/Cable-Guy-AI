function normalizeApiBase(rawValue = '') {
  return String(rawValue).trim().replace(/\/+$/, '');
}

function getConfiguredApiBase() {
  const fromWindow = typeof window !== 'undefined' ? window.CABLE_GUY_API_BASE_URL : '';
  const fromStorage = localStorage.getItem('api_base_url') || '';
  return normalizeApiBase(fromStorage || fromWindow);
}

function isApiRoute(pathname = '') {
  return [
    '/auth',
    '/admin',
    '/orders',
    '/bookings',
    '/chat',
    '/ai',
    '/kits',
    '/products',
    '/services',
    '/users',
    '/settings'
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function resolveApiUrl(input) {
  const apiBase = getConfiguredApiBase();
  if (!apiBase || typeof input !== 'string' || !input.startsWith('/')) {
    return input;
  }

  if (!isApiRoute(input)) {
    return input;
  }

  return `${apiBase}${input}`;
}

if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string') {
      return nativeFetch(resolveApiUrl(input), init);
    }

    if (input instanceof Request) {
      const resolved = resolveApiUrl(input.url);
      if (resolved === input.url) {
        return nativeFetch(input, init);
      }
      return nativeFetch(new Request(resolved, input), init);
    }

    return nativeFetch(input, init);
  };
}

function setApiBaseUrl(url) {
  const normalized = normalizeApiBase(url);
  if (normalized) {
    localStorage.setItem('api_base_url', normalized);
  } else {
    localStorage.removeItem('api_base_url');
  }
  return normalized;
}

function getToken() {
  return localStorage.getItem('token') || '';
}

function isLoggedIn() {
  return !!localStorage.getItem('token');
}

function requireStoreAccess() {
  if (!isLoggedIn()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

function getUser() {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function saveSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function resolveRole(payload = {}) {
  return payload.role || payload.user?.role || 'user';
}

function redirectAfterAuth(payload = {}) {
  const role = resolveRole(payload);
  window.location.href = role === 'admin' ? '/admin.html' : '/dashboard.html';
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}

function requireAuth() {
  const token = getToken();
  const user = getUser();
  if (!token || !user) {
    window.location.href = '/login.html';
    return null;
  }
  return { token, user };
}

function authHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}
