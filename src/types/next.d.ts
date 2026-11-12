// Ambient TypeScript declarations for Next.js App Router interfaces
// Matches the exact Next.js 14 App Router API specification.

declare module 'next/server' {
  export interface CookieOptions {
    name?: string;
    value?: string;
    domain?: string;
    path?: string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    sameSite?: boolean | 'lax' | 'strict' | 'none';
    secure?: boolean;
    partitioned?: boolean;
    priority?: 'low' | 'medium' | 'high';
    encode?: (str: string) => string;
  }

  export interface NextURL extends URL {
    clone(): NextURL;
    basePath: string;
    pathname: string;
    search: string;
  }

  export interface NextFetchEvent {
    waitUntil(promise: Promise<any>): void;
  }

  export interface MiddlewareResponseInit extends ResponseInit {
    request?: {
      headers?: Headers;
    };
  }

  export class NextRequest extends Request {
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      getAll(): { name: string; value: string }[];
      set(name: string, value: string, options?: CookieOptions): void;
      set(options: { name: string; value: string } & Partial<CookieOptions>): void;
      delete(name: string): void;
    };
    nextUrl: NextURL;
  }

  export class NextResponse extends Response {
    static next(init?: MiddlewareResponseInit): NextResponse;
    static redirect(url: string | URL, status?: number): NextResponse;
    static json<T = any>(body: T, init?: ResponseInit): NextResponse;
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      getAll(): { name: string; value: string }[];
      set(name: string, value: string, options?: Partial<CookieOptions>): void;
      set(options: { name: string; value: string } & Partial<CookieOptions>): void;
      delete(name: string): void;
    };
  }
}

declare module 'next/headers' {
  export interface CookieStore {
    get(name: string): { name: string; value: string } | undefined;
    getAll(): { name: string; value: string }[];
    set(name: string, value: string, options?: any): void;
    set(options: { name: string; value: string; [key: string]: any }): void;
    delete(name: string): void;
  }

  export function cookies(): CookieStore;
  export function headers(): Headers;
}

declare module 'next/navigation' {
  export function redirect(url: string): never;
  export function useRouter(): {
    push(href: string): void;
    replace(href: string): void;
    refresh(): void;
    back(): void;
  };
  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
}
