// Admin token stored in memory only (no localStorage — blocked in sandboxed iframe)
let _token: string | null = null;

export const auth = {
  getToken: () => _token,
  setToken: (t: string) => { _token = t; },
  clear: () => { _token = null; },
  isLoggedIn: () => !!_token,
};

export function authHeaders() {
  return _token ? { 'Authorization': `Bearer ${_token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
