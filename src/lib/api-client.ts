import { supabase } from './supabase/client';
import { signOut } from './auth';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Returns authorization headers with current Supabase session token
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn('[api-client] Could not retrieve session token:', err);
  }

  return headers;
}

/**
 * Handles 401 Unauthorized responses by clearing auth session and redirecting
 */
async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    console.warn('[api-client] 401 Unauthorized received — signing out');
    await signOut('/');
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    throw new ApiError(401, 'Unauthorized');
  }

  const contentType = res.headers.get('content-type') || '';
  let responseData: any;

  if (contentType.includes('application/json')) {
    responseData = await res.json().catch(() => ({}));
  } else if (
    contentType.includes('text/') ||
    contentType.includes('application/octet-stream') ||
    contentType.includes('application/vnd.openxmlformats')
  ) {
    responseData = await res.text().catch(() => '');
  }

  if (!res.ok) {
    const errorMsg =
      (responseData && (responseData.error || responseData.message)) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(res.status, errorMsg, responseData);
  }

  return responseData as T;
}

/**
 * GET request helper with query params and Authorization header
 */
export async function apiGet<T = any>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  customHeaders?: HeadersInit
): Promise<T> {
  let url = path;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    }
    const query = searchParams.toString();
    if (query) {
      url += (url.includes('?') ? '&' : '?') + query;
    }
  }

  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    method: 'GET',
    headers: { ...headers, ...customHeaders },
  });

  return handleResponse<T>(res);
}

/**
 * POST request helper with JSON payload and Authorization header
 */
export async function apiPost<T = any>(
  path: string,
  body?: any,
  customHeaders?: HeadersInit
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(path, {
    method: 'POST',
    headers: { ...headers, ...customHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return handleResponse<T>(res);
}

/**
 * PATCH request helper with JSON payload and Authorization header
 */
export async function apiPatch<T = any>(
  path: string,
  body?: any,
  customHeaders?: HeadersInit
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { ...headers, ...customHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return handleResponse<T>(res);
}

/**
 * DELETE request helper with Authorization header
 */
export async function apiDelete<T = any>(
  path: string,
  customHeaders?: HeadersInit
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(path, {
    method: 'DELETE',
    headers: { ...headers, ...customHeaders },
  });

  return handleResponse<T>(res);
}

/**
 * Specialized helper for raw responses (e.g. file downloads, binary blobs)
 */
export async function apiFetchRaw(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const headers = { ...authHeaders, ...(init?.headers || {}) };

  const res = await fetch(path, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    await signOut('/');
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    throw new ApiError(401, 'Unauthorized');
  }

  return res;
}
