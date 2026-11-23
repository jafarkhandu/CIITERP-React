function shareImport<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}

export const loadMainLayout = shareImport(() => import('@/layouts/MainLayout'));
export const loadDashboard = shareImport(() => import('@/features/dashboard/Dashboard'));
export const loadStudentPortal = shareImport(() => import('@/features/student/StudentPortal'));
export const loadStudentAccount = shareImport(() => import('@/features/student/StudentAccount'));

export function preloadStaffHome(path: string) {
  const loadPage = path === '/main/student-portal' ? loadStudentPortal : loadDashboard;
  void Promise.all([loadMainLayout(), loadPage()]).catch(() => {
    // If preloading fails, let the route loader retry.
  });
}

export function preloadStudentHome() {
  void loadStudentAccount().catch(() => {
    // If preloading fails, let the route loader retry.
  });
}
