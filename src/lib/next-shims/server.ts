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
}

export class NextRequest extends Request {
  cookies = {
    get(name: string) {
      return undefined;
    },
    getAll() {
      return [];
    },
    set(name: string, value: string, options?: CookieOptions) {},
    delete(name: string) {},
  };
  nextUrl = new URL('http://localhost:3000');
}

export class NextResponse extends Response {
  static next(init?: any) {
    return new NextResponse();
  }
  static redirect(url: string | URL, status: number = 307) {
    return new NextResponse(null, { status, headers: { Location: String(url) } });
  }
  static json(body: any, init?: ResponseInit) {
    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  }
  cookies = {
    get(name: string) {
      return undefined;
    },
    getAll() {
      return [];
    },
    set(name: string, value: string, options?: CookieOptions) {},
    delete(name: string) {},
  };
}
