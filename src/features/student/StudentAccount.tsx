import { Link, Navigate, useParams } from 'react-router-dom';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { authService } from '@/core/auth/authService';
import { useSession } from '@/core/auth/hooks';
import { readTokenIdentity } from '@/core/auth/tokenIdentity';
import { tokenService } from '@/core/services/tokenService';
import { studentApi } from '@/api/studentApi';
import { loadStudentPhoto, removeStudentPhoto, saveStudentPhoto } from './studentPhotoStorage';
import '@/layouts/MainLayout.css';
import './StudentPortal.css';

const sections = [
  { id: 'student-overview', slug: 'dashboard', path: '/student-portal', title: 'Dashboard', icon: 'bi-grid-1x2-fill' },
  { id: 'student-profile', slug: 'profile', path: '/student-portal/profile', title: 'My Profile', icon: 'bi-person-vcard' },
  { id: 'student-course', slug: 'courses', path: '/student-portal/courses', title: 'My Courses', icon: 'bi-journal-bookmark-fill' },
  { id: 'student-batch', slug: 'batches', path: '/student-portal/batches', title: 'My Batches', icon: 'bi-calendar2-week' },
  { id: 'student-payments', slug: 'payments', path: '/student-portal/payments', title: 'Payments', icon: 'bi-wallet2' },
] as const;

type StudentRecord = Record<string, unknown>;

function asRecord(value: unknown): StudentRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as StudentRecord : null;
}

function readField(row: StudentRecord | null, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function display(value: unknown): string {
  return value === null || value === undefined || value === '' ? 'Not available' : String(value);
}

function ownedRegistrationResponse(response: unknown, studentId: number): StudentRecord | null {
  const root = asRecord(response);
  const data = asRecord(readField(root, 'data', 'result', 'student', 'studentDetails')) ?? root;
  if (!data) return null;

  // Only render records explicitly linked to the student id in the JWT.
  const ownerId = Number(readField(data, 'studentId', 'student_Id', 'student_id', 'StudentId'));
  return ownerId === studentId ? data : null;
}

function nestedRows(row: StudentRecord | null, ...keys: string[]): StudentRecord[] {
  const entries = readField(row, ...keys);
  return Array.isArray(entries) ? entries.filter((item): item is StudentRecord => asRecord(item) !== null) : [];
}

const currency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export default function StudentAccount() {
  const session = useSession();
  const [identity] = useState(() => readTokenIdentity(tokenService.getAccessToken() ?? ''));
  // StudentLogin returns studentId in its response body, not necessarily in JWT claims.
  const studentId = identity.studentId ?? session.currentUser?.studentId ?? null;
  const [studentRecord, setStudentRecord] = useState<StudentRecord | null>(null);
  const [recordLoading, setRecordLoading] = useState(Boolean(studentId));
  const [recordError, setRecordError] = useState('');
  const { page } = useParams<{ page: string }>();
  const activeSection = sections.find(section => section.slug === (page ?? 'dashboard'))?.id;

  // Start each routed page at the top, even when navigating from a scrolled view.
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoRevision = useRef(0);

  useEffect(() => {
    let active = true;
    const revision = ++photoRevision.current;
    setProfilePhoto(null);
    setPhotoMessage('');

    if (studentId) {
      loadStudentPhoto(studentId)
        .then((photo) => {
          if (active && revision === photoRevision.current) setProfilePhoto(photo);
        })
        .catch(() => {
          // Photo storage may be blocked by the browser. Keep initials as fallback.
        });
    }

    return () => { active = false; };
  }, [studentId]);

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!studentId) {
      setPhotoMessage('Your account could not be identified. Please sign in again before choosing a photo.');
      event.target.value = '';
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setPhotoMessage('Choose a JPG, PNG or WebP image no larger than 2 MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;

      const photo = reader.result;
      const revision = ++photoRevision.current;
      setProfilePhoto(photo);
      setPhotoMessage('Saving photo in this browser…');

      saveStudentPhoto(studentId, photo)
        .then(() => {
          if (revision === photoRevision.current) {
            setPhotoMessage('Photo saved in this browser and displayed in the sidebar. It is not uploaded to the server.');
          }
        })
        .catch(() => {
          if (revision === photoRevision.current) {
            setPhotoMessage('Photo preview is visible, but this browser could not save it. It may disappear after refresh.');
          }
        });
    };
    reader.onerror = () => setPhotoMessage('Unable to read the selected image. Please try another file.');
    reader.readAsDataURL(file);
  }
  async function handleRemovePhoto() {
    if (!studentId || !profilePhoto) return;

    const revision = ++photoRevision.current;
    try {
      await removeStudentPhoto(studentId);
      if (revision !== photoRevision.current) return;
      setProfilePhoto(null);
      setPhotoMessage('Profile photo removed from this browser.');
      if (photoInputRef.current) photoInputRef.current.value = '';
    } catch {
      if (revision === photoRevision.current) {
        setPhotoMessage('Could not remove the photo. Please try again.');
      }
    }
  }

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('ciit-sidebar-collapsed') === 'true');
  const [isDarkTheme, setIsDarkTheme] = useState(() => (localStorage.getItem('ciit-theme') || localStorage.getItem('theme')) === 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkTheme ? 'dark' : 'light');
  }, [isDarkTheme]);

  useEffect(() => {
    if (!studentId) return;

    let active = true;
    studentApi.getRegistrationById(studentId)
      .then((response) => {
        if (!active) return;
        const record = ownedRegistrationResponse(response, studentId);
        if (!record) {
          setRecordError('Student registration details could not be matched to your signed-in account.');
          return;
        }
        setStudentRecord(record);
      })
      .catch(() => {
        if (active) setRecordError('Registration details are currently unavailable.');
      })
      .finally(() => {
        if (active) setRecordLoading(false);
      });

    return () => { active = false; };
  }, [studentId]);

  const studentName = display(
    readField(studentRecord, 'studentName', 'student_Name', 'name') ||
    identity.displayName || session.employeeName || session.username,
  );
  const qualifications = nestedRows(studentRecord, 'qualifications', 'Qualifications');
  const qualification = readField(
    studentRecord,
    'qualification',
    'qualificationName',
    'qualification_Name',
    'qualification_name',
    'Qualification',
    'QualificationName',
  ) ?? readField(qualifications[0] ?? null, 'qualification_Name', 'qualificationName', 'qualification_name', 'QualificationName');

  const studentCode = identity.username || session.username;
  const belongsToStudent = (row: StudentRecord): boolean => {
    const explicitId = readField(row, 'studentId', 'student_Id', 'student_id', 'StudentId');
    return explicitId === null || Number(explicitId) === studentId;
  };
  const registrations = nestedRows(studentRecord, 'registrations', 'Registrations')
    .filter(belongsToStudent);
  const courseRows = registrations.length ? registrations :
    studentRecord && (
      readField(studentRecord, 'registrationId', 'registration_Id') ||
      readField(studentRecord, 'courseName', 'course_Name')
    ) ? [studentRecord] : [];
  const paymentRows = [
    ...nestedRows(studentRecord, 'payments', 'Payments'),
    ...courseRows.flatMap((row) => nestedRows(row, 'payments', 'Payments')),
  ].filter(belongsToStudent);
  const batchRows = [
    ...nestedRows(studentRecord, 'batches', 'Batches'),
    ...courseRows.flatMap((row) => nestedRows(row, 'batches', 'Batches')),
  ].filter(belongsToStudent);
  const totalPaid = paymentRows.reduce((sum, row) =>
    sum + (Number(readField(row, 'paymentAmount', 'payment_Amount')) || 0), 0);

  function toggleTheme() {
    const next = !isDarkTheme;
    localStorage.setItem('ciit-theme', next ? 'dark' : 'light');
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setIsDarkTheme(next);
    window.dispatchEvent(new CustomEvent('ciit-theme-change', { detail: next ? 'dark' : 'light' }));
  }

  function toggleSidebarCollapse() {
    setIsSidebarCollapsed(current => {
      const next = !current;
      localStorage.setItem('ciit-sidebar-collapsed', String(next));
      return next;
    });
  }
  if (!activeSection) return <Navigate to="/student-portal" replace />;

  return (
    <div className={'cmp-main-layout ciit-app-shell ciit-student-public-shell' + (isSidebarCollapsed ? ' is-sidebar-collapsed' : '')}>
      <header className="ciit-topbar">
        <div className="ciit-topbar-left">
          <button type="button" className="ciit-shell-icon-button ciit-mobile-menu-button" onClick={() => setIsMobileSidebarOpen(true)} aria-label="Open navigation" aria-controls="ciit-student-sidebar" aria-expanded={isMobileSidebarOpen}><i className="bi bi-list" aria-hidden="true" /></button>
          <button type="button" className="ciit-shell-icon-button ciit-desktop-collapse-button" onClick={toggleSidebarCollapse} aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-controls="ciit-student-sidebar" aria-expanded={!isSidebarCollapsed} title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}><i className={"bi " + (isSidebarCollapsed ? "bi-layout-sidebar-inset" : "bi-layout-sidebar")} aria-hidden="true" /></button>
          <Link className="ciit-shell-brand" to="/student-portal" aria-label="Student Portal home"><span className="ciit-brand-mark">C</span><span className="ciit-brand-copy"><strong>CIIT</strong><small>TRAINING INSTITUTE</small></span></Link>
          <div className="ciit-topbar-divider" aria-hidden="true" />
          <div className="ciit-topbar-heading"><span>STUDENT WORKSPACE</span><strong>Student Portal</strong></div>
        </div>
        <div className="ciit-topbar-actions">
          <div className="ciit-student-identity" aria-label="Signed-in student">
            <span>Student</span>
            <strong>{studentCode || studentName}</strong>
          </div>
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"} title={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}><i className={"bi " + (isDarkTheme ? "bi-moon-stars-fill" : "bi-sun-fill")} aria-hidden="true" /><span>{isDarkTheme ? "Dark" : "Light"}</span><span className={"theme-switch-track" + (isDarkTheme ? " is-dark" : "")} aria-hidden="true"><span /></span></button>
          <button type="button" className="ciit-public-login-link" onClick={() => authService.logout()}>Sign out</button>
        </div>
      </header>
      <div className={"ciit-shell-main" + (isMobileSidebarOpen ? " is-mobile-sidebar-open" : "")}>
        <button type="button" className="ciit-sidebar-backdrop" aria-label="Close navigation" tabIndex={isMobileSidebarOpen ? 0 : -1} onClick={() => setIsMobileSidebarOpen(false)} />
        <aside id="ciit-student-sidebar" className="ciit-shell-sidebar" aria-label="Student navigation">
          <div className="ciit-sidebar-user">
            <span className="ciit-sidebar-avatar">{profilePhoto ? <img src={profilePhoto} alt="" className="sp-profile-avatar-image" /> : studentName.charAt(0).toUpperCase()}</span>
            <div className="ciit-sidebar-user-copy"><strong>{studentName}</strong><small>{studentCode || 'Student account'}</small></div>
          </div>
          <div className="ciit-sidebar-section-label">STUDENT MENU</div>
          <nav className="ciit-sidebar-nav" aria-label="Student sections"><ul className="ciit-sidebar-list">
            {sections.map(section => (
              <li key={section.id}>
                <Link to={section.path} className={activeSection === section.id ? 'active-link' : ''} aria-current={activeSection === section.id ? 'page' : undefined} onClick={() => setIsMobileSidebarOpen(false)}>
                  <i className={'bi ' + section.icon} aria-hidden="true" />
                  <span className="ciit-menu-label">{section.title}</span>
                  <span className="ciit-menu-active-mark" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul></nav>
          <div className="ciit-sidebar-footer"><span className="ciit-sidebar-footer-mark"><i className="bi bi-mortarboard-fill" aria-hidden="true" /></span><span><strong>CIIT ERP</strong><small>Training Institute</small></span></div>
        </aside>
        <main className="ciit-workspace"><div className="ciit-content"><div className="ciit-page-transition"><div className="ciit-student-portal ciit-student-public-content">

          {!studentId && <div className="sp-alert" role="status">
            Your login was successful, but a student ID was not provided by the authentication service.
            Student records cannot be safely linked without it.
          </div>}
          {recordLoading && <div className="sp-alert" role="status">Loading your registration information…</div>}
          {recordError && <div className="sp-alert" role="alert">{recordError}</div>}
          {activeSection === 'student-profile' && (
            <div className="sp-my-profile" id="student-profile">
              <header className="sp-heading"><div><span className="sp-eyebrow">STUDENT WORKSPACE</span><h1>My Profile</h1><p>View your account information and profile picture.</p></div></header>
              <section className="sp-panel sp-profile-glass" aria-labelledby="sp-profile-details-title">
                <div className="sp-my-profile-photo">
                  <div className="sp-my-profile-avatar">
                    {profilePhoto ? <img src={profilePhoto} alt="Your selected profile photo" /> : studentName.charAt(0).toUpperCase()}
                  </div>
                  <div className="sp-my-profile-identity">
                    <h2>{studentName}</h2>
                    <p>{studentCode || 'Student account'}</p>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sp-profile-file-input"
                      id="sp-profile-photo-input"
                      onChange={selectPhoto}
                      disabled={!studentId}
                    />
                    <label htmlFor="sp-profile-photo-input" className="sp-profile-upload-button">Choose profile photo</label>
                    {profilePhoto && (
                      <button type="button" className="btn btn-outline-danger btn-sm ms-2" onClick={() => void handleRemovePhoto()}>
                        Remove photo
                      </button>
                    )}
                    <p className="sp-muted">JPG, PNG or WebP · Max 2 MB · Saved on this browser only</p>
                    {photoMessage && <p role="status" className="sp-muted">{photoMessage}</p>}
                  </div>
                </div>
                <div className="sp-profile-divider" aria-hidden="true" />
                <h2 id="sp-profile-details-title" className="sp-profile-details-title">Personal Details</h2>
                <dl className="sp-details sp-profile-details">
                  <div><dt>Student code</dt><dd>{display(studentCode)}</dd></div>
                  <div><dt>Full name</dt><dd>{studentName}</dd></div>
                  <div><dt>Email</dt><dd>{display(readField(studentRecord, 'emailAddress', 'email_Address') || identity.email || session.email)}</dd></div>
                  <div><dt>Mobile number</dt><dd>{display(readField(studentRecord, 'mobileNumber', 'mobile_Number'))}</dd></div>
                  <div><dt>Qualification</dt><dd>{display(qualification)}</dd></div>
                  <div><dt>Branch</dt><dd>{display(readField(studentRecord, 'branchName', 'branch_Name'))}</dd></div>
                </dl>
              </section>
              <section className="sp-panel"><h2>Change Password</h2><p className="sp-muted">Student password changes are not yet available. The existing ERP change-password API belongs to staff accounts and cannot safely be used for student credentials.</p></section>
            </div>
          )}
          {activeSection === 'student-overview' && (
            <div className="sp-section-page">
              <header className="sp-heading">
                <div><span className="sp-eyebrow">CIIT · STUDENT WORKSPACE</span><h1>Dashboard</h1><p>Your learning and payment overview.</p></div>
                <span className="sp-preview">Student account</span>
              </header>
              <div className="sp-stats">
                <div className="sp-panel"><span>Enrolled courses</span><strong>{studentRecord ? courseRows.length : '—'}</strong></div>
                <div className="sp-panel"><span>Assigned batches</span><strong>{studentRecord ? batchRows.length : '—'}</strong></div>
                <div className="sp-panel"><span>Recorded payments</span><strong>{studentRecord ? paymentRows.length : '—'}</strong></div>
                <div className="sp-panel"><span>Payment total</span><strong>{paymentRows.length ? currency(totalPaid) : '—'}</strong></div>
              </div>
            </div>
          )}
          {activeSection === 'student-course' && (
            <div className="sp-section-page">
              <header className="sp-heading"><div><span className="sp-eyebrow">STUDENT WORKSPACE</span><h1>My Courses</h1><p>View your registered courses and enrollment status.</p></div></header>
              <section id="student-course" className="sp-panel">
              <h2>My courses</h2>
              {courseRows.length ? <div className="sp-stack">{courseRows.map((row, index) =>
                <article className="sp-entry" key={String(readField(row, 'registrationId', 'registration_Id') ?? index)}>
                  <h3>{display(readField(row, 'courseName', 'course_Name'))}</h3>
                  <p>Registration: {display(readField(row, 'registrationCode', 'registration_Code'))}</p>
                  <p>Status: {display(readField(row, 'currentStatus', 'current_Status', 'status'))}</p>
                </article>,
              )}</div> : <p className="sp-muted">No course records available from your student registration details.</p>}
            </section>
            </div>
          )}
          {activeSection === 'student-batch' && (
            <div className="sp-section-page">
              <header className="sp-heading"><div><span className="sp-eyebrow">STUDENT WORKSPACE</span><h1>My Batches</h1><p>View the batches assigned to your account.</p></div></header>
              <section id="student-batch" className="sp-panel">
              <h2>My batches</h2>
              {batchRows.length ? <div className="sp-stack">{batchRows.map((row, index) =>
                <article className="sp-entry" key={String(readField(row, 'batchId', 'batch_Id') ?? index)}>
                  <h3>{display(readField(row, 'batchName', 'batch_Name'))}</h3>
                  <p>Time: {display(readField(row, 'batchTime', 'batch_Time'))}</p>
                </article>,
              )}</div> : <p className="sp-muted">Batch information is not available from the student-scoped registration response.</p>}
            </section>
            </div>
          )}
          {activeSection === 'student-payments' && (
            <div className="sp-section-page">
              <header className="sp-heading"><div><span className="sp-eyebrow">STUDENT WORKSPACE</span><h1>Payments</h1><p>Review your recorded payments and available attendance information.</p></div></header>
              <section id="student-payments" className="sp-panel">
              <h2>Payments and attendance</h2>
              {paymentRows.length ? <div className="sp-stack">{paymentRows.map((row, index) =>
                <article className="sp-entry sp-payment" key={String(readField(row, 'paymentId', 'payment_Id') ?? index)}>
                  <div><h3>{display(readField(row, 'paymentDate', 'payment_Date'))}</h3>
                    <p>{display(readField(row, 'paymentMode', 'payment_Mode'))}</p></div>
                  <strong>{currency(Number(readField(row, 'paymentAmount', 'payment_Amount')) || 0)}</strong>
                </article>,
              )}</div> : <p className="sp-muted">No payment records available from your registration details.</p>}
              <p className="sp-muted">Attendance will appear when a student-scoped attendance API is available.</p>
            </section>
            </div>
          )}
        </div></div></div></main>
      </div>
    </div>
  );
}
