import { Link } from 'react-router-dom';
import { usePermissionVersion, useSession } from '@/core/auth/hooks';
import { PERMISSIONS, permissionService } from '@/core/services/permissionService';
import './Dashboard.css';

export default function Dashboard() {
  const session = useSession();
  usePermissionVersion();
  const roles = session.roles.map((role) => role.trim().toLowerCase());
  const salesRole = roles.some((role) => ['admin', 'super user', 'counsellor', 'counciler'].includes(role));
  const cards = [
    { title: 'Employees', description: 'Manage system users and access.', route: '/main/user', permission: PERMISSIONS.USER_VIEW },
    { title: 'Leads', description: 'Manage leads and follow-ups.', route: '/main/lead', permission: PERMISSIONS.LEAD_VIEW, sales: true },
    { title: 'Enquiries', description: 'Manage candidate enquiries and follow-ups.', route: '/main/enquiry', permission: PERMISSIONS.ENQUIRY_VIEW, sales: true },
    { title: 'Courses', description: 'Manage training courses and fees.', route: '/main/course', permission: PERMISSIONS.COURSE_VIEW, sales: true },
    { title: 'Manage Batch', description: 'Manage batches, schedules, and attendance.', route: '/main/batch', permission: PERMISSIONS.GROUP_LEADER_BATCH_VIEW },
    { title: 'Trainer Batches', description: 'View assigned training batches.', route: '/main/trainer', permission: PERMISSIONS.TRAINER_BATCH_VIEW },
    { title: 'Reports', description: 'Review operational reports.', route: '/main/reports', permission: PERMISSIONS.REPORTS_VIEW },
  ].filter((card) => permissionService.hasPermission(card.permission) && (!card.sales || salesRole));

  return <section className="dashboard-page">
    <header className="dashboard-header">
      <div><span>ERP OVERVIEW</span><h1>Welcome, {session.employeeName || 'User'}</h1><p>{session.roleName || session.roles[0] || 'User'} Dashboard</p></div>
      {permissionService.hasPermission(PERMISSIONS.FUNCTION_MANAGEMENT_VIEW) &&
        <Link className="dashboard-settings-link" to="/main/function-management">⚙ Function Management</Link>}
    </header>
    <div className="dashboard-grid">
      {cards.map((card) => <Link className="dashboard-card" to={card.route} key={card.route}>
        <strong>{card.title}</strong><span>{card.description}</span><small>Open module →</small>
      </Link>)}
      {cards.length === 0 && <p className="dashboard-empty">No modules are currently available for this account.</p>}
    </div>
  </section>;
}
