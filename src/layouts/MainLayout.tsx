import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  { label: 'Dashboard', route: '/main/dashboard', icon: 'bi-grid-1x2-fill', permission: PERMISSIONS.DASHBOARD_VIEW },
  { label: 'Employee', route: '/main/user', icon: 'bi-people-fill', permission: PERMISSIONS.USER_VIEW, roles: ['Admin', 'Super User'] },
  { label: 'Lead', route: '/main/lead', icon: 'bi-person-lines-fill', permission: PERMISSIONS.LEAD_VIEW, roles: ['Super User', 'Admin', 'Counsellor'] },
  { label: 'Enquiry', route: '/main/enquiry', icon: 'bi-chat-square-text-fill', permission: PERMISSIONS.ENQUIRY_VIEW, roles: ['Super User', 'Admin', 'Counsellor'] },
  { label: 'Course', route: '/main/course', icon: 'bi-journal-bookmark-fill', permission: PERMISSIONS.COURSE_VIEW, roles: ['Super User', 'Admin', 'Counsellor'] },
  { label: 'Student Registration', route: '/main/student-registration', icon: 'bi-mortarboard-fill', roles: ['Accountant', 'Admin', 'Super User'] },
  { label: 'Student Payments', route: '/main/student-payments', icon: 'bi-wallet2', roles: ['Accountant', 'Admin', 'Super User'] },
  { label: 'Manage Batch', route: '/main/batch', icon: 'bi-calendar2-week-fill', roles: ['Super User', 'Admin', 'Group Leader'], permission: PERMISSIONS.GROUP_LEADER_BATCH_VIEW },
  { label: 'My Batches', route: '/main/trainer', icon: 'bi-easel2-fill', roles: ['Trainer'], permission: PERMISSIONS.TRAINER_BATCH_VIEW },
  { label: 'Reports', route: '/main/reports', icon: 'bi-graph-up-arrow', permission: PERMISSIONS.REPORTS_VIEW, roles: ['Admin', 'Super User'] },
  { label: 'Function Management', route: '/main/function-management', icon: 'bi-sliders2', permission: PERMISSIONS.FUNCTION_MANAGEMENT_VIEW, roles: ['Admin', 'Super User'] },
  { label: 'Settings', route: '/main/settings', icon: 'bi-gear-fill', roles: ['Admin', 'Super User'] },
];

function getPageTitle(pathname: string): string {
  const match = [...MENUS]
    .sort((a, b) => b.route.length - a.route.length)
    .find((menu) => pathname === menu.route || pathname.startsWith(menu.route + '/'));

  if (match) return match.label;
  if (pathname.startsWith('/main/profile')) return 'My Profile';
  if (pathname.startsWith('/main/change-password')) return 'Change Password';
  if (pathname.startsWith('/main/edit-user-roles')) return 'User Roles';
  if (pathname.startsWith('/main/enquiry')) return 'Enquiry';
  return 'Workspace';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
}

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  usePermissionVersion();

  const [isDarkTheme, setIsDarkTheme] = useState(
    () => (localStorage.getItem('ciit-theme') || localStorage.getItem('theme')) === 'dark',
  );
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => localStorage.getItem('ciit-sidebar-collapsed') === 'true',
  );
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Keep the existing theme keys and custom event contract.
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

  useEffect(() => {
    setIsMobileSidebarOpen(false);
    setShowProfileMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 992) setIsMobileSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Lock background scrolling while the mobile navigation drawer is open.
  useEffect(() => {
    if (!isMobileSidebarOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false);
        setShowProfileMenu(false);
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  // Refresh the current user's roles and permissions without changing the auth flow.
  useEffect(() => {
    const username = (userSession.username || localStorage.getItem('username') || '').trim();

    if (!userSession.currentUser && !username) {
      navigate('/login');
      return;
    }

    // Login already resolves and persists the current user. Avoid downloading the
    // complete users list again on every workspace mount when that session exists.
    if (userSession.currentUser) return;

    let cancelled = false;
    getAllUsers()
      .then((users) => {
        if (cancelled) return;
        const current = username ? findCurrentUser(users, username) : undefined;
        if (current) userSession.setUser(current);
      })
      .catch((error) => console.warn('User information API error:', error));

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const roleNames = [...new Set(session.roles.filter((role) => !!role?.trim()).map((role) => role.trim()))];
  const visibleMenus = MENUS.filter((menu) => {
    const roleAllowed = !menu.roles?.length || userSession.hasAnyRole(menu.roles);
    const permissionAllowed = !menu.permission || permissionService.hasPermission(menu.permission);
    return roleAllowed && permissionAllowed;
  });

  function toggleTheme() {
    const next = !isDarkTheme;
    localStorage.setItem('ciit-theme', next ? 'dark' : 'light');
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setIsDarkTheme(next);
  }

  function toggleSidebarCollapse() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem('ciit-sidebar-collapsed', String(next));
      return next;
    });
  }

  function goTo(path: string) {
    setShowProfileMenu(false);
    navigate(path);
  }

  const pageTitle = getPageTitle(location.pathname);
  const displayRole = roleNames.length > 0 ? roleNames.join(' · ') : 'User';

  return (
    <div className={'cmp-main-layout ciit-app-shell' + (isSidebarCollapsed ? ' is-sidebar-collapsed' : '')}>
      <header className="ciit-topbar">
        <div className="ciit-topbar-left">
          <button
            type="button"
            className="ciit-shell-icon-button ciit-mobile-menu-button"
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Open navigation"
            aria-controls="ciit-main-sidebar"
            aria-expanded={isMobileSidebarOpen}
          >
            <i className="bi bi-list" aria-hidden="true" />
          </button>

          <button
            type="button"
            className="ciit-shell-icon-button ciit-desktop-collapse-button"
            onClick={toggleSidebarCollapse}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-controls="ciit-main-sidebar"
            aria-expanded={!isSidebarCollapsed}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <i className={'bi ' + (isSidebarCollapsed ? 'bi-layout-sidebar-inset' : 'bi-layout-sidebar')} aria-hidden="true" />
          </button>

          <Link className="ciit-shell-brand" to="/main/dashboard" aria-label="CIIT ERP home">
            <span className="ciit-brand-mark">C</span>
            <span className="ciit-brand-copy">
              <strong>CIIT</strong>
              <small>TRAINING INSTITUTE</small>
            </span>
          </Link>

          <div className="ciit-topbar-divider" aria-hidden="true" />
          <div className="ciit-topbar-heading">
            <span>WORKSPACE</span>
            <strong>{pageTitle}</strong>
          </div>
        </div>

        <div className="ciit-topbar-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <i className={'bi ' + (isDarkTheme ? 'bi-moon-stars-fill' : 'bi-sun-fill')} aria-hidden="true" />
            <span>{isDarkTheme ? 'Dark' : 'Light'}</span>
            <span className={'theme-switch-track' + (isDarkTheme ? ' is-dark' : '')} aria-hidden="true"><span /></span>
          </button>

          <div className="profile-menu-wrap" ref={profileMenuRef}>
            <button
              type="button"
              className="profile-menu-trigger"
              onClick={() => setShowProfileMenu((current) => !current)}
              aria-expanded={showProfileMenu}
              aria-haspopup="menu"
            >
              <span className="top-profile-avatar">{getInitials(session.employeeName)}</span>
              <span className="top-profile-copy">
                <strong className="top-profile-name">{session.employeeName || 'User'}</strong>
                <small>{displayRole}</small>
              </span>
              <i className="bi bi-chevron-down profile-chevron" aria-hidden="true" />
            </button>

            {showProfileMenu && (
              <div className="profile-dropdown" role="menu" aria-label="Account menu">
                <button type="button" role="menuitem" onClick={() => goTo('/main/profile')}>
                  <i className="bi bi-person-circle" aria-hidden="true" /> Profile
                </button>
                <button type="button" role="menuitem" onClick={() => goTo('/main/change-password')}>
                  <i className="bi bi-shield-lock" aria-hidden="true" /> Change Password
                </button>
                <div className="profile-dropdown-divider" />
                <button type="button" role="menuitem" className="dropdown-logout" onClick={() => authService.logout()}>
                  <i className="bi bi-box-arrow-right" aria-hidden="true" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={'ciit-shell-main' + (isMobileSidebarOpen ? ' is-mobile-sidebar-open' : '')}>
        <button
          type="button"
          className="ciit-sidebar-backdrop"
          aria-label="Close navigation"
          tabIndex={isMobileSidebarOpen ? 0 : -1}
          onClick={() => setIsMobileSidebarOpen(false)}
        />

        <aside id="ciit-main-sidebar" className="ciit-shell-sidebar" aria-label="Main navigation">
          <div className="ciit-sidebar-user">
            <div className="ciit-sidebar-avatar">{getInitials(session.employeeName)}</div>
            <div className="ciit-sidebar-user-copy">
              <strong>{session.employeeName || 'Welcome'}</strong>
              <small>{displayRole}</small>
            </div>
          </div>

          <div className="ciit-sidebar-section-label">MAIN MENU</div>
          <nav className="ciit-sidebar-nav">
            <ul className="ciit-sidebar-list">
              {visibleMenus.map((menu) => (
                <li key={menu.route}>
                  <NavLink
                    to={menu.route}
                    end={menu.route === '/main/dashboard'}
                    aria-label={menu.label}
                    title={isSidebarCollapsed ? menu.label : undefined}
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className={({ isActive }) => (isActive ? 'active-link' : '')}
                  >
                    <i className={'bi ' + menu.icon} aria-hidden="true" />
                    <span className="ciit-menu-label">{menu.label}</span>
                    <span className="ciit-menu-active-mark" aria-hidden="true" />
                  </NavLink>
                </li>
              ))}
              {visibleMenus.length === 0 && (
                <li className="ciit-sidebar-empty">No modules are available for this account.</li>
              )}
            </ul>
          </nav>

          <div className="ciit-sidebar-footer">
            <span className="ciit-sidebar-footer-mark"><i className="bi bi-mortarboard-fill" aria-hidden="true" /></span>
            <span><strong>CIIT ERP</strong><small>Training Institute</small></span>
          </div>
        </aside>

        <main className="ciit-workspace">
          <div className="ciit-content">
            <div className="ciit-page-transition" key={location.pathname}>
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
