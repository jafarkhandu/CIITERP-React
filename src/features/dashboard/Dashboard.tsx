import { Link } from 'react-router-dom';
import { usePermissionVersion, useSession } from '@/core/auth/hooks';
import { PERMISSIONS, permissionService, type Permission } from '@/core/services/permissionService';
import './Dashboard.css';

type DashboardCard = { title: string; description: string; route: string; icon: string; permission?: Permission; sales?: boolean; accounting?: boolean };

export default function Dashboard() {
  const session = useSession();
  usePermissionVersion();
  const roles = session.roles.map((role) => role.trim().toLowerCase());
  const salesRole = roles.some((role) => ['admin', 'super user', 'counsellor', 'counciler'].includes(role));
  const accountingRole = roles.some((role) => ['admin', 'super user', 'accountant'].includes(role));
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
  ].filter((card) => (!card.permission || permissionService.hasPermission(card.permission)) && (!card.sales || salesRole) && (!card.accounting || accountingRole));

  return <section className="dashboard-page">
    <header className="dashboard-header">
      <div><span>ERP OVERVIEW</span><h1>Welcome, {session.employeeName || 'User'}</h1><p>{session.roleName || session.roles[0] || 'User'} Dashboard</p></div>
      {permissionService.hasPermission(PERMISSIONS.FUNCTION_MANAGEMENT_VIEW) &&
        <Link className="dashboard-settings-link" to="/main/function-management"><i className="bi bi-sliders2" aria-hidden="true" />Function Management</Link>}
    </header>
    <div className="dashboard-grid">
      {cards.map((card) => <Link className="dashboard-card" to={card.route} key={card.route}>
        <span className="dashboard-card-icon"><i className={'bi ' + card.icon} aria-hidden="true" /></span><strong>{card.title}</strong><span>{card.description}</span><small>Open module <i className="bi bi-arrow-up-right" aria-hidden="true" /></small>
      </Link>)}
      {cards.length === 0 && <p className="dashboard-empty">No modules are currently available for this account.</p>}
    </div>
  </section>;
}
