export class ApiClient {
  constructor(private baseUrl: string, private token?: string) {}

  async request(path: string, options: RequestInit = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })

    if (!res.ok) {
      if (res.status === 401) throw new Error('Unauthorized')
      throw new Error(`API error: ${res.status}`)
    }

    return res.json()
  }

  getMe() {
    return this.request('/me')
  }

  getPatches(version: string) {
    return this.request(`/patches/${version}`)
  }

  savePatch(data: any) {
    return this.request('/patches', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }
}