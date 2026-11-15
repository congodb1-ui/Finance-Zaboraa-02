export interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

export interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: 'signin' | 'signup' | 'use';
    use_fedcm_for_prompt?: boolean;
  }) => void;
  prompt: (
    momentListener?: (notification: {
      isNotDisplayed?: () => boolean;
      isSkippedMoment?: () => boolean;
      isDismissedMoment?: () => boolean;
    }) => void
  ) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
    }
  ) => void;
  disableAutoSelect: () => void;
  cancel: () => void;
}

export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface GoogleCodeResponse {
  code?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface GoogleAccountsOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    prompt?: '' | 'none' | 'consent' | 'select_account';
    hint?: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }) => {
    requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
  };
  initCodeClient: (config: {
    client_id: string;
    scope: string;
    ux_mode?: 'popup' | 'redirect';
    access_type?: 'offline' | 'online';
    prompt?: string;
    login_hint?: string;
    callback: (response: GoogleCodeResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }) => {
    requestCode: () => void;
  };
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
        oauth2?: GoogleAccountsOAuth2;
      };
    };
  }
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let loadPromise: Promise<GoogleAccountsId> | null = null;

export function loadGoogleIdentityScript(): Promise<GoogleAccountsId> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Identity Services requires a browser environment.'));
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<GoogleAccountsId>((resolve, reject) => {
    const start = Date.now();
    const timeoutMs = 10000;

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_SRC}"]`
    );

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = GIS_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        loadPromise = null;
        reject(new Error('Failed to load Google Identity Services script.'));
      };
      document.head.appendChild(script);
    }

    const poll = () => {
      if (window.google?.accounts?.id) {
        resolve(window.google.accounts.id);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        loadPromise = null;
        reject(new Error('Timed out waiting for Google Identity Services to initialize.'));
        return;
      }
      window.setTimeout(poll, 50);
    };

    poll();
  });

  return loadPromise;
}

export async function loadGoogleOAuth2Client(): Promise<GoogleAccountsOAuth2> {
  await loadGoogleIdentityScript();
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google OAuth2 client is not available.');
  }
  return window.google.accounts.oauth2;
}

export function disableGoogleAutoSelect() {
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    // Ignore if GIS script has not loaded
  }
}
