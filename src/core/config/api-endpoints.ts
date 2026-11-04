/**
 * Central API base URLs.
 * Keep every backend service root in this file.
 * Feature API classes should append endpoint paths only.
 *
 * Note: Lead API now uses its direct HTTPS base URL; no Angular dev proxy.
 */
export const API_ENDPOINTS = Object.freeze({
  auth: 'https://superuser.ciitstudent.com/api/Auth',
  account: 'https://superuser.ciitstudent.com/api/account',
  user: 'https://superuser.ciitstudent.com/api/User',
  userRole: 'https://superuser.ciitstudent.com/api/UserRole',
  roles: 'https://superuser.ciitstudent.com/api/roles',
  branch: 'https://superuser.ciitstudent.com/api/branch',

  lead: 'https://leadapis.ciitstudent.com/api',
  leadDirectHost: 'https://leadapis.ciitstudent.com',

  studentRegistration: 'https://student.ciitstudent.com/api/StudentRegistration',
  studentDetails: 'https://student.ciitstudent.com/api/StudentDetails',
  studentPayment: 'https://student.ciitstudent.com/api/StudentPayment',

  batchManagement: 'https://batchmanagement.ciitstudent.com/api',
  trainer: 'https://trainer.ciitstudent.com/api'
} as const);
