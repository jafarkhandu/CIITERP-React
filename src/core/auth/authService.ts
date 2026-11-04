// Port of AuthService + LogOut use-case.
import { tokenService } from '@/core/services/tokenService';
import { userSession } from './session';
import { navigateTo } from '@/core/navigation';

export const authService = {
  saveLoginData(accessToken: string, refreshToken: string) {
    tokenService.setAccessToken(accessToken);
    tokenService.setRefreshToken(refreshToken);
  },

  isLoggedIn: () => tokenService.isLoggedIn(),

  /** Clears tokens + session without navigating (used by the axios interceptor too). */
  clearSession() {
    tokenService.clearToken();
    userSession.clear();
    localStorage.removeItem('username');
  },

  logout() {
    this.clearSession();
    navigateTo('/login');
  },
};
