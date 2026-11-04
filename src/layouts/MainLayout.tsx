import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { findCurrentUser, getAllUsers } from '@/api/userApi';
import { usePermissionVersion, useSession } from '@/core/auth/hooks';
import { userSession } from '@/core/auth/session';
import { authService } from '@/core/auth/authService';
import { PERMISSIONS, permissionService, type Permission } from '@/core/services/permissionService';
import './MainLayout.css';

interface SidebarMenu {
  label: string;
  route: string;
  icon: string;
  permission?: Permission;
  roles?: string[];
}

const MENUS: SidebarMenu[] = [
  { label: 'Dashboard', route: '/main/dashboard', icon: '▣', permission: PERMISSIONS.DASHBOARD_VIEW },
  { label: 'Employee', route: '/main/user', icon: '♙', permission: PERMISSIONS.USER_VIEW, roles: ['Admin', 'Super User'] },
  { label: 'Lead', route: '/main/lead', icon: '◉', permission: PERMISSIONS.LEAD_VIEW, roles: ['Super User', 'Admin', 'Counsellor'] },
  { label: 'Enquiry', route: '/main/enquiry', icon: '✎', permission: PERMISSIONS.ENQUIRY_VIEW, roles: ['Super User', 'Admin', 'Counsellor'] },
  { label: 'Course', route: '/main/course', icon: '📚', permission: PERMISSIONS.COURSE_VIEW, roles: ['Super User', 'Admin', 'Counsellor'] },
  { label: 'Student Registration', route: '/main/student-registration', icon: '🎓', roles: ['Accountant', 'Admin', 'Super User'] },
  { label: 'Student Payments', route: '/main/student-payments', icon: '₹', roles: ['Accountant', 'Admin', 'Super User'] },
  { label: 'Manage Batch', route: '/main/batch', icon: '📅', roles: ['Super User', 'Admin', 'Group Leader'], permission: PERMISSIONS.GROUP_LEADER_BATCH_VIEW },
  { label: 'Batch', route: '/main/trainer', icon: '📘', roles: ['Trainer'], permission: PERMISSIONS.TRAINER_BATCH_VIEW },
  { label: 'Reports', route: '/main/reports', icon: '▤', permission: PERMISSIONS.REPORTS_VIEW, roles: ['Admin', 'Super User', 'Accountant'] },
];

export default function MainLayout() {
  const navigate = useNavigate();
  const session = useSession();
  usePermissionVersion();

  const [isDarkTheme, setIsDarkTheme] = useState(() => (localStorage.getItem('ciit-theme') || localStorage.getItem('theme')) === 'dark');
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // theme (same data-theme attribute + localStorage key as before)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkTheme ? 'dark' : 'light');
  }, [isDarkTheme]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<'light' | 'dark'>).detail;
      if (nextTheme === 'light' || nextTheme === 'dark') setIsDarkTheme(nextTheme === 'dark');
    };
    window.addEventListener('ciit-theme-change', handleThemeChange);
    return () => window.removeEventListener('ciit-theme-change', handleThemeChange);
  }, []);

  function toggleTheme() {
    const next = !isDarkTheme;
    localStorage.setItem('ciit-theme', next ? 'dark' : 'light');
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setIsDarkTheme(next);
  }

  // load / refresh the logged-in user's details (roles, name, permissions)
  useEffect(() => {
    const username = (userSession.username || localStorage.getItem('username') || '').trim();

    if (!userSession.currentUser && !username) {
      navigate('/login');
      return;
    }

    let cancelled = false;
    getAllUsers()
      .then((users) => {
        if (cancelled) return;
        const current = username ? findCurrentUser(users, username) : undefined;
        if (current) userSession.setUser(current);
      })
      .catch((e) => console.warn('User information API error:', e));

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const roleNames = [...new Set(session.roles.filter((r) => !!r?.trim()).map((r) => r.trim()))];

  const visibleMenus = MENUS.filter((menu) => {
    const roleAllowed = !menu.roles?.length || userSession.hasAnyRole(menu.roles);
    const permissionAllowed = !menu.permission || permissionService.hasPermission(menu.permission);
    return roleAllowed && permissionAllowed;
  });

  function goTo(path: string) {
    setShowProfileMenu(false);
    navigate(path);
  }

  return (
    <div className="ciit-host cmp-main-layout">
      {/* Header */}
      <nav className="navbar navbar-expand-lg ciit-navbar">
        <div className="container-fluid">
          {/* CIIT Brand */}
          <Link className="navbar-brand ciit-brand" to="/main/dashboard">
            <div className="ciit-brand-name">
              <span className="ciit-title">CIIT</span>
              <span className="ciit-logo-sub">Training Institute</span>
            </div>
          </Link>

          {/* Header Actions */}
          <div className="navbar-nav ms-auto ciit-nav-right">
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <i className={`bi ${isDarkTheme ? 'bi-moon-stars-fill' : 'bi-sun-fill'}`}></i>
              <span>{isDarkTheme ? 'Dark' : 'Light'}</span>
              <span className={`theme-switch-track${isDarkTheme ? ' is-dark' : ''}`}>
                <span></span>
              </span>
            </button>

            <div className="profile-menu-wrap">
              <button
                type="button"
                className="profile-menu-trigger"
                onClick={() => setShowProfileMenu((v) => !v)}
                aria-expanded={showProfileMenu}
              >
                <span className="top-profile-avatar">
                  <i className="bi bi-person-fill"></i>
                </span>
                <span className="top-profile-name">{session.employeeName || 'User'}</span>
                <i className="bi bi-chevron-down profile-chevron"></i>
              </button>

              {showProfileMenu && (
                <div className="profile-dropdown">
                  <button type="button" onClick={() => goTo('/main/profile')}>
                    <i className="bi bi-person-circle"></i> Profile
                  </button>
                  <button type="button" onClick={() => goTo('/main/change-password')}>
                    <i className="bi bi-lock"></i> Change Password
                  </button>
                  <div className="profile-dropdown-divider"></div>
                  <button type="button" className="dropdown-logout" onClick={() => authService.logout()}>
                    <i className="bi bi-box-arrow-right"></i> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Page */}
      <div className="ciit-page">
        <div className="row g-3">
          {/* Sidebar */}
          <div className="col-lg-2 col-md-3">
            <div className="ciit-sidebar">
              {/* User Profile */}
              <div className="sidebar-user-profile">
                <div className="profile-avatar">
                  <i className="bi bi-person-fill"></i>
                </div>

                <div className="profile-info">
                  <div className="profile-roles">
                    {roleNames.map((role) => (
                      <div className="profile-role" key={role}>
                        <i className="bi bi-shield-check"></i>
                        <span>{role}</span>
                      </div>
                    ))}

                    {roleNames.length === 0 && (
                      <div className="profile-role">
                        <i className="bi bi-shield-check"></i>
                        <span>User</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation Menu */}
              <ul className="list-group ciit-sidebar-list">
                {visibleMenus.map((menu) => (
                  <li className="list-group-item" key={menu.route}>
                    <NavLink to={menu.route} className={({ isActive }) => (isActive ? 'active-link' : '')}>
                      <span className="ciit-sidebar-icon">{menu.icon}</span>
                      <span className="ciit-menu-label">{menu.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Page Content */}
          <div className="col-lg-10 col-md-9">
            <div className="ciit-content">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
