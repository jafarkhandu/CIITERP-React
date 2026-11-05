import RowActionsMenu from '@/components/RowActionsMenu';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PERMISSIONS, permissionService, type Permission } from '@/core/services/permissionService';
import { usePermissionVersion } from '@/core/auth/hooks';
import './FunctionManagement.css';

type FunctionRow = { id: Permission; module: string; name: string; description: string; custom?: boolean };
const descriptions: Record<string, string> = {
  DASHBOARD_VIEW: 'Access the ERP dashboard',
  USER_VIEW: 'View users and access profiles',
  USER_CREATE: 'Create system users',
  EMPLOYEE_VIEW: 'View employee records',
  EMPLOYEE_CREATE: 'Register employees',
  BRANCH_VIEW: 'View institute branches',
  ROLE_VIEW: 'View roles and access definitions',
  COURSE_VIEW: 'View training courses',
  COURSE_CREATE: 'Create training courses',
  LEAD_VIEW: 'View lead records',
  LEAD_CREATE: 'Create new leads',
  LEAD_FOLLOWUP: 'Open lead follow-up workflows',
  ENQUIRY_VIEW: 'View enquiry records',
  ENQUIRY_CREATE: 'Create enquiries',
  ENQUIRY_FOLLOWUP: 'Open enquiry follow-up workflows',
  REPORTS_VIEW: 'Access operational reports',
  FUNCTION_MANAGEMENT_VIEW: 'Control feature availability',
};

function moduleName(id: string): string {
  if (id.startsWith('USER_') || id.startsWith('EMPLOYEE_')) return 'Users & Employees';
  if (id.startsWith('BRANCH_')) return 'Branches';
  if (id.startsWith('ROLE_')) return 'Roles';
  if (id.startsWith('COURSE_')) return 'Courses';
  if (id.startsWith('LEAD_')) return 'Leads';
  if (id.startsWith('ENQUIRY_')) return 'Enquiries';
  if (id.startsWith('GROUP_LEADER_') || id.startsWith('TRAINER_')) return 'Training';
  if (id.startsWith('STUDENT_')) return 'Students';
  if (id.startsWith('REPORTS_')) return 'Reports';
  if (id.startsWith('FUNCTION_')) return 'Administration';
  return 'General';
}
function label(id: string): string {
  return id.split('_').map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(' ');
}

export default function FunctionManagement() {
  usePermissionVersion();
  const [customRows, setCustomRows] = useState<FunctionRow[]>([]);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [module, setModule] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const rows = useMemo<FunctionRow[]>(() => [
    ...Object.entries(PERMISSIONS).map(([key, value]) => ({
      id: value, module: moduleName(key), name: label(key),
      description: descriptions[key] || `Manage ${label(key).toLowerCase()} capability`,
    })),
    ...customRows,
  ], [customRows]);
  const modules = ['All', ...new Set(rows.map((row) => row.module))];
  const filtered = rows.filter((row) => {
    const term = search.trim().toLowerCase();
    const enabled = permissionService.isFunctionEnabled(row.id);
    return (moduleFilter === 'All' || row.module === moduleFilter) &&
      (statusFilter === 'All' || (statusFilter === 'Enabled' && enabled) || (statusFilter === 'Disabled' && !enabled)) &&
      (!term || `${row.name} ${row.id} ${row.description}`.toLowerCase().includes(term));
  });
  const enabledCount = rows.filter((row) => permissionService.isFunctionEnabled(row.id)).length;

  function saveCustom() {
    const normalizedId = id.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!name.trim() || !normalizedId || !module.trim()) {
      setFormError('Function name, ID, and module are required.'); return;
    }
    if (rows.some((row) => row.id === normalizedId)) {
      setFormError('This function ID already exists.'); return;
    }
    const custom: FunctionRow = {
      id: normalizedId as Permission, module: module.trim(), name: name.trim(),
      description: description.trim() || `Manage ${name.trim()} capability`, custom: true,
    };
    setCustomRows((current) => [...current, custom]);
    permissionService.setFunctionEnabled(custom.id, true);
    setShowForm(false); setName(''); setId(''); setModule(''); setDescription(''); setFormError('');
  }

  return <section className="fm-page">
    <header className="fm-header"><div><span>ADMINISTRATION</span><h1>Function Management</h1><p>Control ERP capabilities without changing business workflows.</p></div>
      <button className="fm-primary" type="button" onClick={() => { setFormError(''); setShowForm(true); }}>+ New Function</button>
    </header>
    <div className="fm-stats"><div><span>Total Functions</span><strong>{rows.length}</strong></div><div><span>Enabled</span><strong>{enabledCount}</strong></div><div><span>Disabled</span><strong>{rows.length - enabledCount}</strong></div><div><span>Modules</span><strong>{new Set(rows.map((row) => row.module)).size}</strong></div></div>
    <div className="fm-toolbar"><input aria-label="Search functions" placeholder="Search function, ID or description" value={search} onChange={(event) => setSearch(event.target.value)} />
      <select aria-label="Filter module" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>{modules.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="Filter status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All</option><option>Enabled</option><option>Disabled</option></select>
      <div><button type="button" onClick={() => permissionService.enableAll()}>Enable All</button><button type="button" onClick={() => permissionService.disableAll()}>Disable All</button><button type="button" onClick={() => permissionService.resetDefaults()}>Reset Defaults</button></div>
    </div>
    <div className="fm-notice"><strong>Safe feature control</strong><span>Feature availability is stored in this browser. Backend authorization must still be enforced by the server.</span></div>
    <div className="fm-table-card"><div className="fm-table-scroll"><table><thead><tr><th>Function</th><th>Module</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {filtered.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.id}</small><p>{row.description}</p></td><td>{row.module}</td><td><span className={`fm-status ${permissionService.isFunctionEnabled(row.id) ? 'enabled' : 'disabled'}`}>{permissionService.isFunctionEnabled(row.id) ? 'Enabled' : 'Disabled'}</span></td>
        <td><RowActionsMenu label={`Actions for ${row.name}`} actions={[
          { label: permissionService.isFunctionEnabled(row.id) ? 'Disable function' : 'Enable function', onSelect: () => permissionService.setFunctionEnabled(row.id, !permissionService.isFunctionEnabled(row.id)) },
          ...(row.custom ? [{ label: 'Remove function', danger: true, onSelect: () => setCustomRows((current) => current.filter((item) => item.id !== row.id)) }] : []),
        ]} /></td></tr>)}
      {filtered.length === 0 && <tr><td colSpan={4} className="fm-empty">No functions match your filters.</td></tr>}
    </tbody></table></div></div>
    {showForm && createPortal(<div className="fm-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}><section className="fm-modal" role="dialog" aria-modal="true" aria-labelledby="fm-modal-title">
      <header><h2 id="fm-modal-title">Create Function</h2><button type="button" aria-label="Close" onClick={() => setShowForm(false)}>×</button></header>
      <label>Function Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Function ID<input value={id} onChange={(event) => setId(event.target.value)} placeholder="Example: CUSTOM_EXPORT" /></label>
      <label>Module<input value={module} onChange={(event) => setModule(event.target.value)} /></label>
      <label>Description<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      {formError && <p className="fm-error" role="alert">{formError}</p>}
      <footer><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="fm-primary" type="button" onClick={saveCustom}>Create Function</button></footer>
    </section></div>, document.body)}
  </section>;
}
