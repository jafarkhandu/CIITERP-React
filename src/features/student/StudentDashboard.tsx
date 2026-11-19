import { Link } from 'react-router-dom';

type StudentRow = Record<string, unknown>;

interface StudentDashboardProps {
  studentRecordLoaded: boolean;
  loading: boolean;
  courseRows: StudentRow[];
  batchRows: StudentRow[];
  paymentRows: StudentRow[];
  totalPaid: number;
}

function field(row: StudentRow, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function detail(value: unknown): string {
  return value === null || value === undefined || value === '' ? 'Not available' : String(value);
}

function paymentDate(row: StudentRow): string | null {
  const value = field(row, 'paymentDate', 'payment_Date', 'payment_date', 'PaymentDate');
  if (typeof value !== 'string' || !value.trim()) return null;
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return iso ? iso[0] : value.trim();
}

function paymentDateOrder(row: StudentRow): number {
  const value = paymentDate(row);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const money = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);

const shortcuts = [
  { title: 'My Courses', description: 'Your registrations', path: '/student-portal/courses', icon: 'bi-book' },
  { title: 'My Batches', description: 'Batch information', path: '/student-portal/batches', icon: 'bi-calendar3' },
  { title: 'Payments', description: 'Payment history', path: '/student-portal/payments', icon: 'bi-wallet2' },
] as const;

export default function StudentDashboard({
  studentRecordLoaded,
  loading,
  courseRows,
  batchRows,
  paymentRows,
  totalPaid,
}: StudentDashboardProps) {
  const recentPayments = [...paymentRows]
    .sort((first, second) => paymentDateOrder(second) - paymentDateOrder(first))
    .slice(0, 3);

  const dataUnavailable = loading
    ? 'Loading your student information…'
    : studentRecordLoaded
      ? ''
      : 'Your student information is currently unavailable.';

  return (
    <div className="sp-section-page sp-dashboard">
      <div id="student-overview" className="sp-stats" aria-label="Student account summary">
        <div className="sp-panel"><span>Enrolled courses</span><strong>{studentRecordLoaded ? courseRows.length : '—'}</strong></div>
        <div className="sp-panel"><span>Assigned batches</span><strong>{studentRecordLoaded ? batchRows.length : '—'}</strong></div>
        <div className="sp-panel"><span>Recorded payments</span><strong>{studentRecordLoaded ? paymentRows.length : '—'}</strong></div>
        <div className="sp-panel"><span>Payment total</span><strong>{paymentRows.length ? money(totalPaid) : '—'}</strong></div>
      </div>

      <div className="sp-dashboard-grid">
        <section className="sp-panel sp-dashboard-panel" aria-labelledby="sp-dashboard-courses-title">
          <div className="sp-dashboard-panel-heading">
            <div>
              <h2 id="sp-dashboard-courses-title">My Courses</h2>
              <p>Your enrolled courses at a glance.</p>
            </div>
            <Link className="sp-dashboard-view-link" to="/student-portal/courses">View all <i className="bi bi-arrow-right" aria-hidden="true" /></Link>
          </div>
          {courseRows.length ? (
            <ul className="sp-dashboard-record-list">
              {courseRows.slice(0, 3).map((course, index) => (
                <li key={String(field(course, 'registrationId', 'registration_Id', 'registration_id') ?? index)}>
                  <span className="sp-dashboard-item-icon" aria-hidden="true"><i className="bi bi-book" /></span>
                  <div className="sp-dashboard-item-copy">
                    <strong>{detail(field(course, 'courseName', 'course_Name', 'course_name'))}</strong>
                    <small>Registration: {detail(field(course, 'registrationCode', 'registration_Code', 'registration_code'))}</small>
                    {field(course, 'currentStatus', 'current_Status', 'status') !== null && (
                      <small>Status: {detail(field(course, 'currentStatus', 'current_Status', 'status'))}</small>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="sp-dashboard-empty">{dataUnavailable || 'No registered courses are available in your student record.'}</p>}
          {courseRows.length > 3 && <p className="sp-dashboard-extra">Showing 3 of {courseRows.length} registered courses.</p>}
        </section>

        <section className="sp-panel sp-dashboard-panel" aria-labelledby="sp-dashboard-batches-title">
          <div className="sp-dashboard-panel-heading">
            <div>
              <h2 id="sp-dashboard-batches-title">My Batches</h2>
              <p>Batch information from your registration.</p>
            </div>
            <Link className="sp-dashboard-view-link" to="/student-portal/batches">View all <i className="bi bi-arrow-right" aria-hidden="true" /></Link>
          </div>
          {batchRows.length ? (
            <ul className="sp-dashboard-record-list">
              {batchRows.slice(0, 2).map((batch, index) => (
                <li key={String(field(batch, 'batchId', 'batch_Id', 'batch_id') ?? index)}>
                  <span className="sp-dashboard-item-icon" aria-hidden="true"><i className="bi bi-calendar3" /></span>
                  <div className="sp-dashboard-item-copy">
                    <strong>{detail(field(batch, 'batchName', 'batch_Name', 'batch_name'))}</strong>
                    {field(batch, 'batchTime', 'batch_Time', 'batch_time') !== null && (
                      <small>Time: {detail(field(batch, 'batchTime', 'batch_Time', 'batch_time'))}</small>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="sp-dashboard-empty sp-dashboard-empty-illustrated">
              <i className="bi bi-calendar2-week" aria-hidden="true" />
              <p>{dataUnavailable || 'No batch details are available in your student record yet.'}</p>
            </div>
          )}
        </section>

        <section className="sp-panel sp-dashboard-panel" aria-labelledby="sp-dashboard-payments-title">
          <div className="sp-dashboard-panel-heading">
            <div>
              <h2 id="sp-dashboard-payments-title">Recent Payments</h2>
              <p>Your latest recorded transactions.</p>
            </div>
            <Link className="sp-dashboard-view-link" to="/student-portal/payments">View all <i className="bi bi-arrow-right" aria-hidden="true" /></Link>
          </div>
          {recentPayments.length ? (
            <ul className="sp-dashboard-record-list">
              {recentPayments.map((payment, index) => {
                const amount = field(payment, 'paymentAmount', 'payment_Amount', 'payment_amount');
                const numericAmount = amount === null ? NaN : Number(amount);
                return (
                  <li key={String(field(payment, 'paymentId', 'payment_Id', 'payment_id') ?? index)}>
                    <span className="sp-dashboard-item-icon" aria-hidden="true"><i className="bi bi-receipt" /></span>
                    <div className="sp-dashboard-item-copy">
                      <strong>{paymentDate(payment) ?? 'Payment date not available'}</strong>
                      <small>{detail(field(payment, 'paymentMode', 'payment_Mode', 'payment_mode'))}</small>
                    </div>
                    <strong className="sp-dashboard-payment-amount">{Number.isFinite(numericAmount) ? money(numericAmount) : '—'}</strong>
                  </li>
                );
              })}
            </ul>
          ) : <p className="sp-dashboard-empty">{dataUnavailable || 'No payment records are available yet.'}</p>}
        </section>

        <section className="sp-panel sp-dashboard-panel" aria-labelledby="sp-dashboard-shortcuts-title">
          <div className="sp-dashboard-panel-heading">
            <div>
              <h2 id="sp-dashboard-shortcuts-title">Quick Access</h2>
              <p>Jump to your student records.</p>
            </div>
          </div>
          <div className="sp-dashboard-shortcuts">
            {shortcuts.map(shortcut => (
              <Link to={shortcut.path} className="sp-dashboard-shortcut" key={shortcut.path}>
                <span className="sp-dashboard-item-icon" aria-hidden="true"><i className={'bi ' + shortcut.icon} /></span>
                <span>
                  <strong>{shortcut.title}</strong>
                  <small>{shortcut.description}</small>
                </span>
                <i className="bi bi-chevron-right" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="sp-panel sp-dashboard-panel sp-dashboard-learning" aria-labelledby="sp-dashboard-learning-title">
        <div className="sp-dashboard-panel-heading">
          <div>
            <h2 id="sp-dashboard-learning-title">Learning Updates</h2>
            <p>Availability of learning tools for your student account.</p>
          </div>
        </div>
        <div className="sp-dashboard-learning-grid">
          <div className="sp-dashboard-learning-item">
            <i className="bi bi-clipboard2-check" aria-hidden="true" />
            <div><strong>Attendance</strong><p>A student-scoped attendance feed is not yet connected.</p></div>
          </div>
          <div className="sp-dashboard-learning-item">
            <i className="bi bi-clock-history" aria-hidden="true" />
            <div><strong>Upcoming Schedule</strong><p>Upcoming class dates are not available from the current student API.</p></div>
          </div>
          <div className="sp-dashboard-learning-item">
            <i className="bi bi-graph-up-arrow" aria-hidden="true" />
            <div><strong>Course Progress</strong><p>Completion percentages are not available from the current student API.</p></div>
          </div>
        </div>
      </section>
    </div>
  );
}
