export function studentPasswordValidation(newPassword: string, confirmPassword: string, currentPassword?: string): string {
  if (currentPassword !== undefined && !currentPassword) return 'Enter your current password.';
  if (!newPassword) return 'Enter a new password.';
  if (!confirmPassword) return 'Confirm your new password.';
  if (newPassword !== confirmPassword) return 'New password and confirmation do not match.';
  if (currentPassword !== undefined && currentPassword === newPassword) {
    return 'New password must be different from your current password.';
  }
  return '';
}
