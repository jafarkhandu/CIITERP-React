import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import '@/layouts/MainLayout.css';
import './StudentPortal.css';

const sections = [
  { id: 'student-overview', title: 'Dashboard', icon: 'bi-grid-1x2-fill' },
  { id: 'student-profile', title: 'My Profile', icon: 'bi-person-vcard' },
  { id: 'student-course', title: 'My Courses', icon: 'bi-journal-bookmark-fill' },
  { id: 'student-batch', title: 'My Batches', icon: 'bi-calendar2-week' },
  { id: 'student-payments', title: 'Payments', icon: 'bi-wallet2' },
];

export default function StudentPortalPreview() {
  const [activeSection, setActiveSection] = useState('student-overview');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('ciit-sidebar-collapsed') === 'true');
  const [isDarkTheme, setIsDarkTheme] = useState(() => (localStorage.getItem('ciit-theme') || localStorage.getItem('theme')) === 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkTheme ? 'dark' : 'light');
  }, [isDarkTheme]);

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
  return (
    <div className={'cmp-main-layout ciit-app-shell ciit-student-public-shell' + (isSidebarCollapsed ? ' is-sidebar-collapsed' : '')}>
      <header className="ciit-topbar">
        <div className="ciit-topbar-left">
          <button type="button" className="ciit-shell-icon-button ciit-mobile-menu-button" onClick={() => setIsMobileSidebarOpen(true)} aria-label="Open navigation" aria-controls="ciit-student-sidebar" aria-expanded={isMobileSidebarOpen}><i className="bi bi-list" aria-hidden="true" /></button>
          <button type="button" className="ciit-shell-icon-button ciit-desktop-collapse-button" onClick={toggleSidebarCollapse} aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-controls="ciit-student-sidebar" aria-expanded={!isSidebarCollapsed} title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}><i className={"bi " + (isSidebarCollapsed ? "bi-layout-sidebar-inset" : "bi-layout-sidebar")} aria-hidden="true" /></button>
          <Link className="ciit-shell-brand" to="/login" aria-label="CIIT ERP login"><span className="ciit-brand-mark">C</span><span className="ciit-brand-copy"><strong>CIIT</strong><small>TRAINING INSTITUTE</small></span></Link>
          <div className="ciit-topbar-divider" aria-hidden="true" />
          <div className="ciit-topbar-heading"><span>STUDENT WORKSPACE</span><strong>Student Portal</strong></div>
        </div>
        <div className="ciit-topbar-actions">
          <label className="ciit-portal-topbar-picker"><span>Student</span><select disabled aria-label="Student selection requires login"><option>Sign in to select student</option></select></label>
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"} title={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}><i className={"bi " + (isDarkTheme ? "bi-moon-stars-fill" : "bi-sun-fill")} aria-hidden="true" /><span>{isDarkTheme ? "Dark" : "Light"}</span><span className={"theme-switch-track" + (isDarkTheme ? " is-dark" : "")} aria-hidden="true"><span /></span></button>
          <Link className="ciit-public-login-link" to="/login">ERP Login</Link>
        </div>
      </header>
      <div className={"ciit-shell-main" + (isMobileSidebarOpen ? " is-mobile-sidebar-open" : "")}>
        <button type="button" className="ciit-sidebar-backdrop" aria-label="Close navigation" tabIndex={isMobileSidebarOpen ? 0 : -1} onClick={() => setIsMobileSidebarOpen(false)} />
        <aside id="ciit-student-sidebar" className="ciit-shell-sidebar" aria-label="Student navigation">
          <div className="ciit-sidebar-user"><span className="ciit-sidebar-avatar">C</span><div className="ciit-sidebar-user-copy"><strong>Student Workspace</strong><small>CIIT Training Institute</small></div></div>
          <div className="ciit-sidebar-section-label">STUDENT MENU</div>
          <nav className="ciit-sidebar-nav" aria-label="Student sections"><ul className="ciit-sidebar-list">
            {sections.map(section => <li key={section.id}><a href={'#' + section.id} className={activeSection === section.id ? 'active-link' : ''} onClick={() => { setActiveSection(section.id); setIsMobileSidebarOpen(false); }}><i className={'bi ' + section.icon} aria-hidden="true" /><span className="ciit-menu-label">{section.title}</span><span className="ciit-menu-active-mark" aria-hidden="true" /></a></li>)}
          </ul></nav>
          <div className="ciit-sidebar-footer"><span className="ciit-sidebar-footer-mark"><i className="bi bi-mortarboard-fill" aria-hidden="true" /></span><span><strong>CIIT ERP</strong><small>Training Institute</small></span></div>
        </aside>
        <main className="ciit-workspace"><div className="ciit-content"><div className="ciit-page-transition"><div className="ciit-student-portal ciit-student-public-content">
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
        </div></div></div></main>
      </div>
    </div>
  );
}
