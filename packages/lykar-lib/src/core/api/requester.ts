type ApiClientOptions = {
  baseUrl?: string;
  getToken?: () => string | null;
  timeout?: number;
};

type ApiRequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean>;
};

export class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null;
  private timeout: number;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || '';
    this.getToken = options.getToken || (() => localStorage.getItem('editor_jwt'));
    this.timeout = options.timeout || 30000;
  }

  private getHeaders(headers: HeadersInit = {}): HeadersInit {
    const token = this.getToken();
    return {
      ...headers,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async request<T>(
    url: string,
    options: RequestInit = {},
    parse: 'json' | 'text' | 'blob' = 'json'
  ): Promise<T> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    let res: Response;
    try {
      res = await fetch(this.baseUrl + url, {
        ...options,
        headers: this.getHeaders(options.headers),
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e.name === 'AbortError') throw new Error('Request timeout');
      throw new Error('Network error');
    } finally {
      clearTimeout(id);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    if (parse === 'json') return res.json() as Promise<T>;
    if (parse === 'text') return res.text() as any as Promise<T>;
    if (parse === 'blob') return res.blob() as any as Promise<T>;
    throw new Error('Unknown parse type');
  }

  get<T>(url: string, options: ApiRequestOptions = {}, parse: 'json' | 'text' | 'blob' = 'json') {
    let finalUrl = url;

    if (options.query) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        searchParams.set(key, String(value));
      }
      finalUrl += `?${searchParams.toString()}`;
    }

    const { query, ...restOptions } = options;

    return this.request<T>(finalUrl, { ...restOptions, method: 'GET' }, parse);
  }
  post<T>(url: string, body?: any, options: RequestInit = {}, parse: 'json' | 'text' | 'blob' = 'json') {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }, parse);
  }
  put<T>(url: string, body?: any, options: RequestInit = {}, parse: 'json' | 'text' | 'blob' = 'json') {
    return this.request<T>(url, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }, parse);
  }
  patch<T>(url: string, body?: any, options: RequestInit = {}, parse: 'json' | 'text' | 'blob' = 'json') {
    return this.request<T>(url, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }, parse);
  }
  delete<T>(url: string, options: RequestInit = {}, parse: 'json' | 'text' | 'blob' = 'json') {
    return this.request<T>(url, { ...options, method: 'DELETE' }, parse);
  }
}