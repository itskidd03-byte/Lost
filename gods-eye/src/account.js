// Accounts for a static site. The browser talks to a hosted auth API (Supabase
// GoTrue) directly — no server of ours, nothing to keep running, and the world
// stays on the device either way. The account only decides whose world it is.

import { AUTH } from './auth-config.js';

const SESSION_KEY = 'gods-eye-session-v1';

export function authConfigured() {
  return Boolean(AUTH.url && AUTH.key);
}

export function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage full or blocked: the session just won't persist */
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function endpoint(path) {
  return `${AUTH.url.replace(/\/+$/, '')}${path}`;
}

function headers(token) {
  return {
    'content-type': 'application/json',
    apikey: AUTH.key,
    authorization: `Bearer ${token || AUTH.key}`,
  };
}

async function call(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(endpoint(path), {
      method,
      headers: headers(token),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('No connection. Sign in needs the network once, then the world plays offline.');
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { msg: text };
  }
  if (!res.ok) {
    const message =
      data?.error_description || data?.msg || data?.message || data?.error || `Sign-in failed (${res.status}).`;
    throw new Error(String(message).replace(/_/g, ' '));
  }
  return data;
}

function normalize(data) {
  const user = data?.user || {};
  return {
    access_token: data?.access_token || '',
    refresh_token: data?.refresh_token || '',
    expires_at: Date.now() + (Number(data?.expires_in) || 3600) * 1000,
    user: {
      sub: user.id || user.sub || '',
      email: user.email || '',
      name: user.user_metadata?.name || user.email || 'Signed in',
    },
  };
}

export async function signUp(email, password) {
  const data = await call('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (!data?.access_token) {
    throw new Error('Account created. Check your email to confirm it, then sign in.');
  }
  const session = normalize(data);
  writeSession(session);
  return session;
}

export async function signIn(email, password) {
  const data = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  const session = normalize(data);
  writeSession(session);
  return session;
}

export async function refresh(session) {
  if (!session?.refresh_token) return null;
  const data = await call('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: session.refresh_token },
  });
  const next = normalize(data);
  writeSession(next);
  return next;
}

export async function signOut() {
  const session = readSession();
  clearSession();
  if (session?.access_token && authConfigured()) {
    fetch(endpoint('/auth/v1/logout'), { method: 'POST', headers: headers(session.access_token) }).catch(() => {});
  }
}
