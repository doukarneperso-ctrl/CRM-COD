import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Response interceptor — handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect if we're not already on login and not during a login request
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      const isAuthCheck = error.config?.url?.includes('/auth/me');
      
      if (!isLoginRequest && !isAuthCheck && window.location.pathname !== '/login') {
        // Use soft navigation instead of hard reload to preserve state
        // The auth store's checkAuth will handle clearing user state
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
