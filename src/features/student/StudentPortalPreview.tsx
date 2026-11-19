import { Link } from 'react-router-dom';
import './StudentPortal.css';

const student = {
  name: 'Demo Student',
  studentId: 'CIIT-DEMO-001',
  email: 'student@example.com',
  phone: 'Not available',
  branch: 'Demo Branch',
  course: 'Full Stack Development',
  batch: 'Demo Batch A',
  schedule: 'Monday – Friday',
  trainer: 'To be assigned',
};

export default function StudentPortalPreview() {
  return (
    <div className="sp-demo-shell">
      <header className="sp-demo-topbar">
        <div className="sp-demo-brand"><span className="sp-demo-logo">C</span><span><strong>CIIT</strong><small>TRAINING INSTITUTE</small></span></div>
        <span className="sp-demo-workspace">STUDENT WORKSPACE <strong>My Dashboard</strong></span>
        <div className="sp-demo-user"><span className="sp-demo-user-avatar">DS</span><span><strong>{student.name}</strong><small>Student · Demo</small></span></div>
      </header>
      <div className="sp-demo-layout">
        <aside className="sp-demo-sidebar" aria-label="Student navigation">
          <div className="sp-demo-side-profile"><span className="sp-demo-user-avatar">DS</span><div><strong>{student.name}</strong><small>{student.studentId}</small></div></div>
          <span className="sp-demo-side-label">STUDENT MENU</span>
          <nav aria-label="Dashboard sections">
            <a href="#student-overview" className="sp-demo-active">⌂ <span>Overview</span></a>
            <a href="#student-profile">♙ <span>My Profile</span></a>
            <a href="#student-course">▤ <span>My Course</span></a>
            <a href="#student-batch">▦ <span>My Batch</span></a>
            <a href="#student-payments">▣ <span>Payments & Attendance</span></a>
          </nav>
          <div className="sp-demo-sidebar-footer">CIIT ERP · Student Preview</div>
        </aside>
        <main id="student-overview" className="ciit-student-portal sp-public-preview">
      <header className="sp-heading">
        <div>
          <span className="sp-eyebrow">CIIT · STUDENT WORKSPACE</span>
          <h1>Student Portal</h1>
          <p>Explore the student dashboard interface.</p>
        </div>
        <Link className="sp-preview-link" to="/login">Back to login</Link>
      </header>
      <div className="sp-alert" role="status">
        Demonstration only. All information below is fictional. Real student records require authorized ERP access.
      </div>
      <section className="sp-panel sp-hero">
        <div className="sp-avatar" aria-hidden="true">DS</div>
        <div>
          <span className="sp-eyebrow">STUDENT PROFILE · DEMO</span>
          <h2>{student.name}</h2>
          <p>{student.studentId} · {student.branch}</p>
        </div>
      </section>
      <div className="sp-stats">
        <div className="sp-panel"><span>Enrolled courses</span><strong>1</strong></div>
        <div className="sp-panel"><span>Assigned batches</span><strong>1</strong></div>
        <div className="sp-panel"><span>Attendance</span><strong>—</strong></div>
        <div className="sp-panel"><span>Fees</span><strong>—</strong></div>
      </div>
      <div className="sp-columns">
        <section id="student-profile" className="sp-panel">
          <h2>Personal information</h2>
          <dl className="sp-details">
            <div><dt>Student ID</dt><dd>{student.studentId}</dd></div>
            <div><dt>Email</dt><dd>{student.email}</dd></div>
            <div><dt>Phone</dt><dd>{student.phone}</dd></div>
            <div><dt>Branch</dt><dd>{student.branch}</dd></div>
          </dl>
        </section>
        <section id="student-course" className="sp-panel">
          <h2>My course</h2>
          <article className="sp-entry"><h3>{student.course}</h3><p>Course status: Enrolled (demo)</p></article>
        </section>
        <section id="student-batch" className="sp-panel">
          <h2>My batch</h2>
          <article className="sp-entry"><h3>{student.batch}</h3><p>Schedule: {student.schedule}</p><p>Trainer: {student.trainer}</p></article>
        </section>
        <section id="student-payments" className="sp-panel">
          <h2>Payments and attendance</h2>
          <p className="sp-muted">Payment history and attendance will appear here when student login is integrated.</p>
        </section>
      </div>
        </main>
      </div>
    </div>
  );
}
