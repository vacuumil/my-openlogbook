import { db } from '../db/db';

export const PROFILE_DATA_DIRTY_KEY = 'openlogbook_quals_dirty';
export const PROFILE_DATA_SYNCED_KEY = 'openlogbook_profile_data_synced';
export const WORK_RATES_KEY = 'openlogbook_work_rates';

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
    is_superuser?: boolean;
    created_at: string;
    profile_json?: string;
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
  base_updated_at?: string;
}

export interface AdminFlightItem {
  id: string;
  user_id: string;
  user_email: string;
  user_name?: string;
  date: string;
  dep_icao: string;
  arr_icao: string;
  out_time_utc: string;
  off_time_utc?: string;
  on_time_utc?: string;
  in_time_utc: string;
  total_time_minutes: number;
  night_time_minutes: number;
  ifr_time_minutes: number;
  pic_time_minutes: number;
  sic_time_minutes: number;
  flight_role?: string;
  flight_handling?: string;
  landings_day: number;
  landings_night: number;
  aircraft_reg: string;
  aircraft_type: string;
  approach_type?: string;
  remarks?: string;
  is_deleted: boolean;
  updated_at: string;
}

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;
  rawDetail: any;

  constructor(message: string, status: number, fieldErrors: Record<string, string> = {}, rawDetail: any = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.rawDetail = rawDetail;
  }
}

function parseBackendError(errorData: any, status: number): ApiError {
  const fieldErrors: Record<string, string> = {};
  const messages: string[] = [];

  if (Array.isArray(errorData?.detail)) {
    for (const item of errorData.detail) {
      let field = '';
      if (Array.isArray(item.loc)) {
        field = item.loc.filter((part: any) => part !== 'body').join('.') || '';
      }
      let msg = item.msg || 'Ошибка валидации';
      msg = msg.replace(/^Value error,\s*/i, '');
      if (msg.includes('value is not a valid email address')) {
        msg = 'Некорректный формат адреса электронной почты';
      } else if (msg.includes('Field required')) {
        msg = 'Поле обязательно для заполнения';
      }

      if (field) {
        fieldErrors[field] = msg;
        const fieldNameRu = field === 'email' ? 'Email' : field === 'password' ? 'Пароль' : field;
        messages.push(`${fieldNameRu}: ${msg}`);
      } else {
        messages.push(msg);
      }
    }
  } else if (typeof errorData?.detail === 'string') {
    messages.push(errorData.detail);
    if (errorData.detail.toLowerCase().includes('email')) {
      fieldErrors['email'] = errorData.detail;
    }
  } else if (errorData?.message) {
    messages.push(errorData.message);
  } else {
    messages.push(status === 401 ? 'Неверный логин или пароль' : `Ошибка сервера (${status})`);
  }

  const combinedMessage = messages.length > 0 ? messages.join('. ') : 'Произошла непредвиденная ошибка';
  return new ApiError(combinedMessage, status, fieldErrors, errorData?.detail);
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
      if (response.status === 401 && !endpoint.startsWith('/auth/login') && !endpoint.startsWith('/auth/register')) {
        this.clearToken();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('openlogbook:unauthorized', { detail: { endpoint, status: 401 } }));
        }
      }
      throw parseBackendError(errorData, response.status);
    }

    if (response.status === 204) return undefined as T;
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
    return this.request<AuthResponse['user']>('/auth/me');
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    this.setToken(res.access_token);
    this.setUser(res.user);
    return res;
  }

  async deleteAccount(password: string): Promise<void> {
    await this.request('/auth/me', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
  }

  async updateProfile(data: { full_name?: string; license_number?: string; profile_json?: string }) {
    // Qualifications and work time live in profile_json too. Once this device has synced, its tables
    // are the truth: a copy held by the profile form may be stale and must not bring deleted rows back.
    const body = { ...data };
    const isLocalAuthoritative =
      localStorage.getItem(PROFILE_DATA_DIRTY_KEY) !== null || localStorage.getItem(PROFILE_DATA_SYNCED_KEY) !== null;
    if (data.profile_json && isLocalAuthoritative) {
      const rates = localStorage.getItem(WORK_RATES_KEY);
      body.profile_json = JSON.stringify({
        ...JSON.parse(data.profile_json),
        qualifications: await db.qualifications.toArray(),
        workTime: {
          entries: await db.workEntries.toArray(),
          rates: rates ? JSON.parse(rates) : undefined,
        },
      });
    }
    const res = await this.request<any>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    const currUser = this.getUser() || {};
    this.setUser({ ...currUser, ...res });
    return res;
  }

  // Sync
  async syncPush(flights: ApiFlightItem[]): Promise<{
    synced_count: number;
    conflicts: ApiFlightItem[];
    rejected: Array<{ id: string; reason: string }>;
    server_time: string;
  }> {
    return this.request('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ flights }),
    });
  }

  async syncPull(since?: string): Promise<{ flights: ApiFlightItem[]; server_time: string }> {
    const query = since ? `?since=${encodeURIComponent(since)}` : '';
    return this.request(`/sync/pull${query}`);
  }

  async getAirportWeather(icao: string): Promise<any> {
    return this.request(`/airports/${encodeURIComponent(icao.toUpperCase())}/weather`);
  }

  // Admin APIs
  async adminGetUsers(): Promise<any[]> {
    return this.request('/admin/users');
  }

  async adminUpdateUserStatus(userId: string, isActive: boolean): Promise<any> {
    return this.request(`/admin/users/${encodeURIComponent(userId)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: isActive }),
    });
  }

  async adminResetPassword(userId: string, newPassword: string): Promise<any> {
    return this.request(`/admin/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    });
  }

  async adminDeleteUser(userId: string): Promise<any> {
    return this.request(`/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }

  async adminGetStats(): Promise<any> {
    return this.request('/admin/stats');
  }

  async adminGetFlights(params?: { user_id?: string; status_filter?: string; search?: string; limit?: number; skip?: number }): Promise<AdminFlightItem[]> {
    const query = new URLSearchParams();
    if (params?.user_id) query.append('user_id', params.user_id);
    if (params?.status_filter) query.append('status_filter', params.status_filter);
    if (params?.search) query.append('search', params.search);
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.skip) query.append('skip', String(params.skip));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/admin/flights${qs}`);
  }

  async adminRestoreFlight(flightId: string): Promise<any> {
    return this.request(`/admin/flights/${encodeURIComponent(flightId)}/restore`, {
      method: 'PUT',
    });
  }

  async adminDeleteFlightPermanent(flightId: string): Promise<any> {
    return this.request(`/admin/flights/${encodeURIComponent(flightId)}/permanent`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient();
