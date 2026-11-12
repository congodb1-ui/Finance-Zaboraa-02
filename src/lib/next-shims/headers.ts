export function cookies() {
  return {
    get(name: string) {
      if (typeof document === 'undefined') return undefined;
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? { name, value: match[2] } : undefined;
    },
    getAll() {
      return [];
    },
    set(name: string, value: string, options?: any) {
      if (typeof document !== 'undefined') {
        document.cookie = `${name}=${value}; path=/`;
      }
    },
    delete(name: string) {
      if (typeof document !== 'undefined') {
        document.cookie = `${name}=; path=/; max-age=0`;
      }
    },
  };
}

export function headers() {
  return new Headers();
}
