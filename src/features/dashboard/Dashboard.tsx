import { apiErrorMessage } from '@/core/http/errors';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/core/auth/hooks';
import { PERMISSIONS, permissionService, type Permission } from '@/core/services/permissionService';
import { leadApi, type LeadRecord } from '@/api/leadApi';
import { enquiryApi } from '@/api/enquiryApi';
import { courseApi } from '@/api/courseApi';
import { batchApi, batchStudentApi, batchScheduleApi } from '@/api/batchApi';
import { studentApi, trainerApi, type PaymentRow } from '@/api/studentApi';
import { preloadWorkspacePage } from '@/routes/homeLoaders';
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

type PaymentSummary = { count: number; total: number; modes: ChartItem[]; recent: RecentPayment[] };
type DashboardData = {
  leads?: { count: number; converted: number };
  enquiries?: number;
  leadFollowups?: number;
  courses?: number;
  batches?: { count: number; cards: BatchSummary[] };
  batchStudents?: number;
  schedules?: number;
  assignedBatches?: { count: number; cards: BatchSummary[]; studentCount?: number };
  students?: number;
  registrations?: number;
  payments?: PaymentSummary;
};

type DashboardLoad = {
  requestId: number;
  scope: string;
  data: DashboardData;
  loading: boolean;
  failedSources: string[];
  updatedAt: Date | null;
};

const initialLoad: DashboardLoad = {
  requestId: 0,
  scope: '',
  data: {},
  loading: true,
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

const moneyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const countFormatter = new Intl.NumberFormat('en-IN');
const formatMoney = (value: number): string => moneyFormatter.format(value);
const formatCount = (value: number): string => countFormatter.format(value);

const formatDate = (value: unknown): string => {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

function buildBatchSummary(rows: Record<string, unknown>[], limit: number, route: string): BatchSummary[] {
  const cards: BatchSummary[] = [];
  for (const row of rows) {
    const id = numberValue(field(row, 'batchId', 'batch_id', 'BatchId', 'id'));
    if (id <= 0) continue;

    cards.push({
      id,
      name: String(field(row, 'batchName', 'batch_name', 'name') ?? 'Unnamed batch'),
      course: String(field(row, 'courseName', 'course_name', 'course', 'topicName', 'topic_name') ?? 'Course not specified'),
      students: numberValue(field(row, 'studentCount', 'student_count', 'totalStudents')),
      route,
    });
    if (cards.length === limit) break;
  }
  return cards;
}

function summarizeLeads(rows: LeadRecord[]): NonNullable<DashboardData['leads']> {
  let count = 0;
  let converted = 0;
  for (const row of rows) {
    if (row.deletedAt) continue;
    count += 1;
    if (/convert/i.test(row.status || '')) converted += 1;
  }
  return { count, converted };
}

function summarizePayments(rows: PaymentRow[]): PaymentSummary {
  const modeTotals = new Map<string, number>();
  const latest: { row: PaymentRow; timestamp: number }[] = [];
  let count = 0;
  let total = 0;
  for (const row of rows) {
    if (isDeleted(row)) continue;
    const mode = String(row.paymentMode || 'Other').trim() || 'Other';
    const amount = numberValue(row.paymentAmount);
    count += 1;
    total += amount;
    modeTotals.set(mode, (modeTotals.get(mode) || 0) + amount);

    const timestamp = new Date(String(row.paymentDate || '')).getTime() || 0;
    if (latest.length < 5 || timestamp > latest[4].timestamp) {
      latest.push({ row, timestamp });
      latest.sort((a, b) => b.timestamp - a.timestamp);
      if (latest.length > 5) latest.pop();
    }
  }

  const modes = Array.from(modeTotals, ([label, amount]) => ({
    label,
    value: Number.isFinite(amount) ? amount : 0,
  }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((mode) => ({ ...mode, displayValue: formatMoney(mode.value) }));

  const recent = latest.map(({ row }) => ({
    id: row.paymentId,
    student: [row.studentName, row.lastName].filter(Boolean).join(' ') || 'Student',
    course: row.courseName || '—',
    mode: row.paymentMode || '—',
    date: formatDate(row.paymentDate),
    amount: numberValue(row.paymentAmount),
  }));

  return { count, total, modes, recent };
}

type DashboardRole = 'admin' | 'accountant' | 'trainer' | 'group leader' | 'counsellor' | 'developer';

function buildOverview(loaded: DashboardData, role: DashboardRole | undefined) {
  const metrics: Metric[] = [];
  const pipeline: ChartItem[] = [];
  let batches: BatchSummary[] = [];

  if (role === 'admin') {
    if (loaded.leads) {
      metrics.push({ label: 'Total Leads', value: loaded.leads.count, detail: 'Active lead records', icon: 'bi-person-lines-fill', tone: 'blue', route: '/main/lead' });
      pipeline.push({ label: 'Leads', value: loaded.leads.count });
    }
    if (loaded.enquiries !== undefined) {
      metrics.push({ label: 'Enquiries', value: loaded.enquiries, detail: 'Candidate enquiries', icon: 'bi-chat-square-text', tone: 'teal', route: '/main/enquiry' });
      pipeline.push({ label: 'Enquiries', value: loaded.enquiries });
      if (loaded.leads) pipeline.push({ label: 'Converted leads', value: loaded.leads.converted });
    }
    if (loaded.students !== undefined) {
      metrics.push({ label: 'Students', value: loaded.students, detail: 'Registered student profiles', icon: 'bi-mortarboard', tone: 'violet', route: '/main/student-registration' });
    }
    if (loaded.payments) {
      metrics.push({ label: 'Total Collected', value: loaded.payments.total, detail: `${formatCount(loaded.payments.count)} payment records`, icon: 'bi-wallet2', tone: 'amber', route: '/main/student-payments', format: 'currency' });
    }
    if (loaded.courses !== undefined) {
      metrics.push({ label: 'Courses', value: loaded.courses, detail: 'Available course records', icon: 'bi-journal-bookmark', tone: 'orange', route: '/main/course' });
    }
    if (loaded.batches) {
      metrics.push({ label: 'Batches', value: loaded.batches.count, detail: 'Training batches', icon: 'bi-calendar2-week', tone: 'slate', route: '/main/batch' });
      batches = loaded.batches.cards;
    }
  } else if (role === 'accountant') {
    if (loaded.students !== undefined) metrics.push({ label: 'Students', value: loaded.students, detail: 'Registered student profiles', icon: 'bi-mortarboard', tone: 'violet', route: '/main/student-registration' });
    if (loaded.registrations !== undefined) metrics.push({ label: 'Course Registrations', value: loaded.registrations, detail: 'Enrollment records', icon: 'bi-journal-check', tone: 'blue', route: '/main/student-registration' });
    if (loaded.payments) {
      metrics.push({ label: 'Payment Records', value: loaded.payments.count, detail: 'Transactions in the payment register', icon: 'bi-receipt', tone: 'teal', route: '/main/student-payments' });
      metrics.push({ label: 'Total Collected', value: loaded.payments.total, detail: 'Sum of loaded payment amounts', icon: 'bi-wallet2', tone: 'amber', route: '/main/student-payments', format: 'currency' });
    }
  } else if (role === 'trainer') {
    if (loaded.assignedBatches) {
      batches = loaded.assignedBatches.cards;
      metrics.push({ label: 'Assigned Batches', value: loaded.assignedBatches.count, detail: 'Batches returned for your trainer account', icon: 'bi-easel2', tone: 'blue', route: '/main/trainer' });
      if (loaded.assignedBatches.studentCount !== undefined) {
        metrics.push({ label: 'Assigned Students', value: loaded.assignedBatches.studentCount, detail: 'Sum of student counts supplied by the batch API', icon: 'bi-people', tone: 'teal', route: '/main/trainer' });
      }
    }
  } else if (role === 'group leader') {
    if (loaded.batches) {
      metrics.push({ label: 'Batches', value: loaded.batches.count, detail: 'Managed training batches', icon: 'bi-calendar2-week', tone: 'blue', route: '/main/batch' });
      batches = loaded.batches.cards;
    }
    if (loaded.batchStudents !== undefined) metrics.push({ label: 'Assigned Students', value: loaded.batchStudents, detail: 'Batch assignment records', icon: 'bi-people', tone: 'teal', route: '/main/batch' });
    if (loaded.schedules !== undefined) metrics.push({ label: 'Schedule Records', value: loaded.schedules, detail: 'Generated batch schedule entries', icon: 'bi-calendar-check', tone: 'violet', route: '/main/batch' });
  } else if (role === 'counsellor') {
    if (loaded.leads) {
      const { count, converted } = loaded.leads;
      metrics.push({ label: 'Total Leads', value: count, detail: 'Active lead records', icon: 'bi-person-lines-fill', tone: 'blue', route: '/main/lead' });
      metrics.push({ label: 'Lead Conversion', value: count ? Math.round(converted * 1000 / count) / 10 : 0, detail: `${converted} converted leads`, icon: 'bi-graph-up-arrow', tone: 'teal', route: '/main/lead' });
      pipeline.push({ label: 'Leads', value: count }, { label: 'Converted leads', value: converted });
    }
    if (loaded.enquiries !== undefined) {
      metrics.push({ label: 'Enquiries', value: loaded.enquiries, detail: 'Candidate enquiries', icon: 'bi-chat-square-text', tone: 'violet', route: '/main/enquiry' });
      pipeline.push({ label: 'Enquiries', value: loaded.enquiries });
    }
    if (loaded.leadFollowups !== undefined) metrics.push({ label: 'Follow-ups', value: loaded.leadFollowups, detail: 'Recorded lead follow-ups', icon: 'bi-calendar2-check', tone: 'amber', route: '/main/lead' });
  } else if (role === 'developer' && loaded.courses !== undefined) {
    metrics.push({ label: 'Courses', value: loaded.courses, detail: 'Available course records', icon: 'bi-journal-bookmark', tone: 'blue', route: '/main/course' });
  }

  return {
    metrics,
    pipeline,
    batches,
    paymentModes: loaded.payments?.modes ?? [],
    recentPayments: loaded.payments?.recent ?? [],
  };
}

export default function Dashboard() {
  const session = useSession();

  const roles = useMemo(
    () => session.roles.map((role) => role.trim().toLowerCase().replace(/[\s_-]+/g, '')),
    [session.roles],
  );
  const isAdmin = roles.includes('admin') || roles.includes('superuser');
  const isCounsellor = roles.some((role) => ['counsellor', 'counciler'].includes(role));
  const isAccountant = roles.includes('accountant');
  const isGroupLeader = roles.includes('groupleader');
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

  const dashboardRoles: [DashboardRole, boolean][] = [
    ['admin', isAdmin],
    ['accountant', isAccountant],
    ['trainer', isTrainer],
    ['group leader', isGroupLeader],
    ['counsellor', isCounsellor],
    ['developer', isDeveloper],
  ];
  const dashboardRole = dashboardRoles.find(([, enabled]) => enabled)?.[0];
  const scope = `${session.generation}:${dashboardRole ?? ''}`;
  const requestId = useRef(0);
  const [load, setLoad] = useState(initialLoad);
  const { data, failedSources, loading, updatedAt } = load.scope === scope ? load : initialLoad;
  const snapshot = useMemo(() => buildOverview(data, dashboardRole), [data, dashboardRole]);

  const loadDashboard = useCallback(async () => {
    const id = ++requestId.current;
    setLoad((current) => ({
      ...initialLoad,
      requestId: id,
      scope,
      data: current.scope === scope ? current.data : initialLoad.data,
      updatedAt: current.scope === scope ? current.updatedAt : null,
    }));

    const update = (apply: (current: DashboardLoad) => DashboardLoad) => {
      if (requestId.current !== id) return;
      setLoad((current) => current.requestId === id ? apply(current) : current);
    };
    const jobs: Promise<void>[] = [];
    const request = <Key extends keyof DashboardData>(
      key: Key,
      label: string,
      fetch: () => Promise<NonNullable<DashboardData[Key]>>,
    ) => {
      jobs.push((async () => {
        try {
          const result = await fetch();
          update((current) => ({ ...current, data: { ...current.data, [key]: result } }));
        } catch (error) {
          console.error(`Dashboard data load failed (${label}):`, error);
          update((current) => {
            const data = { ...current.data };
            delete data[key];
            return { ...current, data, failedSources: [...current.failedSources, apiErrorMessage(error, `Unable to load ${label}.`)] };
          });
        }
      })());
    };

    if (dashboardRole === 'admin' || dashboardRole === 'counsellor') {
      request('leads', 'leads', async () => summarizeLeads(await leadApi.getAll()));
      request('enquiries', 'enquiries', async () => (await enquiryApi.getAll()).filter((row) => !row.deletedAt).length);
    }
    if (dashboardRole === 'counsellor') {
      request('leadFollowups', 'lead follow-ups', async () => (await leadApi.getAllFollowups()).filter((row) => !row.deletedAt).length);
    }

    if (dashboardRole === 'admin' || dashboardRole === 'accountant') {
      request('students', 'students', async () => (await studentApi.getStudents()).length);
      request('payments', 'payments', async () => summarizePayments(await studentApi.getPayments()));
    }
    if (dashboardRole === 'accountant') {
      request('registrations', 'registrations', async () => (await studentApi.getRegistrations()).length);
    }

    if (dashboardRole === 'admin' || dashboardRole === 'group leader') {
      request('batches', 'batches', async () => {
        const rows = (await batchApi.getAll()).filter((row) => !isDeleted(row));
        return { count: rows.length, cards: buildBatchSummary(rows, dashboardRole === 'admin' ? 4 : 6, '/main/batch') };
      });
    }
    if (dashboardRole === 'group leader') {
      request('batchStudents', 'batch assignments', async () => (await batchStudentApi.getAll()).filter((row) => !isDeleted(row)).length);
      request('schedules', 'batch schedules', async () => (await batchScheduleApi.getAll()).filter((row) => !isDeleted(row)).length);
    }

    if (dashboardRole === 'admin' || dashboardRole === 'developer') {
      request('courses', 'courses', async () => (await courseApi.getAll()).filter((row) => !row.deletedAt).length);
    }
    if (dashboardRole === 'trainer') {
      request('assignedBatches', 'assigned batches', async () => {
        const rows = await trainerApi.getMyBatches();
        let studentCount: number | undefined;
        for (const row of rows) {
          const count = field(row, 'studentCount', 'student_count', 'totalStudents');
          if (count !== undefined) studentCount = (studentCount ?? 0) + numberValue(count);
        }
        return { count: rows.length, cards: buildBatchSummary(rows, 6, '/main/trainer'), studentCount };
      });
    }

    await Promise.all(jobs);
    const completedAt = new Date();
    update((current) => ({ ...current, loading: false, updatedAt: completedAt }));
  }, [dashboardRole, scope]);

  useEffect(() => {
    void loadDashboard();
    return () => { requestId.current += 1; };
  }, [loadDashboard]);

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
          <span className="dashboard-updated">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Overview'}</span>
          <button type="button" className="dashboard-refresh" onClick={() => void loadDashboard()} disabled={loading}>
            <i className={loading ? 'bi bi-arrow-repeat' : 'bi bi-arrow-clockwise'} aria-hidden="true" />
            {loading ? 'Refreshing' : 'Refresh data'}
          </button>
        </div>
        <span className="dashboard-hero-orb dashboard-hero-orb-one" aria-hidden="true" />
        <span className="dashboard-hero-orb dashboard-hero-orb-two" aria-hidden="true" />
      </section>

      {failedSources.length > 0 && (
        <div className="dashboard-data-warning" role="status">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <span>{[...new Set(failedSources)].join(' ')} Available metrics are still shown.</span>
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
            <Link className={`dashboard-metric-card tone-${metric.tone}`} to={metric.route} key={metric.label} onMouseEnter={() => preloadWorkspacePage(metric.route)} onFocus={() => preloadWorkspacePage(metric.route)}>
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
          <p>{loading ? 'Connecting to the modules available for this account.' : 'No live dashboard metrics are currently configured for this account. Your permitted modules are available in the sidebar.'}</p>
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

      {!roles.includes('superuser') && (
        <section className="dashboard-quick-section">
          <div className="dashboard-section-heading">
            <div><span>WORKSPACE</span><h2>Quick access</h2></div>
            <small>{cards.length} permitted modules</small>
          </div>
          <div className="dashboard-quick-grid">
            {cards.map((card) => (
              <Link className="dashboard-quick-card" to={card.route} key={card.route} onMouseEnter={() => preloadWorkspacePage(card.route)} onFocus={() => preloadWorkspacePage(card.route)}>
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
        </section>
      )}

    </main>
  );
}
