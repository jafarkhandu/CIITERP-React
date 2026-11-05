import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession, usePermissionVersion } from '@/core/auth/hooks';
import { PERMISSIONS, permissionService, type Permission } from '@/core/services/permissionService';
import { leadApi, type LeadRecord, type LeadFollowupRecord } from '@/api/leadApi';
import { enquiryApi, type EnquiryRecord } from '@/api/enquiryApi';
import { courseApi, type TrainingCourseRecord } from '@/api/courseApi';
import { batchApi, batchStudentApi, batchScheduleApi } from '@/api/batchApi';
import { studentApi, trainerApi, type PaymentRow, type StudentRow } from '@/api/studentApi';
import { directoryApi, type RoleOption } from '@/api/directoryApi';
import './Dashboard.css';

type DashboardCard = {
  title: string;
  description: string;
  route: string;
  icon: string;
  permission?: Permission;
  sales?: boolean;
  accounting?: boolean;
};

type Metric = {
  label: string;
  value: number;
  detail: string;
  icon: string;
  tone: 'blue' | 'teal' | 'amber' | 'violet' | 'orange' | 'slate';
  route: string;
  format?: 'currency';
};

type ChartItem = { label: string; value: number; displayValue?: string };
type BatchSummary = { id: number; name: string; course: string; students: number; route: string };
type RecentPayment = { id: number; student: string; course: string; mode: string; date: string; amount: number };

type DashboardSnapshot = {
  metrics: Metric[];
  pipeline: ChartItem[];
  paymentModes: ChartItem[];
  batches: BatchSummary[];
  recentPayments: RecentPayment[];
  failedSources: string[];
  updatedAt: Date | null;
};

const emptySnapshot: DashboardSnapshot = {
  metrics: [],
  pipeline: [],
  paymentModes: [],
  batches: [],
  recentPayments: [],
  failedSources: [],
  updatedAt: null,
};

const field = (row: object, ...keys: string[]): unknown => {
  const value = row as Record<string, unknown>;
  return keys.map((key) => value[key]).find((item) => item !== undefined && item !== null && item !== '');
};

const numberValue = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isDeleted = (row: object): boolean => {
  if (field(row, 'deletedAt', 'deleted_at')) return true;
  const marker = field(row, 'isDeleted', 'is_deleted', 'deleted');
  if (marker === true || marker === 1) return true;
  return ['true', '1', 'yes', 'deleted'].includes(String(marker ?? '').trim().toLowerCase());
};

const formatMoney = (value: number): string => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(value);

const formatCount = (value: number): string => new Intl.NumberFormat('en-IN').format(value);

const formatDate = (value: unknown): string => {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

function buildBatchSummary(rows: Record<string, unknown>[]): BatchSummary[] {
  return rows.map((row) => ({
    id: numberValue(field(row, 'batchId', 'batch_id', 'BatchId', 'id')),
    name: String(field(row, 'batchName', 'batch_name', 'name') ?? 'Unnamed batch'),
    course: String(field(row, 'courseName', 'course_name', 'course', 'topicName', 'topic_name') ?? 'Course not specified'),
    students: numberValue(field(row, 'studentCount', 'student_count', 'totalStudents')),
    route: '/main/trainer',
  })).filter((batch) => batch.id > 0);
}

export default function Dashboard() {
  const session = useSession();
  const permissionVersion = usePermissionVersion();

  const roles = useMemo(
    () => session.roles.map((role) => role.trim().toLowerCase()),
    [session.roles],
  );
  const isSuperUser = roles.includes('super user');
  const isAdmin = roles.some((role) => ['admin', 'super user'].includes(role));
  const isCounsellor = roles.some((role) => ['counsellor', 'counciler'].includes(role));
  const isAccountant = roles.includes('accountant');
  const isGroupLeader = roles.some((role) => ['group leader', 'groupleader'].includes(role));
  const isTrainer = roles.includes('trainer');
  const isDeveloper = roles.includes('developer');

  const salesRole = isAdmin || isCounsellor;
  const accountingRole = isAdmin || isAccountant;

  const cards: DashboardCard[] = [
    { title: 'Employees', description: 'Manage system users and access.', route: '/main/user', icon: 'bi-people-fill', permission: PERMISSIONS.USER_VIEW },
    { title: 'Leads', description: 'Manage leads and follow-ups.', route: '/main/lead', icon: 'bi-person-lines-fill', permission: PERMISSIONS.LEAD_VIEW, sales: true },
    { title: 'Enquiries', description: 'Manage candidate enquiries and follow-ups.', route: '/main/enquiry', icon: 'bi-chat-square-text-fill', permission: PERMISSIONS.ENQUIRY_VIEW, sales: true },
    { title: 'Courses', description: 'Manage training courses and fees.', route: '/main/course', icon: 'bi-journal-bookmark-fill', permission: PERMISSIONS.COURSE_VIEW, sales: true },
    { title: 'Manage Batch', description: 'Manage batches, schedules, and attendance.', route: '/main/batch', icon: 'bi-calendar2-week-fill', permission: PERMISSIONS.GROUP_LEADER_BATCH_VIEW },
    { title: 'Trainer Batches', description: 'View assigned training batches.', route: '/main/trainer', icon: 'bi-easel2-fill', permission: PERMISSIONS.TRAINER_BATCH_VIEW },
    { title: 'Student Registration', description: 'View student profiles and course registrations.', route: '/main/student-registration', icon: 'bi-mortarboard-fill', accounting: true },
    { title: 'Student Payments', description: 'Review student payment history and collections.', route: '/main/student-payments', icon: 'bi-wallet2', accounting: true },
    { title: 'Reports', description: 'Review operational reports.', route: '/main/reports', icon: 'bi-graph-up-arrow', permission: PERMISSIONS.REPORTS_VIEW },
  ].filter((card) => (
    (!card.permission || permissionService.hasPermission(card.permission))
    && (!card.sales || salesRole)
    && (!card.accounting || accountingRole)
  ));

  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [directoryRoles, setDirectoryRoles] = useState<RoleOption[]>([]);
  const [directoryRolesLoading, setDirectoryRolesLoading] = useState(false);
  const [directoryRolesError, setDirectoryRolesError] = useState('');
  const [expandedRole, setExpandedRole] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    let leads: LeadRecord[] | null = null;
    let enquiries: EnquiryRecord[] | null = null;
    let leadFollowups: LeadFollowupRecord[] | null = null;
    let courses: TrainingCourseRecord[] | null = null;
    let batches: Record<string, unknown>[] | null = null;
    let batchStudents: Record<string, unknown>[] | null = null;
    let schedules: Record<string, unknown>[] | null = null;
    let assignedBatches: Record<string, unknown>[] | null = null;
    let students: StudentRow[] | null = null;
    let registrations: Record<string, unknown>[] | null = null;
    let payments: PaymentRow[] | null = null;
    const failedSources: string[] = [];
    const jobs: Promise<void>[] = [];

    const request = <T,>(
      label: string,
      load: () => Promise<T>,
      assign: (value: T) => void,
    ) => {
      jobs.push((async () => {
        try {
          assign(await load());
        } catch (error) {
          console.error(`Dashboard data load failed (${label}):`, error);
          failedSources.push(label);
        }
      })());
    };

    if (isAdmin || isCounsellor) {
      request('leads', () => leadApi.getAll(), (value) => { leads = value.filter((row) => !row.deletedAt); });
      request('enquiries', () => enquiryApi.getAll(), (value) => { enquiries = value.filter((row) => !row.deletedAt); });
      if (isCounsellor && !isAdmin) {
        request('lead follow-ups', () => leadApi.getAllFollowups(), (value) => { leadFollowups = value.filter((row) => !row.deletedAt); });
      }
    }

    if (isAdmin || isAccountant) {
      request('students', () => studentApi.getStudents(), (value) => { students = value; });
      request('payments', () => studentApi.getPayments(), (value) => {
        payments = value.filter((row) => !isDeleted(row));
      });
      if (isAccountant && !isAdmin) {
        request('registrations', () => studentApi.getRegistrations(), (value) => { registrations = value; });
      }
    }

    if (isAdmin || isGroupLeader) {
      request('batches', () => batchApi.getAll(), (value) => { batches = value.filter((row) => !isDeleted(row)); });
      if (!isAdmin) {
        request('batch assignments', () => batchStudentApi.getAll(), (value) => {
          batchStudents = value.filter((row) => !isDeleted(row));
        });
        request('batch schedules', () => batchScheduleApi.getAll(), (value) => {
          schedules = value.filter((row) => !isDeleted(row));
        });
      }
    }

    if (isAdmin || isDeveloper) {
      request('courses', () => courseApi.getAll(), (value) => { courses = value.filter((row) => !row.deletedAt); });
    }

    if (isTrainer && !isAdmin) {
      request('assigned batches', () => trainerApi.getMyBatches(), (value) => {
        assignedBatches = value;
      });
    }

    await Promise.all(jobs);

    const metrics: Metric[] = [];
    const pipeline: ChartItem[] = [];
    const paymentTotals = new Map<string, number>();
    let recentPayments: RecentPayment[] = [];
    let batchCards: BatchSummary[] = [];

    if (isAdmin) {
      if (leads !== null) {
        metrics.push({ label: 'Total Leads', value: leads.length, detail: 'Active lead records', icon: 'bi-person-lines-fill', tone: 'blue', route: '/main/lead' });
        pipeline.push({ label: 'Leads', value: leads.length });
      }
      if (enquiries !== null) {
        metrics.push({ label: 'Enquiries', value: enquiries.length, detail: 'Candidate enquiries', icon: 'bi-chat-square-text', tone: 'teal', route: '/main/enquiry' });
        pipeline.push({ label: 'Enquiries', value: enquiries.length });
      }
      if (students !== null) {
        metrics.push({ label: 'Students', value: students.length, detail: 'Registered student profiles', icon: 'bi-mortarboard', tone: 'violet', route: '/main/student-registration' });
      }
      if (payments !== null) {
        const total = payments.reduce((sum, row) => sum + numberValue(row.paymentAmount), 0);
        metrics.push({ label: 'Total Collected', value: total, detail: `${formatCount(payments.length)} payment records`, icon: 'bi-wallet2', tone: 'amber', route: '/main/student-payments', format: 'currency' });
      }
      if (courses !== null) {
        metrics.push({ label: 'Courses', value: courses.length, detail: 'Available course records', icon: 'bi-journal-bookmark', tone: 'orange', route: '/main/course' });
      }
      if (batches !== null) {
        metrics.push({ label: 'Batches', value: batches.length, detail: 'Training batches', icon: 'bi-calendar2-week', tone: 'slate', route: '/main/batch' });
        batchCards = buildBatchSummary(batches).slice(0, 4).map((batch) => ({ ...batch, route: '/main/batch' }));
      }
    } else if (isAccountant) {
      if (students !== null) metrics.push({ label: 'Students', value: students.length, detail: 'Registered student profiles', icon: 'bi-mortarboard', tone: 'violet', route: '/main/student-registration' });
      if (registrations !== null) metrics.push({ label: 'Course Registrations', value: registrations.length, detail: 'Enrollment records', icon: 'bi-journal-check', tone: 'blue', route: '/main/student-registration' });
      if (payments !== null) {
        const total = payments.reduce((sum, row) => sum + numberValue(row.paymentAmount), 0);
        metrics.push({ label: 'Payment Records', value: payments.length, detail: 'Transactions in the payment register', icon: 'bi-receipt', tone: 'teal', route: '/main/student-payments' });
        metrics.push({ label: 'Total Collected', value: total, detail: 'Sum of loaded payment amounts', icon: 'bi-wallet2', tone: 'amber', route: '/main/student-payments', format: 'currency' });
      }
    } else if (isTrainer) {
      if (assignedBatches !== null) {
        batchCards = buildBatchSummary(assignedBatches).slice(0, 6);
        metrics.push({ label: 'Assigned Batches', value: assignedBatches.length, detail: 'Batches returned for your trainer account', icon: 'bi-easel2', tone: 'blue', route: '/main/trainer' });
        const studentCountIsAvailable = assignedBatches.some((row) => field(row, 'studentCount', 'student_count', 'totalStudents') !== undefined);
        if (studentCountIsAvailable) {
          const studentTotal = assignedBatches.reduce((sum, row) => sum + numberValue(field(row, 'studentCount', 'student_count', 'totalStudents')), 0);
          metrics.push({ label: 'Assigned Students', value: studentTotal, detail: 'Sum of student counts supplied by the batch API', icon: 'bi-people', tone: 'teal', route: '/main/trainer' });
        }
      }
    } else if (isGroupLeader) {
      if (batches !== null) {
        metrics.push({ label: 'Batches', value: batches.length, detail: 'Managed training batches', icon: 'bi-calendar2-week', tone: 'blue', route: '/main/batch' });
        batchCards = buildBatchSummary(batches).slice(0, 6).map((batch) => ({ ...batch, route: '/main/batch' }));
      }
      if (batchStudents !== null) metrics.push({ label: 'Assigned Students', value: batchStudents.length, detail: 'Batch assignment records', icon: 'bi-people', tone: 'teal', route: '/main/batch' });
      if (schedules !== null) metrics.push({ label: 'Schedule Records', value: schedules.length, detail: 'Generated batch schedule entries', icon: 'bi-calendar-check', tone: 'violet', route: '/main/batch' });
    } else if (isCounsellor) {
      if (leads !== null) {
        const converted = leads.filter((row) => /convert/i.test(row.status || '')).length;
        metrics.push({ label: 'Total Leads', value: leads.length, detail: 'Active lead records', icon: 'bi-person-lines-fill', tone: 'blue', route: '/main/lead' });
        metrics.push({ label: 'Lead Conversion', value: leads.length ? Math.round(converted * 1000 / leads.length) / 10 : 0, detail: `${converted} converted leads`, icon: 'bi-graph-up-arrow', tone: 'teal', route: '/main/lead' });
        pipeline.push({ label: 'Leads', value: leads.length });
        pipeline.push({ label: 'Converted leads', value: converted });
      }
      if (enquiries !== null) {
        metrics.push({ label: 'Enquiries', value: enquiries.length, detail: 'Candidate enquiries', icon: 'bi-chat-square-text', tone: 'violet', route: '/main/enquiry' });
        pipeline.push({ label: 'Enquiries', value: enquiries.length });
      }
      if (leadFollowups !== null) metrics.push({ label: 'Follow-ups', value: leadFollowups.length, detail: 'Recorded lead follow-ups', icon: 'bi-calendar2-check', tone: 'amber', route: '/main/lead' });
    } else if (isDeveloper) {
      if (courses !== null) metrics.push({ label: 'Courses', value: courses.length, detail: 'Available course records', icon: 'bi-journal-bookmark', tone: 'blue', route: '/main/course' });
    }

    if (leads !== null && !isCounsellor && !isAdmin) {
      pipeline.push({ label: 'Leads', value: leads.length });
    }

    if (payments !== null) {
      const activePayments = payments.filter((row) => !isDeleted(row));
      activePayments.forEach((row) => {
        const mode = String(row.paymentMode || 'Other').trim() || 'Other';
        paymentTotals.set(mode, (paymentTotals.get(mode) || 0) + numberValue(row.paymentAmount));
      });
      recentPayments = activePayments
        .slice()
        .sort((a, b) => {
          const first = new Date(String(a.paymentDate || '')).getTime() || 0;
          const second = new Date(String(b.paymentDate || '')).getTime() || 0;
          return second - first;
        })
        .slice(0, 5)
        .map((row) => ({
          id: row.paymentId,
          student: [row.studentName, row.lastName].filter(Boolean).join(' ') || 'Student',
          course: row.courseName || '—',
          mode: row.paymentMode || '—',
          date: formatDate(row.paymentDate),
          amount: numberValue(row.paymentAmount),
        }));
    }

    paymentTotals.forEach((value, label) => {
      if (!Number.isFinite(value)) paymentTotals.set(label, 0);
    });

    const paymentModes = [...paymentTotals.entries()]
      .map(([label, value]) => ({ label, value, displayValue: formatMoney(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    if (pipeline.length > 1 && leads !== null && pipeline.every((item) => item.label !== 'Converted leads')) {
      const converted = leads.filter((row) => /convert/i.test(row.status || '')).length;
      pipeline.push({ label: 'Converted leads', value: converted });
    }

    setSnapshot({
      metrics,
      pipeline,
      paymentModes,
      batches: batchCards,
      recentPayments,
      failedSources,
      updatedAt: new Date(),
    });
    setLoading(false);
  }, [isAdmin, isCounsellor, isAccountant, isGroupLeader, isTrainer, isDeveloper]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);


  useEffect(() => {
    if (!isSuperUser) return undefined;

    let cancelled = false;
    setDirectoryRolesLoading(true);
    setDirectoryRolesError('');
    directoryApi.getRoles()
      .then((items) => {
        if (cancelled) return;
        const uniqueRoles = items.filter((role, index, all) =>
          all.findIndex((item) => item.roleId === role.roleId) === index,
        );
        setDirectoryRoles(uniqueRoles);
        setExpandedRole((current) => current || uniqueRoles[0]?.roleName || '');
      })
      .catch((error) => {
        console.error('Dashboard role directory load failed:', error);
        if (!cancelled) setDirectoryRolesError('Unable to load the role directory. Please retry.');
      })
      .finally(() => {
        if (!cancelled) setDirectoryRolesLoading(false);
      });

    return () => { cancelled = true; };
  }, [isSuperUser]);

  const roleModuleGroups = useMemo(() => {
    const roleKey = (value: string) => value.trim().toLowerCase().replace(/[\\s_-]+/g, '');
    const modulesByRole: Record<string, string[]> = {
      // Keep this list aligned with the modules each role can actually open.
      // Role names themselves come from the backend role directory below.
      superuser: ['Employees', 'Leads', 'Enquiries', 'Courses', 'Manage Batch', 'Trainer Batches', 'Student Registration', 'Student Payments', 'Reports', 'Function Management', 'Email Services'],
      admin: ['Employees', 'Leads', 'Enquiries', 'Courses', 'Manage Batch', 'Trainer Batches', 'Student Registration', 'Student Payments', 'Reports', 'Email Services'],
      accountant: ['Student Registration', 'Student Payments'],
      counsellor: ['Leads', 'Enquiries', 'Courses'],
      counciler: ['Leads', 'Enquiries', 'Courses'],
      groupleader: ['Manage Batch'],
      trainer: ['Trainer Batches'],
      developer: ['Courses'],
      // Students currently have dashboard access only; do not invent module shortcuts.
      student: [],
    };
    const moduleDetails: Record<string, DashboardCard> = {
      Employees: { title: 'Employees', description: 'Manage system users and access.', route: '/main/user', icon: 'bi-people-fill', permission: PERMISSIONS.USER_VIEW },
      Leads: { title: 'Leads', description: 'Manage leads and follow-ups.', route: '/main/lead', icon: 'bi-person-lines-fill', permission: PERMISSIONS.LEAD_VIEW },
      Enquiries: { title: 'Enquiries', description: 'Manage candidate enquiries and follow-ups.', route: '/main/enquiry', icon: 'bi-chat-square-text-fill', permission: PERMISSIONS.ENQUIRY_VIEW },
      Courses: { title: 'Courses', description: 'Manage training courses and fees.', route: '/main/course', icon: 'bi-journal-bookmark-fill', permission: PERMISSIONS.COURSE_VIEW },
      'Manage Batch': { title: 'Manage Batch', description: 'Manage batches, schedules, and attendance.', route: '/main/batch', icon: 'bi-calendar2-week-fill', permission: PERMISSIONS.GROUP_LEADER_BATCH_VIEW },
      'Trainer Batches': { title: 'Trainer Batches', description: 'View assigned training batches.', route: '/main/trainer', icon: 'bi-easel2-fill', permission: PERMISSIONS.TRAINER_BATCH_VIEW },
      'Student Registration': { title: 'Student Registration', description: 'View student profiles and course registrations.', route: '/main/student-registration', icon: 'bi-mortarboard-fill' },
      'Student Payments': { title: 'Student Payments', description: 'Review student payment history and collections.', route: '/main/student-payments', icon: 'bi-wallet2' },
      Reports: { title: 'Reports', description: 'Review operational reports.', route: '/main/reports', icon: 'bi-graph-up-arrow', permission: PERMISSIONS.REPORTS_VIEW },
      'Function Management': { title: 'Function Management', description: 'Configure permitted application modules.', route: '/main/function-management', icon: 'bi-sliders2', permission: PERMISSIONS.FUNCTION_MANAGEMENT_VIEW },
      'Email Services': { title: 'Email Services', description: 'Manage system email services.', route: '/main/email-services', icon: 'bi-envelope-at-fill' },
    };
    return directoryRoles.map((role) => {
      const configured = modulesByRole[roleKey(role.roleName)] || [];
      const modules = configured
        .map((name) => moduleDetails[name])
        .filter((module): module is DashboardCard => Boolean(module))
        .filter((module) => !module.permission || permissionService.hasPermission(module.permission));
      return { ...role, modules };
    });
  }, [directoryRoles, session.roles, permissionVersion]);

  const retryRoleDirectory = () => {
    setDirectoryRolesError('');
    setDirectoryRolesLoading(true);
    directoryApi.getRoles()
      .then((items) => {
        const uniqueRoles = items.filter((role, index, all) =>
          all.findIndex((item) => item.roleId === role.roleId) === index,
        );
        setDirectoryRoles(uniqueRoles);
        setExpandedRole((current) => current || uniqueRoles[0]?.roleName || '');
      })
      .catch((error) => {
        console.error('Dashboard role directory retry failed:', error);
        setDirectoryRolesError('Unable to load the role directory. Please retry.');
      })
      .finally(() => setDirectoryRolesLoading(false));
  };

  const roleLabel = session.roleName || session.roles.join(' · ') || 'User';
  const hasLiveData = snapshot.metrics.length > 0;
  const chartMax = Math.max(...snapshot.pipeline.map((item) => item.value), 1);
  const paymentMax = Math.max(...snapshot.paymentModes.map((item) => item.value), 1);

  return (
    <main className="dashboard-page">
      <section className="dashboard-welcome">
        <div className="dashboard-welcome-copy">
          <span className="dashboard-eyebrow">CIIT ERP · WORKSPACE OVERVIEW</span>
          <h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {session.employeeName || 'there'}.</h1>
          <p>Your {roleLabel} workspace at a glance{session.branch ? ` · ${session.branch}` : ''}.</p>
          <div className="dashboard-welcome-meta">
            <span><i className="bi bi-shield-check" aria-hidden="true" /> Role-based overview</span>
            <span><i className="bi bi-activity" aria-hidden="true" /> Connected module data</span>
          </div>
        </div>
        <div className="dashboard-welcome-actions">
          <span className="dashboard-updated">{snapshot.updatedAt ? `Updated ${snapshot.updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Overview'}</span>
          <button type="button" className="dashboard-refresh" onClick={() => void loadDashboard()} disabled={loading}>
            <i className={loading ? 'bi bi-arrow-repeat' : 'bi bi-arrow-clockwise'} aria-hidden="true" />
            {loading ? 'Refreshing' : 'Refresh data'}
          </button>
        </div>
        <span className="dashboard-hero-orb dashboard-hero-orb-one" aria-hidden="true" />
        <span className="dashboard-hero-orb dashboard-hero-orb-two" aria-hidden="true" />
      </section>

      {snapshot.failedSources.length > 0 && (
        <div className="dashboard-data-warning" role="status">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <span>Some dashboard data could not be loaded: {snapshot.failedSources.join(', ')}. Available metrics are still shown.</span>
          <button type="button" onClick={() => void loadDashboard()} disabled={loading}>Retry</button>
        </div>
      )}

      <div className="dashboard-section-heading">
        <div><span>AT A GLANCE</span><h2>{isAdmin ? 'Organization overview' : `${roleLabel} overview`}</h2></div>
        <small>{loading ? 'Updating figures…' : 'Figures from available module records'}</small>
      </div>

      {loading && !hasLiveData ? (
        <div className="dashboard-metric-grid" aria-label="Loading dashboard metrics">
          {Array.from({ length: 4 }, (_, index) => <div className="dashboard-metric-skeleton" key={index} />)}
        </div>
      ) : hasLiveData ? (
        <div className="dashboard-metric-grid">
          {snapshot.metrics.map((metric) => (
            <Link className={`dashboard-metric-card tone-${metric.tone}`} to={metric.route} key={metric.label}>
              <span className="dashboard-metric-icon"><i className={`bi ${metric.icon}`} aria-hidden="true" /></span>
              <span className="dashboard-metric-label">{metric.label}</span>
              <strong>{metric.format === 'currency' ? formatMoney(metric.value) : formatCount(metric.value)}</strong>
              <small>{metric.detail}</small>
              <i className="bi bi-arrow-up-right dashboard-metric-arrow" aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="dashboard-no-metrics">
          <i className="bi bi-grid-1x2" aria-hidden="true" />
          <strong>{loading ? 'Loading your overview' : 'Your workspace is ready'}</strong>
          <p>{loading ? 'Connecting to the modules available for this account.' : 'No live dashboard metrics are currently configured for this account. Your permitted modules are available below.'}</p>
        </div>
      )}

      {(snapshot.pipeline.length > 0 || snapshot.paymentModes.length > 0) && (
        <section className="dashboard-insights-grid">
          {snapshot.pipeline.length > 0 && (
            <article className="dashboard-panel">
              <div className="dashboard-panel-heading"><div><span>SALES ACTIVITY</span><h3>Pipeline snapshot</h3></div><span className="dashboard-panel-icon blue"><i className="bi bi-bar-chart-line" /></span></div>
              <div className="dashboard-bars">
                {snapshot.pipeline.map((item) => (
                  <div className="dashboard-bar-row" key={item.label}>
                    <div className="dashboard-bar-label"><span>{item.label}</span><strong>{formatCount(item.value)}</strong></div>
                    <div className="dashboard-bar-track"><span style={{ width: `${Math.max(item.value / chartMax * 100, item.value > 0 ? 2 : 0)}%` }} /></div>
                  </div>
                ))}
              </div>
              <p className="dashboard-panel-footnote">Based on loaded records, not forecasted values.</p>
            </article>
          )}
          {snapshot.paymentModes.length > 0 && (
            <article className="dashboard-panel">
              <div className="dashboard-panel-heading"><div><span>COLLECTIONS</span><h3>Payment modes</h3></div><span className="dashboard-panel-icon amber"><i className="bi bi-wallet2" /></span></div>
              <div className="dashboard-bars payment-bars">
                {snapshot.paymentModes.map((item) => (
                  <div className="dashboard-bar-row" key={item.label}>
                    <div className="dashboard-bar-label"><span>{item.label}</span><strong>{item.displayValue}</strong></div>
                    <div className="dashboard-bar-track"><span style={{ width: `${Math.max(item.value / paymentMax * 100, item.value > 0 ? 2 : 0)}%` }} /></div>
                  </div>
                ))}
              </div>
              <p className="dashboard-panel-footnote">Payment amount totals grouped by the recorded payment mode.</p>
            </article>
          )}
        </section>
      )}

      {snapshot.batches.length > 0 && (
        <section className="dashboard-panel dashboard-batches-panel">
          <div className="dashboard-panel-heading"><div><span>TRAINING WORKSPACE</span><h3>{isTrainer ? 'Your assigned batches' : 'Batch overview'}</h3></div><Link to={isTrainer ? '/main/trainer' : '/main/batch'}>View all <i className="bi bi-arrow-up-right" /></Link></div>
          <div className="dashboard-batch-list">
            {snapshot.batches.map((batch) => (
              <Link to={batch.route === '/main/trainer' ? `/main/trainer/batches/${batch.id}` : batch.route} className="dashboard-batch-row" key={batch.id}>
                <span className="dashboard-batch-icon"><i className="bi bi-collection" aria-hidden="true" /></span>
                <span className="dashboard-batch-copy"><strong>{batch.name}</strong><small>{batch.course}</small></span>
                <span className="dashboard-batch-count">{formatCount(batch.students)} students</span>
                <i className="bi bi-chevron-right dashboard-batch-arrow" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {snapshot.recentPayments.length > 0 && (
        <section className="dashboard-panel dashboard-recent-panel">
          <div className="dashboard-panel-heading"><div><span>RECENT ACTIVITY</span><h3>Latest payments</h3></div><Link to="/main/student-payments">Payment register <i className="bi bi-arrow-up-right" /></Link></div>
          <div className="dashboard-recent-list">
            {snapshot.recentPayments.map((payment) => (
              <div className="dashboard-recent-row" key={payment.id}>
                <span className="dashboard-recent-icon"><i className="bi bi-receipt" aria-hidden="true" /></span>
                <span className="dashboard-recent-copy"><strong>{payment.student}</strong><small>{payment.course} · {payment.mode} · {payment.date}</small></span>
                <strong className="dashboard-recent-amount">{formatMoney(payment.amount)}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="dashboard-quick-section">
        <div className="dashboard-section-heading">
          <div><span>WORKSPACE</span><h2>{isSuperUser ? 'Role-wise module access' : 'Quick access'}</h2></div>
          <small>{isSuperUser ? `${directoryRoles.length} roles in the system` : `${cards.length} permitted modules`}</small>
        </div>
        {isSuperUser ? (
          <div className="dashboard-role-groups">
            {directoryRolesLoading && directoryRoles.length === 0 ? (
              <div className="dashboard-role-empty" role="status">Loading roles from the role directory…</div>
            ) : directoryRolesError ? (
              <div className="dashboard-role-empty" role="alert">
                <span>{directoryRolesError}</span>
                <button type="button" onClick={retryRoleDirectory}>Retry</button>
              </div>
            ) : roleModuleGroups.length > 0 ? roleModuleGroups.map((group) => {
              const isExpanded = expandedRole === group.roleName;
              return (
                <article className={`dashboard-role-group${isExpanded ? ' is-expanded' : ''}`} key={group.roleId}>
                  <button
                    type="button"
                    className="dashboard-role-trigger"
                    onClick={() => setExpandedRole(isExpanded ? '' : group.roleName)}
                    aria-expanded={isExpanded}
                    aria-controls={`role-modules-${group.roleId}`}
                  >
                    <span className="dashboard-role-symbol"><i className="bi bi-person-badge-fill" aria-hidden="true" /></span>
                    <span className="dashboard-role-copy"><strong>{group.roleName}</strong><small>{group.modules.length} available modules</small></span>
                    <i className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'} dashboard-role-chevron`} aria-hidden="true" />
                  </button>
                  {isExpanded && (
                    <div className="dashboard-role-modules" id={`role-modules-${group.roleId}`}>
                      {group.modules.length > 0 ? group.modules.map((module) => (
                        <Link className="dashboard-quick-card" to={module.route} key={module.route}>
                          <span><i className={`bi ${module.icon}`} aria-hidden="true" /></span>
                          <div><strong>{module.title}</strong><small>{module.description}</small></div>
                          <i className="bi bi-arrow-up-right" aria-hidden="true" />
                        </Link>
                      )) : <p className="dashboard-empty">No module shortcuts are configured for this role.</p>}
                    </div>
                  )}
                </article>
              );
            }) : (
              <div className="dashboard-role-empty">No roles were returned by the role directory.</div>
            )}
          </div>
        ) : (
          <div className="dashboard-quick-grid">
            {cards.map((card) => (
              <Link className="dashboard-quick-card" to={card.route} key={card.route}>
                <span><i className={`bi ${card.icon}`} aria-hidden="true" /></span>
                <div><strong>{card.title}</strong><small>{card.description}</small></div>
                <i className="bi bi-arrow-up-right" aria-hidden="true" />
              </Link>
            ))}
            {cards.length === 0 && <p className="dashboard-empty">No modules are currently available for this account.</p>}
            {permissionService.hasPermission(PERMISSIONS.FUNCTION_MANAGEMENT_VIEW) && (
              <Link className="dashboard-quick-card dashboard-quick-settings" to="/main/function-management">
                <span><i className="bi bi-sliders2" aria-hidden="true" /></span>
                <div><strong>Function Management</strong><small>Configure permitted application modules.</small></div>
                <i className="bi bi-arrow-up-right" aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
