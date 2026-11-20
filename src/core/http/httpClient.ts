// Port of AuthInterceptors.ts (Angular HttpInterceptorFn) to an axios instance.
//
//  - public auth endpoints are sent untouched
//  - lead API (direct host) is sent without JWT, same as before
//  - valid access token  -> Authorization: Bearer <token>
//  - expired / missing access token + refresh token -> refresh first, then send
//  - 401 from server -> refresh once (shared between parallel requests) and retry
//  - refresh fails / nothing to refresh with -> clear session and go to /login
import axios, { AxiosError, CanceledError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import { tokenService } from '@/core/services/tokenService';
import { authService } from '@/core/auth/authService';
import { userSession } from '@/core/auth/session';
import { navigateTo } from '@/core/navigation';
import type { LoginResponse } from '@/types/user';

export const http = axios.create();

const GET_CACHE_TTL_MS = 12_000;
const getCache = new Map<string, { expiresAt: number; response?: AxiosResponse; pending?: Promise<AxiosResponse> }>();

function pruneGetCache(now: number): void {
  for (const [key, entry] of getCache) {
    if (!entry.pending && entry.expiresAt <= now) getCache.delete(key);
  }
  while (getCache.size > 250) {
    const oldestKey = getCache.keys().next().value;
    if (oldestKey === undefined) break;
    getCache.delete(oldestKey);
  }
}

function withShortGetCache(config: SessionRequestConfig): InternalAxiosRequestConfig {
  if (config.method?.toLowerCase() !== 'get') return config;

  const url = config.url ?? '';
  const authorization = String(config.headers.get('Authorization') ?? '');
  if (!authorization || isPublic(url) || isLeadDirect(url)) return config;

  const cacheKey = JSON.stringify([
    config._session?.generation, config._session?.username, authorization, axios.getUri(config), config.responseType ?? 'json',
  ]);
  const originalAdapter = axios.getAdapter(axios.defaults.adapter) as AxiosAdapter;

  config.adapter = async (requestConfig): Promise<AxiosResponse> => {
    const now = Date.now();
    pruneGetCache(now);
    const cached = getCache.get(cacheKey);

    if (cached?.response && cached.expiresAt > now) return { ...cached.response, config: requestConfig };

    if (cached?.pending) {
      try {
        return { ...await cached.pending, config: requestConfig };
      } catch (error) {
        // Keep retry state local to each caller sharing the same network request.
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          const response = { ...error.response, config: requestConfig };
          throw AxiosError.from(error, error.code, requestConfig, error.request, response);
        }
        throw error;
      }
    }

    const pending: Promise<AxiosResponse> = originalAdapter(requestConfig)
      .then((response) => {
        // A successful write may have invalidated this entry while the GET was pending.
        if (getCache.get(cacheKey)?.pending !== pending) return response;
        if (response.status >= 200 && response.status < 300
          && requestConfig.responseType !== 'blob'
          && requestConfig.responseType !== 'arraybuffer'
          && requestConfig.responseType !== 'stream') {
          getCache.set(cacheKey, { expiresAt: Date.now() + GET_CACHE_TTL_MS, response });
        } else {
          getCache.delete(cacheKey);
        }
        return response;
      })
      .catch((error: unknown) => {
        if (getCache.get(cacheKey)?.pending === pending) getCache.delete(cacheKey);
        throw error;
      });

    getCache.set(cacheKey, { expiresAt: Number.POSITIVE_INFINITY, pending });
    const response = await pending;
    return { ...response, config: requestConfig };
  };

  return config;
}

// separate instance without interceptors, used only to call /refresh
const rawHttp = axios.create();

const PUBLIC_URLS = [
  '/api/Auth/login',
  '/api/Auth/refresh',
  '/api/StudentLogin/login',
  '/api/account/forgot-password',
  '/api/account/reset-password',
];

const isPublic = (url: string) => PUBLIC_URLS.some((p) => url.includes(p));
const isLeadDirect = (url: string) =>
  url.startsWith(`${API_ENDPOINTS.leadDirectHost}/`) ||
  // The Vite proxy is only used for this development-only enquiry update request.
  (import.meta.env.DEV && url.startsWith('/lead-api/EnquiryFollowup/Update/'));

function redirectToLogin() {
  console.log('Session expired. Redirecting to login.');
  authService.clearSession();
  navigateTo('/login');
}

interface SessionScope {
  generation: number;
  username: string | null;
}

type SessionRequestConfig = InternalAxiosRequestConfig & {
  _session?: SessionScope;
  _retried?: boolean;
};

function getSessionScope(): SessionScope {
  return { generation: userSession.getSnapshot().generation, username: localStorage.getItem('username') };
}

function isCurrentSession(session: SessionScope): boolean {
  return userSession.getSnapshot().generation === session.generation
    && localStorage.getItem('username') === session.username;
}

function requireCurrentSession(session: SessionScope): void {
  if (!isCurrentSession(session)) throw new CanceledError('Authentication session changed');
}

let refreshRequest: { session: SessionScope; refreshToken: string; promise: Promise<string> } | null = null;

function refreshAccessToken(session: SessionScope): Promise<string> {
  requireCurrentSession(session);
  const refreshToken = tokenService.getRefreshToken();
  if (!refreshToken) {
    redirectToLogin();
    return Promise.reject(new Error('Refresh token not available'));
  }

  if (refreshRequest?.refreshToken === refreshToken && isCurrentSession(refreshRequest.session)) {
    return refreshRequest.promise;
  }

  const canApplyRefresh = () => isCurrentSession(session) && tokenService.getRefreshToken() === refreshToken;
  const promise = rawHttp
    .post<LoginResponse>(`${API_ENDPOINTS.auth}/refresh`, { refreshToken })
    .then(({ data }) => {
      if (!canApplyRefresh()) throw new CanceledError('Authentication session changed');
      authService.saveLoginData(data.token, data.refreshToken);
      return data.token;
    })
    .catch((error: unknown) => {
      if (canApplyRefresh()) {
        console.error('Refresh token failed.', error instanceof Error ? error.message : '');
        redirectToLogin();
      }
      throw error;
    })
    .finally(() => {
      if (refreshRequest?.promise === promise) refreshRequest = null;
    });

  refreshRequest = { session, refreshToken, promise };
  return promise;
}

function setBearer(config: InternalAxiosRequestConfig, token: string) {
  config.headers.set('Authorization', `Bearer ${token}`);
}

http.interceptors.request.use(async (config: SessionRequestConfig) => {
  const url = config.url ?? '';
  if (isPublic(url) || isLeadDirect(url)) return config;

  const session = config._session ?? getSessionScope();
  requireCurrentSession(session);
  config._session = session;
  const token = tokenService.getAccessToken();

  if (token && !tokenService.isAccessTokenExpired()) {
    setBearer(config, token);
    return withShortGetCache(config);
  }

  if (token || tokenService.getRefreshToken()) {
    const newToken = await refreshAccessToken(session);
    requireCurrentSession(session);
    setBearer(config, newToken);
    return withShortGetCache(config);
  }

  redirectToLogin();
  throw new Error('Authentication required');
});

http.interceptors.response.use(
  (response) => {
    const { _session } = response.config as SessionRequestConfig;
    if (_session) requireCurrentSession(_session);
    if (response.config.method?.toLowerCase() !== 'get') {
      getCache.clear();
    }
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as SessionRequestConfig | undefined;
    const session = config?._session;
    if (error.response?.status !== 401 || !session || config._retried) {
      throw error;
    }

    requireCurrentSession(session);
    config._retried = true;
    const currentToken = tokenService.getAccessToken();
    // Another request may have already refreshed the token since this request was sent.
    if (!currentToken || config.headers.get('Authorization') === `Bearer ${currentToken}`) {
      await refreshAccessToken(session);
    }
    return http.request(config);
  },
);
