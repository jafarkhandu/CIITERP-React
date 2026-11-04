// Port of authGuard. Wrap a route's element with <ProtectedRoute permission=... roles=...>.
import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { tokenService } from '@/core/services/tokenService';
import { PERMISSIONS, permissionService, type Permission } from '@/core/services/permissionService';
import { userSession } from './session';
import { usePermissionVersion, useSession } from './hooks';

interface Props {
  permission?: Permission;
  permissions?: Permission[];
  roles?: string[];
  children: ReactElement;
}

export default function ProtectedRoute({ permission, permissions, roles, children }: Props) {
  // subscribe so the guard re-evaluates when session / permissions change
  useSession();
  usePermissionVersion();

  if (!tokenService.isLoggedIn()) return <Navigate to="/login" replace />;

  const accessDenied = (
    <Navigate to={userSession.hasPermission(PERMISSIONS.DASHBOARD_VIEW) ? '/main/dashboard' : '/login'} replace />
  );

  // If both role and permission are configured, BOTH must pass.
  if (roles?.length && !userSession.hasAnyRole(roles)) return accessDenied;

  if (permission) {
    const superUserLeadFollowup = permission === PERMISSIONS.LEAD_FOLLOWUP && userSession.isSuperUser();
    const enabledAdminLeadFollowup =
      permission === PERMISSIONS.LEAD_FOLLOWUP &&
      userSession.isAdmin() &&
      permissionService.isAdminFunctionEnabled(permission);

    if (!superUserLeadFollowup && !enabledAdminLeadFollowup && !permissionService.hasPermission(permission)) {
      return accessDenied;
    }
  }

  if (permissions?.length && !permissionService.hasAnyPermission(permissions)) return accessDenied;

  return children;
}
