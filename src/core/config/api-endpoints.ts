import { API_ORIGINS, devApiPrefix, type ApiService } from './api-services';

function apiRoot(service: ApiService) {
  const prefix = import.meta.env.DEV ? devApiPrefix(service) : null;
  const origin = prefix ?? API_ORIGINS[service];
  return `${origin}/api`;
}

const staff = apiRoot('staff');
const student = apiRoot('student');

export const API_ENDPOINTS = Object.freeze({
  auth: `${staff}/Auth`,
  account: `${staff}/account`,
  user: `${staff}/User`,
  userProfile: `${staff}/UserProfile`,
  userRole: `${staff}/UserRole`,
  roles: `${staff}/roles`,
  branch: `${staff}/branch`,

  lead: apiRoot('lead'),
  developerTraining: apiRoot('developer'),
  emailManagement: apiRoot('email'),

  studentLogin: `${student}/StudentLogin`,
  studentRegistration: `${student}/StudentRegistration`,
  studentDetails: `${student}/StudentDetails`,
  studentPayment: `${student}/StudentPayment`,
  studentAttendance: `${student}/StudentAttendance`,

  batchManagement: apiRoot('batch'),
  trainer: apiRoot('trainer'),
});
