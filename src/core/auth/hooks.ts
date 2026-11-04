import { useSyncExternalStore } from 'react';
import { userSession, type SessionState } from './session';
import { permissionService } from '@/core/services/permissionService';

/** Re-renders when the logged-in user / roles change. */
export function useSession(): SessionState {
  return useSyncExternalStore(userSession.subscribe, userSession.getSnapshot);
}

/** Re-renders when permissions (or function-management toggles) change. */
export function usePermissionVersion(): number {
  return useSyncExternalStore(permissionService.subscribe, permissionService.getVersion);
}
