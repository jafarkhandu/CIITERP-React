export const API_ORIGINS = {
  staff: 'https://superuser.ciitstudent.com',
  lead: 'https://leadapis.ciitstudent.com',
  developer: 'https://developer.ciitstudent.com',
  email: 'https://emailmanagement.ciitstudent.com',
  student: 'https://student.ciitstudent.com',
  batch: 'https://batchmanagement.ciitstudent.com',
  trainer: 'https://trainer.ciitstudent.com',
} as const;

export type ApiService = keyof typeof API_ORIGINS;

export function devApiPrefix(service: ApiService) {
  return `/__ciit_api/${service}`;
}
