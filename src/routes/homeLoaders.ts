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

// Share route imports between navigation intent and React.lazy.
export const loadReports = shareImport(() => import('@/features/reports/Reports'));
export const loadEmployee = shareImport(() => import('@/features/employee/Employee'));
export const loadLead = shareImport(() => import('@/features/lead/Lead'));
export const loadCourse = shareImport(() => import('@/features/course/Course'));
export const loadTopics = shareImport(() => import('@/features/developer/Topics'));
export const loadCourseMapping = shareImport(() => import('@/features/developer/CourseMapping'));
export const loadEnquiry = shareImport(() => import('@/features/enquiry/Enquiry'));
export const loadFunctionManagement = shareImport(() => import('@/features/function-management/FunctionManagement'));
export const loadStudentRegistration = shareImport(() => import('@/features/student/StudentRegistration'));
export const loadStudentPayments = shareImport(() => import('@/features/student/StudentPayments'));
export const loadTrainerBatches = shareImport(() => import('@/features/trainer/TrainerBatches'));
export const loadTrainerPortal = shareImport(() => import('@/features/trainer/TrainerPortal'));
export const loadBatchManagement = shareImport(() => import('@/features/batch/BatchManagement'));

const workspaceLoaders: Readonly<Record<string, () => Promise<unknown>>> = {
  '/main/dashboard': loadDashboard,
  '/main/student-portal': loadStudentPortal,
  '/main/reports': loadReports,
  '/main/user': loadEmployee,
  '/main/lead': loadLead,
  '/main/course': loadCourse,
  '/main/topics': loadTopics,
  '/main/course-mapping': loadCourseMapping,
  '/main/enquiry': loadEnquiry,
  '/main/function-management': loadFunctionManagement,
  '/main/student-registration': loadStudentRegistration,
  '/main/student-payments': loadStudentPayments,
  '/main/trainer': loadTrainerBatches,
  '/main/trainer-portal': loadTrainerPortal,
  '/main/batch': loadBatchManagement,
};

/** Warm only page code for visible navigation links, never API data. */
export function preloadWorkspacePage(path: string): void {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (connection?.saveData || /^(slow-2g|2g)$/.test(connection?.effectiveType ?? '')) return;
  const load = workspaceLoaders[path];
  if (load) void load().catch(() => {
    // Failed imports can be retried by the shared loader.
  });
}
