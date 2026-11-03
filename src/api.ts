export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  message?: string;
  code?: string;
  data?: T;
  [key: string]: any;
}

export class GameApiClient {
  private static token: string | null = null;
  private static refreshToken: string | null = null;

  static setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('cozy_access_token', token);
    } else {
      localStorage.removeItem('cozy_access_token');
    }
  }

  static getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('cozy_access_token');
    }
    return this.token;
  }

  static setRefreshToken(token: string | null) {
    this.refreshToken = token;
    if (token) {
      localStorage.setItem('cozy_refresh_token', token);
    } else {
      localStorage.removeItem('cozy_refresh_token');
    }
  }

  static getRefreshToken(): string | null {
    if (!this.refreshToken) {
      this.refreshToken = localStorage.getItem('cozy_refresh_token');
    }
    return this.refreshToken;
  }

  static async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ status: number; ok: boolean; data: ApiResponse<T>; durationMs: number }> {
    const startTime = performance.now();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const token = this.getToken();
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(endpoint, {
        ...options,
        headers,
        credentials: 'include', // sends cookies
      });

      const durationMs = Math.round(performance.now() - startTime);
      const data = await response.json();

      return {
        status: response.status,
        ok: response.ok,
        data,
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        status: 0,
        ok: false,
        data: {
          status: 'error',
          code: 'NETWORK_ERROR',
          message: err.message || 'Network request failed',
        },
        durationMs,
      };
    }
  }
}
