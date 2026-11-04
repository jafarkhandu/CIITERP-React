export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
}

export interface User {
  id?: string | number;
  employeeCode?: string;
  userName?: string;
  employeeName?: string;
  emailAddress?: string;
  mobileNumber?: string;
  branchId?: number;
  branchName?: string;
  roleName?: string;
  role?: string;
  roles?: string[];
  isActive?: boolean;
}

export interface UserProfile {
  userId?: string;
  employeeId?: number;
  employeeCode?: string;
  employeeName?: string;
  username?: string;
  emailAddress?: string;
  mobileNumber?: string;
  profilePhoto?: string;
  birthDate?: string | null;
  joiningDate?: string | null;
  salary?: number | null;
  qualification?: string | null;
  gender?: string | null;
  panNumber?: string | null;
  aadharCardNumber?: string | null;
  branchId?: number;
  branchName?: string;
  localAddress?: string | null;
  isActive?: boolean;
  roles?: string[];
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordRequest {
  emailAddress: string;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
}
