import axios from 'axios';

// Wipe any legacy tokens that may have been stored in client-side storage
// before the HttpOnly-cookie migration. We never want a token in JS anymore.
try {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('em_token');
  localStorage.removeItem('em_user');
  sessionStorage.removeItem('em_token');
} catch { /* SSR / sandbox */ }

export const USER_KEY = 'em_user';
export const getStoredUser = () => sessionStorage.getItem(USER_KEY);
export const setStoredUser = (u: string) => sessionStorage.setItem(USER_KEY, u);
export const clearStoredUser = () => sessionStorage.removeItem(USER_KEY);

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearStoredUser();
      if (location.pathname !== '/login') location.href = '/login';
    }
    return Promise.reject(err);
  },
);
