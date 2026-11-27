import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/core/auth/ProtectedRoute';
import { PERMISSIONS, type Permission } from '@/core/services/permissionService';
import Login from '@/features/account/Login/Login';
import ComingSoon from '@/features/placeholder/ComingSoon';
import {
  loadDashboard, loadMainLayout, loadStudentAccount, loadStudentPortal,
  loadReports,
  loadEmployee,
  loadLead,
  loadCourse,
  loadTopics,
  loadCourseMapping,
  loadEnquiry,
  loadFunctionManagement,
  loadStudentRegistration,
  loadStudentPayments,
  loadTrainerBatches,
  loadTrainerPortal,
  loadBatchManagement,
} from './homeLoaders';

const MainLayout = lazy(loadMainLayout);
const Reports = lazy(loadReports);
const ForgotPassword = lazy(() => import('@/features/account/ForgotPassword/ForgotPassword'));
const ResetPassword = lazy(() => import('@/features/account/ResetPassword/ResetPassword'));
const StudentForgotPassword = lazy(() => import('@/features/student/StudentPasswordRecovery').then(module => ({ default: module.StudentForgotPassword })));
const StudentResetPassword = lazy(() => import('@/features/student/StudentPasswordRecovery').then(module => ({ default: module.StudentResetPassword })));
const ChangePassword = lazy(() => import('@/features/account/ChangePassword/ChangePassword'));
const Profile = lazy(() => import('@/features/account/Profile/Profile'));
const Dashboard = lazy(loadDashboard);
const Employee = lazy(loadEmployee);
const EditUserRoles = lazy(() => import('@/features/employee/EditUserRoles'));
const Lead = lazy(loadLead);
const LeadFollowup = lazy(() => import('@/features/lead/LeadFollowup'));
const Course = lazy(loadCourse);
const CourseDetails = lazy(() => import('@/features/course/CourseDetails'));
const Topics = lazy(loadTopics);
const CourseMapping = lazy(loadCourseMapping);
const Enquiry = lazy(loadEnquiry);
const EnquiryForm = lazy(() => import('@/features/enquiry/EnquiryForm'));
const EnquiryFollowup = lazy(() => import('@/features/enquiry/EnquiryFollowup'));
const FunctionManagement = lazy(loadFunctionManagement);
const StudentRegistration = lazy(loadStudentRegistration);
const StudentPayments = lazy(loadStudentPayments);
const StudentPortal = lazy(loadStudentPortal);
const StudentAccount = lazy(loadStudentAccount);
const TrainerBatches = lazy(loadTrainerBatches);
const TrainerPortal = lazy(loadTrainerPortal);
const TrainerBatchDetails = lazy(() => import('@/features/trainer/TrainerBatchDetails'));
const BatchManagement = lazy(loadBatchManagement);

interface Guard { permission?: Permission; permissions?: Permission[]; roles?: string[]; }
const moduleLoading = (
  <div role="status" aria-live="polite" style={{ minHeight: '40vh', display: 'grid', placeItems: 'center', padding: '2rem', color: 'var(--text-muted, #6b7280)' }}>
    Loading module…
  </div>
);
const guarded = (element: ReactElement, guard: Guard = {}) => (
  <ProtectedRoute {...guard}>
    <Suspense fallback={moduleLoading}>{element}</Suspense>
  </ProtectedRoute>
);
const soon = (title: string, phase: 2 | 3 | 4) => <ComingSoon title={title} phase={phase} />;

export default function AppRoutes() {
  return <Suspense fallback={moduleLoading}><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/student-portal/:page?" element={guarded(<StudentAccount />, { roles: ['Student'] })} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/student-forgot-password" element={<StudentForgotPassword />} />
    <Route path="/student-reset-password" element={<StudentResetPassword />} />
    <Route path="/main" element={guarded(<MainLayout />)}>
      <Route path="dashboard" element={guarded(<Dashboard />, { permission: PERMISSIONS.DASHBOARD_VIEW })} />
      <Route path="user" element={guarded(<Employee />, { permission: PERMISSIONS.USER_VIEW })} />
      <Route path="edit-user-roles/:userId" element={guarded(<EditUserRoles />, { permission: PERMISSIONS.ROLE_UPDATE })} />
      <Route path="lead" element={guarded(<Lead />, { permission: PERMISSIONS.LEAD_VIEW })} />
      <Route path="lead/followup/:leadId" element={guarded(<LeadFollowup />, { permission: PERMISSIONS.LEAD_FOLLOWUP })} />
      <Route path="change-password" element={guarded(<ChangePassword />)} />
      <Route path="batch" element={guarded(<BatchManagement />, { roles: ['Admin', 'Super User', 'Group Leader'], permission: PERMISSIONS.GROUP_LEADER_BATCH_VIEW })} />
      <Route path="trainer" element={guarded(<TrainerBatches />, { roles: ['Admin', 'Super User', 'Trainer'], permission: PERMISSIONS.TRAINER_BATCH_VIEW })} />
      <Route path="trainer-portal" element={guarded(<TrainerPortal />, { roles: ['Super User'], permission: PERMISSIONS.GROUP_LEADER_BATCH_VIEW })} />
      <Route path="trainer/batches/:batchId" element={guarded(<TrainerBatchDetails />, { roles: ['Admin', 'Super User', 'Trainer'], permissions: [PERMISSIONS.TRAINER_BATCH_VIEW, PERMISSIONS.TRAINER_ATTENDANCE_VIEW] })} />
      <Route path="profile" element={guarded(<Profile />)} />
      <Route path="enquiry" element={guarded(<Enquiry />, { permission: PERMISSIONS.ENQUIRY_VIEW })} />
      <Route path="enquiry/add" element={guarded(<EnquiryForm />, { permission: PERMISSIONS.ENQUIRY_CREATE })} />
      <Route path="enquiry/edit/:id" element={guarded(<EnquiryForm />, { permission: PERMISSIONS.ENQUIRY_UPDATE })} />
      <Route path="enquiry/followup/:enquiryId" element={guarded(<EnquiryFollowup />, { permission: PERMISSIONS.ENQUIRY_FOLLOWUP })} />
      <Route path="course" element={guarded(<Course />, { permission: PERMISSIONS.COURSE_VIEW })} />
      <Route path="course/:courseId" element={guarded(<CourseDetails />, { permission: PERMISSIONS.COURSE_VIEW })} />
      <Route path="topics" element={guarded(<Topics />, { roles: ['Developer', 'Super User'], permission: PERMISSIONS.COURSE_VIEW })} />
      <Route path="course-mapping" element={guarded(<CourseMapping />, { roles: ['Developer', 'Super User'], permission: PERMISSIONS.COURSE_VIEW })} />
      <Route path="function-management" element={guarded(<FunctionManagement />, { permission: PERMISSIONS.FUNCTION_MANAGEMENT_VIEW, roles: ['Admin', 'Super User'] })} />
      <Route path="reports" element={guarded(<Reports />, { permission: PERMISSIONS.REPORTS_VIEW, roles: ['Admin', 'Super User'] })} />
      <Route path="student-registration" element={guarded(<StudentRegistration />)} />
      <Route path="student-details/:studentId" element={guarded(soon('Student Details', 3))} />
      <Route path="account/student-registration" element={guarded(<StudentRegistration />)} />
      <Route path="student-registration/add" element={guarded(<StudentRegistration />)} />
      <Route path="student-registration/new" element={guarded(<StudentRegistration />)} />
      <Route path="student-payments" element={guarded(<StudentPayments />)} />
      <Route path="student-portal" element={guarded(<StudentPortal />, { roles: ['Accountant', 'Admin', 'Super User'] })} />
      <Route path="student-payments/create" element={guarded(<StudentPayments />)} />
      <Route index element={<Navigate to="dashboard" replace />} />
    </Route>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes></Suspense>;
}
