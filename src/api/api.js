import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auth API
export const authAPI = {
  register: (username, email, password) =>
    api.post('/auth/register', { username, email, password }),
  
  login: (email, password) =>
    api.post('/auth/login', { email, password }),
  
  getCurrentUser: () =>
    api.get('/auth/me'),

  verifyEmail: (token) =>
    api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`),

  resendVerification: (email) =>
    api.post('/auth/resend-verification', { email }),

  getApiKeys: () =>
    api.get('/auth/api-keys'),

  createApiKey: (name) =>
    api.post('/auth/api-keys', { name }),

  revokeApiKey: (id) =>
    api.delete(`/auth/api-keys/${id}`),

  deleteApiKey: (id) =>
    api.delete(`/auth/api-keys/${id}/permanent`),

  updateUsername: (newUsername, password) =>
    api.put('/auth/username', { newUsername, password }),

  updateEmail: (newEmail, password) =>
    api.put('/auth/email', { newEmail, password }),

  updatePassword: (currentPassword, newPassword, confirmPassword) =>
    api.put('/auth/password', { currentPassword, newPassword, confirmPassword }),

  adminListUsers: () =>
    api.get('/auth/admin/users'),

  adminUpdateUser: (id, updates) =>
    api.patch(`/auth/admin/users/${id}`, updates),
};

// Bookmarks API
export const bookmarksAPI = {
  getAll: () =>
    api.get('/bookmarks'),
  
  getOne: (id) =>
    api.get(`/bookmarks/${id}`),
  
  create: (bookmarkData) =>
    api.post('/bookmarks', bookmarkData),
  
  update: (id, bookmarkData) =>
    api.put(`/bookmarks/${id}`, bookmarkData),
  
  delete: (id) =>
    api.delete(`/bookmarks/${id}`),

  fetchMetadata: (url) =>
    api.post('/bookmarks/meta', { url }),

  fetchDescription: (url) =>
    api.post('/bookmarks/meta-description', { url }),
  
  getAllTags: () =>
    api.get('/bookmarks/tags/all'),

  importBookmarks: (bookmarks) =>
    api.post('/bookmarks/import', { bookmarks }),
};

export const billingAPI = {
  getPlans: () =>
    api.get('/billing/plans'),

  getStatus: () =>
    api.get('/billing/status'),

  createCheckoutSession: (plan) =>
    api.post('/billing/checkout-session', { plan }),

  createPortalSession: () =>
    api.post('/billing/portal-session'),
};

export default api;
