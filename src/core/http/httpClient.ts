// Port of AuthInterceptors.ts (Angular HttpInterceptorFn) to an axios instance.
//
//  - public auth endpoints are sent untouched
//  - lead API (direct host) is sent without JWT, same as before
//  - valid access token  -> Authorization: Bearer <token>
//  - expired / missing access token + refresh token -> refresh first, then send
//  - 401 from server -> refresh once (shared between parallel requests) and retry
//  - refresh fails / nothing to refresh with -> clear session and go to /login
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import { tokenService } from '@/core/services/tokenService';
import { authService } from '@/core/auth/authService';
import { navigateTo } from '@/core/navigation';
import type { LoginResponse } from '@/types/user';

export const http = axios.create();

// separate instance without interceptors, used only to call /refresh
const rawHttp = axios.create();

const PUBLIC_URLS = [
  '/api/Auth/login',
  '/api/Auth/refresh',
  '/api/account/forgot-password',
  '/api/account/reset-password',
];

const isPublic = (url: string) => PUBLIC_URLS.some((p) => url.includes(p));
const isLeadDirect = (url: string) => url.startsWith(`${API_ENDPOINTS.leadDirectHost}/`);

function redirectToLogin() {
  console.log('Session expired. Redirecting to login.');
  authService.clearSession();
  navigateTo('/login');
}

let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenService.getRefreshToken();
  if (!refreshToken) {
    redirectToLogin();
    return Promise.reject(new Error('Refresh token not available'));
  }

  if (!refreshPromise) {
    refreshPromise = rawHttp
      .post<LoginResponse>(`${API_ENDPOINTS.auth}/refresh`, { refreshToken })
      .then(({ data }) => {
        tokenService.setAccessToken(data.token);
        tokenService.setRefreshToken(data.refreshToken);
        return data.token;
      })
      .catch((error) => {
        console.error('Refresh token failed:', error);
        redirectToLogin();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function setBearer(config: InternalAxiosRequestConfig, token: string) {
  config.headers.set('Authorization', `Bearer ${token}`);
}

http.interceptors.request.use(async (config) => {
  const url = config.url ?? '';
  if (isPublic(url) || isLeadDirect(url)) return config;

  const token = tokenService.getAccessToken();
  const refreshToken = tokenService.getRefreshToken();

  if (token && !tokenService.isAccessTokenExpired()) {
    setBearer(config, token);
    return config;
  }

  if ((token && tokenService.isAccessTokenExpired()) || (!token && refreshToken)) {
    const newToken = await refreshAccessToken();
    setBearer(config, newToken);
    return config;
  }

  redirectToLogin();
  throw new Error('Authentication required');
});

type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean };

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    const url = config?.url ?? '';

    if (error.response?.status !== 401 || !config || config._retried || isPublic(url) || isLeadDirect(url)) {
      throw error;
    }

    config._retried = true;
    const newToken = await refreshAccessToken();
    setBearer(config, newToken);
    return http.request(config);
  },
);
