const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    full_name?: string;
    license_number?: string;
    is_active: boolean;
    created_at: string;
  };
}

export interface ApiFlightItem {
  id: string;
  date: string;
  dep_icao: string;
  arr_icao: string;
  out_time_utc: string;
  off_time_utc: string;
  on_time_utc: string;
  in_time_utc: string;
  total_time_minutes: number;
  night_time_minutes: number;
  ifr_time_minutes: number;
  pic_time_minutes: number;
  sic_time_minutes: number;
  picus_time_minutes: number;
  dual_time_minutes: number;
  flight_role?: string;
  flight_handling?: string;
  landings_day: number;
  landings_night: number;
  aircraft_reg: string;
  aircraft_type: string;
  approach_type?: string;
  remarks?: string;
  is_deleted?: boolean;
  updated_at: string;
}

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('openlogbook_token');
  }

  setToken(token: string) {
    localStorage.setItem('openlogbook_token', token);
  }

  clearToken() {
    localStorage.removeItem('openlogbook_token');
    localStorage.removeItem('openlogbook_user');
  }

  getUser() {
    const userStr = localStorage.getItem('openlogbook_user');
    return userStr ? JSON.parse(userStr) : null;
  }

  setUser(user: any) {
    localStorage.setItem('openlogbook_user', JSON.stringify(user));
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/v1${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Network request failed' }));
      throw new Error(errorData.detail || `Request failed with status ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async register(data: { email: string; password: string; full_name?: string; license_number?: string }): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(res.access_token);
    this.setUser(res.user);
    return res;
  }

  async login(credentials: { email: string; password: string }): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    this.setToken(res.access_token);
    this.setUser(res.user);
    return res;
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // Sync
  async syncPush(flights: ApiFlightItem[]): Promise<{ synced_count: number; server_time: string }> {
    return this.request('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ flights }),
    });
  }

  async syncPull(since?: string): Promise<{ flights: ApiFlightItem[]; server_time: string }> {
    const query = since ? `?since=${encodeURIComponent(since)}` : '';
    return this.request(`/sync/pull${query}`);
  }
}

export const api = new ApiClient();
