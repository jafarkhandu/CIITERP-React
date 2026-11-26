import { AxiosError } from 'axios';
import { http } from '@/core/http/httpClient';
import { API_ENDPOINTS } from '@/core/config/api-endpoints';
import { userSession } from '@/core/auth/session';
import { isStudentOnlyAccount } from '@/core/auth/tokenIdentity';
import { backendErrorMessage } from '@/core/http/errors';

export interface StudentForgotPasswordRequest {
  emailAddress: string;
}

export interface StudentResetPasswordRequest {
  emailAddress: string;
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface StudentChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

async function postPassword(path: string, request: StudentForgotPasswordRequest | StudentResetPasswordRequest | StudentChangePasswordRequest): Promise<string> {
  const response = await http.post<unknown>(API_ENDPOINTS.studentLogin + '/' + path, request);
  const body = response.data;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const data = body as Record<string, unknown>;
    const status = Number(data.statusCode ?? data.StatusCode);
    if (status >= 400 || data.success === false || data.isSuccess === false ||
        data.Success === false || data.IsSuccess === false) {
      throw new AxiosError('Password request failed', undefined, response.config, undefined, response);
    }
  }
  return backendErrorMessage(body);
}

export const studentPasswordApi = {
  forgotPassword: (request: StudentForgotPasswordRequest) => postPassword('forgot-password', request),
  resetPassword: (request: StudentResetPasswordRequest) => postPassword('reset-password', request),
  changePassword: (request: StudentChangePasswordRequest) => {
    if (!isStudentOnlyAccount(userSession.getSnapshot().roles)) {
      return Promise.reject(new Error('Student authentication required.'));
    }
    return postPassword('change-password', request);
  },
};
