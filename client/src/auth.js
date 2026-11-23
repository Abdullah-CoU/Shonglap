const USER_KEY = 'user';

export function getUser() {
  const u = localStorage.getItem(USER_KEY);
  return u ? JSON.parse(u) : null;
}

export function setUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function clearAuth() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('token'); // cleanup legacy
}

export async function logout() {
  try {
    const base = import.meta.env.VITE_API_URL || '';
    await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // ignore network errors; local cleanup still happens
  }
  clearAuth();
}

export function authHeaders() {
  // Auth is handled by secure HttpOnly cookie. Keep function for compatibility.
  return {};
}

export function isAuthenticated() {
  return !!getUser();
}

export function isAdmin() {
  const user = getUser();
  return user?.role === 'admin';
}
