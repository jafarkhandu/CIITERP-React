import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/core/auth/ProtectedRoute';
import { PERMISSIONS, type Permission } from '@/core/services/permissionService';
import MainLayout from '@/layouts/MainLayout';
import ComingSoon from '@/features/placeholder/ComingSoon';
import Login from '@/features/account/Login/Login';
import ForgotPassword from '@/features/account/ForgotPassword/ForgotPassword';
import ResetPassword from '@/features/account/ResetPassword/ResetPassword';
import ChangePassword from '@/features/account/ChangePassword/ChangePassword';
import Profile from '@/features/account/Profile/Profile';
import Dashboard from '@/features/dashboard/Dashboard';
import Employee from '@/features/employee/Employee';
import EditUserRoles from '@/features/employee/EditUserRoles';
import Lead from '@/features/lead/Lead';
import LeadFollowup from '@/features/lead/LeadFollowup';
import Course from '@/features/course/Course';
import Enquiry from '@/features/enquiry/Enquiry';

interface Guard { permission?: Permission; permissions?: Permission[]; roles?: string[]; }
const guarded = (element: ReactElement, guard: Guard = {}) => <ProtectedRoute {...guard}>{element}</ProtectedRoute>;
const soon = (title: string, phase: 2 | 3 | 4) => <ComingSoon title={title} phase={phase} />;

export default function AppRoutes() {
  return <Routes>
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
      <Route path="batch" element={guarded(soon('Manage Batch', 4), { roles: ['Admin', 'Super User', 'Group Leader'], permission: PERMISSIONS.GROUP_LEADER_BATCH_VIEW })} />
      <Route path="trainer" element={guarded(soon('Trainer Batches', 4), { roles: ['Trainer'], permission: PERMISSIONS.TRAINER_BATCH_VIEW })} />
      <Route path="trainer/batches/:batchId" element={guarded(soon('Trainer Batch Details', 4), { roles: ['Trainer'], permissions: [PERMISSIONS.TRAINER_BATCH_VIEW, PERMISSIONS.TRAINER_ATTENDANCE_VIEW] })} />
      <Route path="profile" element={guarded(<Profile />)} />
      <Route path="enquiry" element={guarded(<Enquiry />, { permission: PERMISSIONS.ENQUIRY_VIEW })} />
      <Route path="enquiry/add" element={guarded(soon('Add Enquiry', 2), { permission: PERMISSIONS.ENQUIRY_CREATE })} />
      <Route path="enquiry/edit/:id" element={guarded(soon('Edit Enquiry', 2), { permission: PERMISSIONS.ENQUIRY_UPDATE })} />
      <Route path="enquiry/followup/:enquiryId" element={guarded(soon('Enquiry Followup', 2), { permission: PERMISSIONS.ENQUIRY_FOLLOWUP })} />
      <Route path="course" element={guarded(<Course />, { permission: PERMISSIONS.COURSE_VIEW })} />
      <Route path="function-management" element={guarded(soon('Function Management', 4), { permission: PERMISSIONS.FUNCTION_MANAGEMENT_VIEW, roles: ['Admin', 'Super User'] })} />
      <Route path="reports" element={guarded(soon('Reports', 4), { permission: PERMISSIONS.REPORTS_VIEW, roles: ['Admin', 'Super User'] })} />
      <Route path="settings" element={guarded(soon('Settings', 4))} />
      <Route path="student-registration" element={guarded(soon('Student Registration', 3))} />
      <Route path="student-details/:studentId" element={guarded(soon('Student Details', 3))} />
      <Route path="account/student-registration" element={guarded(soon('Student Registration', 3))} />
      <Route path="student-registration/add" element={guarded(soon('Student Registration', 3))} />
      <Route path="student-registration/new" element={guarded(soon('New Student Registration', 3))} />
      <Route path="student-payments" element={guarded(soon('Student Payments', 3))} />
      <Route path="student-payments/create" element={guarded(soon('Create Payment', 3))} />
      <Route index element={<Navigate to="dashboard" replace />} />
    </Route>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;
}
