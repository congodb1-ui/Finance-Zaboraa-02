import { supabase } from './supabase/client';
import { signOut } from './auth';

/**
 * Zaboraa Finance — Authenticated API Client
 * Automatically attaches Supabase Bearer token to all Express /api/* requests.
 * Handles 401 unauthorized by signing out and redirecting to landing.
 */

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch (err) {
    console.warn('Failed to retrieve Supabase session token:', err);
  }
  return {};
}

async function handleResponse<T = any>(res: Response): Promise<T> {
  if (res.status === 401) {
    console.warn('Received 401 Unauthorized from API. Signing out...');
    await signOut('/');
    if (typeof window !== 'undefined' && (window.location.pathname !== '/' || window.location.hash)) {
      window.location.href = '/';
    }
    throw new Error('Unauthorized');
  }

  if (res.status === 403) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Access Forbidden: Email not in allowed list');
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || `Request failed with status ${res.status}`);
    }
    return data;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }

  return res as unknown as T;
}

export async function apiGet<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  const authHeader = await getAuthHeader();
  let url = path;

  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, String(val));
      }
    }
    const qs = searchParams.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...authHeader,
    },
  });

  return handleResponse<T>(res);
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const authHeader = await getAuthHeader();
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...authHeader,
  };

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: isFormData ? body : JSON.stringify(body ?? {}),
  });

  return handleResponse<T>(res);
}

export async function apiPatch<T = any>(path: string, body?: any): Promise<T> {
  const authHeader = await getAuthHeader();

  const res = await fetch(path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(body ?? {}),
  });

  return handleResponse<T>(res);
}
