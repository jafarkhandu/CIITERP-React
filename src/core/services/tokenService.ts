// Port of TokenService. Plain module (no class instance needed in React).
const ACCESS = 'accessToken';
const REFRESH = 'refreshToken';

export const tokenService = {
  setAccessToken: (token: string) => localStorage.setItem(ACCESS, token),
  getAccessToken: (): string | null => localStorage.getItem(ACCESS),
  setRefreshToken: (token: string) => localStorage.setItem(REFRESH, token),
  getRefreshToken: (): string | null => localStorage.getItem(REFRESH),

  clearToken(): void {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  },

  isAccessTokenExpired(): boolean {
    const token = this.getAccessToken();
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const expiry = Number(payload.exp);
      if (!expiry) return true;
      return Date.now() >= expiry * 1000;
    } catch (error) {
      console.error('Invalid access token:', error);
      return true;
    }
  },

  isLoggedIn(): boolean {
    return !!this.getAccessToken() || !!this.getRefreshToken();
  },
};
