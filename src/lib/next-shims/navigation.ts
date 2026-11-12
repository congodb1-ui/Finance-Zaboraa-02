export function redirect(url: string): never {
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
  throw new Error(`Redirecting to ${url}`);
}

export function useRouter() {
  return {
    push(href: string) {
      if (typeof window !== 'undefined') {
        window.location.hash = href.replace('/', '');
      }
    },
    replace(href: string) {
      if (typeof window !== 'undefined') {
        window.location.hash = href.replace('/', '');
      }
    },
    refresh() {},
    back() {
      if (typeof window !== 'undefined') window.history.back();
    },
  };
}

export function usePathname(): string {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace('#', '');
    return hash ? `/${hash}` : window.location.pathname || '/';
  }
  return '/';
}

export function useSearchParams(): URLSearchParams {
  if (typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search);
  }
  return new URLSearchParams();
}
