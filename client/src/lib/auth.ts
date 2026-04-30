/**
 * Auth Client Library for Ali's Aigoo Apocalypse
 * 
 * This provides a Firebase-like API for authentication
 * but connects to the local server instead.
 */

import type { User, AuthResponse } from '@/types/auth';

// Use relative URLs to go through Vite proxy (works on mobile + desktop)
const API_URL = import.meta.env.VITE_API_URL || '';

// Token storage keys
const TOKEN_KEY = 'aigoo_auth_token';
const USER_KEY = 'aigoo_auth_user';

type AuthStateCallback = (user: User | null) => void;

/**
 * Get the current auth token
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Get the current user from storage
 */
export function getCurrentUser(): User | null {
  const userJson = localStorage.getItem(USER_KEY);
  return userJson ? JSON.parse(userJson) : null;
}

/**
 * Store auth credentials
 */
function storeAuth(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Clear auth credentials
 */
function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string | null = getToken()): boolean {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  return Date.now() / 1000 >= payload.exp - 10;
}

function ensureTokenValid(token: string | null): boolean {
  if (!token) return true;
  if (isTokenExpired(token)) {
    clearAuth();
    return false;
  }
  return true;
}

/**
 * Make authenticated API request
 */
async function authFetch<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (token) {
    if (!ensureTokenValid(token)) {
      notifyAuthStateChange();
      throw new Error('Authentication token expired')
    }
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    if (response.status === 401) {
      clearAuth();
      notifyAuthStateChange();
    }
    throw new Error(data.error || 'Request failed');
  }
  
  return data as T;
}

/**
 * Sign up with email and password
 */
export async function signUp(email: string, password: string, displayName: string): Promise<User> {
  const data = await authFetch<AuthResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName })
  });
  
  storeAuth(data.token, data.user);
  notifyAuthStateChange();
  return data.user;
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<User> {
  const data = await authFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  
  storeAuth(data.token, data.user);
  notifyAuthStateChange();
  return data.user;
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  try {
    await authFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore logout errors, clear local state anyway
  }
  clearAuth();
  notifyAuthStateChange();
}

/**
 * Get fresh user data from server
 */
export async function refreshUser(): Promise<User> {
  const data = await authFetch<{ user: User }>('/api/auth/me');
  const token = getToken();
  if (token) {
    storeAuth(token, data.user);
  }
  return data.user;
}

/**
 * Refresh the auth token
 */
export async function refreshToken(): Promise<string> {
  const data = await authFetch<{ token: string }>('/api/auth/refresh', { method: 'POST' });
  const user = getCurrentUser();
  if (user) {
    storeAuth(data.token, user);
  }
  return data.token;
}

/**
 * Check if user has a specific role
 */
export function hasRole(role: string): boolean {
  const user = getCurrentUser();
  return user?.role === role;
}

/**
 * Check if user has a specific custom claim
 */
export function hasClaim(claimName: string, claimValue: unknown = true): boolean {
  const user = getCurrentUser();
  if (!user?.customClaims) return false;
  
  const claims = user.customClaims as unknown as Record<string, unknown>;
  if (claimValue === true) {
    return !!claims[claimName];
  }
  return claims[claimName] === claimValue;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!getToken() && !!getCurrentUser();
}

/**
 * Check if user is a player
 */
export function isPlayer(): boolean {
  return hasRole('player');
}

/**
 * Check if user is a parent
 */
export function isParent(): boolean {
  return hasRole('parent');
}

/**
 * Check if user has game access
 */
export function hasGameAccess(): boolean {
  return hasClaim('gameAccess');
}

/**
 * Check if user has dashboard access
 */
export function hasDashboardAccess(): boolean {
  return hasClaim('dashboardAccess');
}

// Auth state listeners
let authStateListeners: AuthStateCallback[] = [];

export function onAuthStateChanged(callback: AuthStateCallback): () => void {
  authStateListeners.push(callback);
  
  // Immediately call with current state.
  const token = getToken();
  if (token && !ensureTokenValid(token)) {
    notifyAuthStateChange();
  } else {
    callback(getCurrentUser());
  }
  
  // Return unsubscribe function
  return () => {
    authStateListeners = authStateListeners.filter(cb => cb !== callback);
  };
}

// Notify listeners of auth state changes
function notifyAuthStateChange(): void {
  const user = getCurrentUser();
  authStateListeners.forEach(cb => cb(user));
}

// Listen for storage changes (for multi-tab support)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === TOKEN_KEY || e.key === USER_KEY) {
      notifyAuthStateChange();
    }
  });
}

// Export default auth object (Firebase-like interface)
const auth = {
  signUp,
  signIn,
  signOut,
  refreshUser,
  refreshToken,
  getCurrentUser,
  getToken,
  isAuthenticated,
  hasRole,
  hasClaim,
  isPlayer,
  isParent,
  hasGameAccess,
  hasDashboardAccess,
  onAuthStateChanged
};

export default auth;
