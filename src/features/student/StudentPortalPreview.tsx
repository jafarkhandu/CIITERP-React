import { Link } from 'react-router-dom';
import './StudentPortal.css';

const sections = [
  { id: 'student-overview', title: 'Dashboard', icon: 'bi-grid-1x2-fill' },
  { id: 'student-profile', title: 'My Profile', icon: 'bi-person-vcard' },
  { id: 'student-course', title: 'My Courses', icon: 'bi-journal-bookmark-fill' },
  { id: 'student-batch', title: 'My Batches', icon: 'bi-calendar2-week' },
  { id: 'student-payments', title: 'Payments', icon: 'bi-wallet2' },
];

export default function StudentPortalPreview() {
  return (
    <div className="sp-demo-shell">
      <header className="sp-demo-topbar">
        <div className="sp-demo-brand"><span className="sp-demo-logo">C</span><span><strong>CIIT</strong><small>TRAINING INSTITUTE</small></span></div>
        <span className="sp-demo-workspace">STUDENT WORKSPACE <strong>Student Portal</strong></span>
        <div className="sp-demo-actions">
          <label htmlFor="student-public-selector" style={{ color: '#fff' }}>Student</label>
          <select id="student-public-selector" disabled aria-label="Student selection requires authentication">
            <option>Sign in to select student</option>
          </select>
        </div>
      </header>
      <div className="sp-demo-layout">
        <aside className="sp-demo-sidebar" aria-label="Student navigation">
          <div className="sp-demo-side-profile"><span className="sp-demo-user-avatar">C</span><span><strong>Student Workspace</strong><small>CIIT Training Institute</small></span></div>
          <span className="sp-demo-side-label">STUDENT MENU</span>
          <nav aria-label="Student sections">
            {sections.map(section => <a key={section.id} href={'#' + section.id}><i className={'bi ' + section.icon} aria-hidden="true" />{section.title}</a>)}
          </nav>
          <div className="sp-demo-sidebar-footer"><Link className="sp-preview-link" to="/login">Back to ERP login</Link></div>
        </aside>
        <main className="ciit-student-portal sp-public-preview">
          <header id="student-overview" className="sp-heading">
            <div><span className="sp-eyebrow">CIIT · STUDENT WORKSPACE</span><h1>Student Portal</h1><p>Student dashboard interface</p></div>
            <span className="sp-preview">Public interface · No records exposed</span>
          </header>
          <div className="sp-alert" role="status">Student records are protected. Sign in with an authorized ERP account to view registered students.</div>
          <section className="sp-panel sp-hero"><div className="sp-avatar" aria-hidden="true">C</div><div><span className="sp-eyebrow">STUDENT PROFILE</span><h2>Student information</h2><p>No student selected</p></div></section>
          <div className="sp-stats">
            <div className="sp-panel"><span>Enrolled courses</span><strong>—</strong></div>
            <div className="sp-panel"><span>Assigned batches</span><strong>—</strong></div>
            <div className="sp-panel"><span>Attendance</span><strong>—</strong></div>
            <div className="sp-panel"><span>Fees</span><strong>—</strong></div>
          </div>
          <div className="sp-columns">
            <section id="student-profile" className="sp-panel"><h2>Personal information</h2><p className="sp-muted">Available after authenticated student selection.</p></section>
            <section id="student-course" className="sp-panel"><h2>My courses</h2><p className="sp-muted">No course information available.</p></section>
            <section id="student-batch" className="sp-panel"><h2>My batches</h2><p className="sp-muted">No batch information available.</p></section>
            <section id="student-payments" className="sp-panel"><h2>Payments and attendance</h2><p className="sp-muted">Private student records require authentication.</p></section>
          </div>
        </main>
      </div>
    </div>
  );
}
