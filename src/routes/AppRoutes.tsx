import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/core/auth/ProtectedRoute';
import { PERMISSIONS, type Permission } from '@/core/services/permissionService';
const MainLayout = lazy(() => import('@/layouts/MainLayout'));
import ComingSoon from '@/features/placeholder/ComingSoon';
const Reports = lazy(() => import('@/features/reports/Reports'));
const Login = lazy(() => import('@/features/account/Login/Login'));
const ForgotPassword = lazy(() => import('@/features/account/ForgotPassword/ForgotPassword'));
const ResetPassword = lazy(() => import('@/features/account/ResetPassword/ResetPassword'));
const ChangePassword = lazy(() => import('@/features/account/ChangePassword/ChangePassword'));
const Profile = lazy(() => import('@/features/account/Profile/Profile'));
const Dashboard = lazy(() => import('@/features/dashboard/Dashboard'));
const Employee = lazy(() => import('@/features/employee/Employee'));
const EditUserRoles = lazy(() => import('@/features/employee/EditUserRoles'));
const Lead = lazy(() => import('@/features/lead/Lead'));
const LeadFollowup = lazy(() => import('@/features/lead/LeadFollowup'));
const Course = lazy(() => import('@/features/course/Course'));
const Enquiry = lazy(() => import('@/features/enquiry/Enquiry'));
const EnquiryForm = lazy(() => import('@/features/enquiry/EnquiryForm'));
const EnquiryFollowup = lazy(() => import('@/features/enquiry/EnquiryFollowup'));
const FunctionManagement = lazy(() => import('@/features/function-management/FunctionManagement'));
const Settings = lazy(() => import('@/features/settings/Settings'));
const EmailCenter = lazy(() => import('@/features/settings/EmailCenter'));
const StudentRegistration = lazy(() => import('@/features/student/StudentRegistration'));
const StudentPayments = lazy(() => import('@/features/student/StudentPayments'));
const TrainerBatches = lazy(() => import('@/features/trainer/TrainerBatches'));
const TrainerBatchDetails = lazy(() => import('@/features/trainer/TrainerBatchDetails'));
const BatchManagement = lazy(() => import('@/features/batch/BatchManagement'));

interface Guard { permission?: Permission; permissions?: Permission[]; roles?: string[]; }
const guarded = (element: ReactElement, guard: Guard = {}) => <ProtectedRoute {...guard}>{element}</ProtectedRoute>;
const soon = (title: string, phase: 2 | 3 | 4) => <ComingSoon title={title} phase={phase} />;

export default function AppRoutes() {
  return <Suspense fallback={<div role="status" aria-live="polite" style={{ minHeight: '40vh', display: 'grid', placeItems: 'center', padding: '2rem', color: 'var(--text-muted, #6b7280)' }}>Loading module…</div>}><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/main" element={guarded(<MainLayout />)}>
      <Route path="dashboard" element={guarded(<Dashboard />, { permission: PERMISSIONS.DASHBOARD_VIEW })} />
      <Route path="user" element={guarded(<Employee />, { permission: PERMISSIONS.USER_VIEW })} />
      <Route path="edit-user-roles/:userId" element={guarded(<EditUserRoles />, { permission: PERMISSIONS.ROLE_UPDATE })} />
      <Route path="lead" element={guarded(<Lead />, { permission: PERMISSIONS.LEAD_VIEW })} />
      <Route path="lead/followup/:leadId" element={guarded(<LeadFollowup />, { permission: PERMISSIONS.LEAD_FOLLOWUP })} />
      <Route path="change-password" element={guarded(<ChangePassword />)} />
      <Route path="batch" element={guarded(<BatchManagement />, { roles: ['Admin', 'Super User', 'Group Leader'], permission: PERMISSIONS.GROUP_LEADER_BATCH_VIEW })} />
      <Route path="trainer" element={guarded(<TrainerBatches />, { roles: ['Admin', 'Super User', 'Trainer'], permission: PERMISSIONS.TRAINER_BATCH_VIEW })} />
      <Route path="trainer/batches/:batchId" element={guarded(<TrainerBatchDetails />, { roles: ['Admin', 'Super User', 'Trainer'], permissions: [PERMISSIONS.TRAINER_BATCH_VIEW, PERMISSIONS.TRAINER_ATTENDANCE_VIEW] })} />
      <Route path="profile" element={guarded(<Profile />)} />
      <Route path="enquiry" element={guarded(<Enquiry />, { permission: PERMISSIONS.ENQUIRY_VIEW })} />
      <Route path="enquiry/add" element={guarded(<EnquiryForm />, { permission: PERMISSIONS.ENQUIRY_CREATE })} />
      <Route path="enquiry/edit/:id" element={guarded(<EnquiryForm />, { permission: PERMISSIONS.ENQUIRY_UPDATE })} />
      <Route path="enquiry/followup/:enquiryId" element={guarded(<EnquiryFollowup />, { permission: PERMISSIONS.ENQUIRY_FOLLOWUP })} />
      <Route path="course" element={guarded(<Course />, { permission: PERMISSIONS.COURSE_VIEW })} />
      <Route path="function-management" element={guarded(<FunctionManagement />, { permission: PERMISSIONS.FUNCTION_MANAGEMENT_VIEW, roles: ['Admin', 'Super User'] })} />
      <Route path="reports" element={guarded(<Reports />, { permission: PERMISSIONS.REPORTS_VIEW, roles: ['Admin', 'Super User'] })} />
      <Route path="settings" element={guarded(<Settings />)} />
      <Route path="email-services" element={guarded(<EmailCenter />, { roles: ['Admin', 'Super User'] })} />
      <Route path="student-registration" element={guarded(<StudentRegistration />)} />
      <Route path="student-details/:studentId" element={guarded(soon('Student Details', 3))} />
      <Route path="account/student-registration" element={guarded(<StudentRegistration />)} />
      <Route path="student-registration/add" element={guarded(<StudentRegistration />)} />
      <Route path="student-registration/new" element={guarded(<StudentRegistration />)} />
      <Route path="student-payments" element={guarded(<StudentPayments />)} />
      <Route path="student-payments/create" element={guarded(<StudentPayments />)} />
      <Route index element={<Navigate to="dashboard" replace />} />
    </Route>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes></Suspense>;
}
