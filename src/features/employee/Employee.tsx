import RowActionsMenu from '@/components/RowActionsMenu';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getAllUsers, clearUsersCache } from '@/api/userApi';
import { employeeApi, type RegisterEmployeeRequest } from '@/api/employeeApi';
import { directoryApi, type BranchOption, type RoleOption } from '@/api/directoryApi';
import type { User } from '@/types/user';
import './Employee.css';

function normalizeUsers(value: any): User[] {
  let data = value;
  for (let depth = 0; depth < 5 && data && !Array.isArray(data); depth += 1) {
    data = data.data ?? data.result ?? data.items ?? data.records ?? data.value ?? data.$values;
  }
  if (!Array.isArray(data)) return [];
  return data.map((raw: any) => ({
    ...raw,
    id: raw?.id ?? raw?.userId ?? raw?.employeeId,
    employeeCode: raw?.employeeCode ?? raw?.employee_Code,
    userName: raw?.userName ?? raw?.username,
    employeeName: raw?.employeeName ?? raw?.employee_Name ?? raw?.name,
    emailAddress: raw?.emailAddress ?? raw?.email ?? raw?.emailId,
    mobileNumber: raw?.mobileNumber ?? raw?.mobile ?? raw?.phoneNumber,
    branchName: raw?.branchName ?? raw?.branch_Name,
    roleName: raw?.roleName ?? raw?.role_name,
    roles: Array.isArray(raw?.roles) ? raw.roles.map((role: any) =>
      typeof role === 'string' ? role : String(role?.roleName ?? role?.name ?? ''),
    ).filter(Boolean) : [],
  }));
}

export default function Employee() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [profile, setProfile] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<RegisterEmployeeRequest>({
    employeeName: '', emailAddress: '', mobileNumber: '', branchId: 0,
  });
  const [selectedRoleId, setSelectedRoleId] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    const [userResult, branchResult, roleResult] = await Promise.allSettled([
      getAllUsers(), directoryApi.getBranches(), directoryApi.getRoles(),
    ]);
    if (userResult.status === 'fulfilled') setUsers(normalizeUsers(userResult.value));
    else { setUsers([]); setError('Unable to load employee records. Please retry.'); }
    setBranches(branchResult.status === 'fulfilled' ? branchResult.value : []);
    setRoles(roleResult.status === 'fulfilled' ? roleResult.value : []);
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []);

  const branchOptions = useMemo(() => [...new Set(
    users.map((user) => user.branchName).filter((name): name is string => Boolean(name)),
  )].sort(), [users]);
  const roleOptions = useMemo(() => [...new Set(users.flatMap((user) =>
    user.roles?.length ? user.roles : [user.roleName || user.role || ''],
  ).filter(Boolean))].sort(), [users]);
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const userRoles = user.roles?.length ? user.roles : [user.roleName || user.role || ''];
      const textMatch = !term || [
        user.employeeName, user.employeeCode, user.emailAddress, user.mobileNumber,
        user.branchName, ...userRoles,
      ].some((value) => String(value ?? '').toLowerCase().includes(term));
      const branchMatch = !branchFilter || user.branchName === branchFilter;
      const roleMatch = !roleFilter || userRoles.some((role) => role.toLowerCase() === roleFilter.toLowerCase());
      const statusMatch = statusFilter === 'all' ||
        (statusFilter === 'active' && user.isActive === true) ||
        (statusFilter === 'inactive' && user.isActive === false);
      return textMatch && branchMatch && roleMatch && statusMatch;
    });
  }, [users, search, branchFilter, roleFilter, statusFilter]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const activePage = Math.min(page, totalPages);
  const visibleUsers = filteredUsers.slice((activePage - 1) * pageSize, activePage * pageSize);

  async function submitEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    setSuccess('');
    if (form.employeeName.trim().length < 2 ||
        !/^\\S+@\\S+\\.\\S+$/.test(form.emailAddress.trim()) ||
        !/^\\d{10}$/.test(form.mobileNumber) || form.branchId <= 0) {
      setFormError('Enter a valid name, email, 10-digit mobile number, and branch.');
      return;
    }
    setSaving(true);
    const request = {
      ...form,
      employeeName: form.employeeName.trim(),
      emailAddress: form.emailAddress.trim(),
      mobileNumber: form.mobileNumber.trim(),
    };
    try {
      const response = await employeeApi.register(request);
      if (selectedRoleId) {
        const data = response?.data?.data ?? response?.data ?? response?.result ?? response;
        let id = data?.id ?? data?.userId ?? data?.employeeId ?? data?.user?.id;
        if (id === undefined || id === null || String(id) === '') {
          clearUsersCache();
          const refreshedUsers = normalizeUsers(await getAllUsers());
          id = refreshedUsers.find((user) =>
            user.emailAddress?.trim().toLowerCase() === request.emailAddress.toLowerCase(),
          )?.id;
        }
        if (id === undefined || id === null || String(id) === '') {
          setFormError('Employee created, but the user ID could not be found to assign the selected role.');
          await loadData();
          return;
        }
        await directoryApi.assignRole(String(id), selectedRoleId);
      }
      clearUsersCache();
      setForm({ employeeName: '', emailAddress: '', mobileNumber: '', branchId: 0 });
      setSelectedRoleId('');
      setShowCreate(false);
      setSuccess('Employee account created successfully.');
      await loadData();
    } catch (requestError: any) {
      setFormError(requestError?.response?.data?.message || 'Unable to create the employee account.');
    } finally {
      setSaving(false);
    }
  }

  function openRoles(user: User) {
    if (user.id === undefined || user.id === null || String(user.id) === '') return;
    navigate(`/main/edit-user-roles/${encodeURIComponent(String(user.id))}`, {
      state: { userName: user.employeeName || '' },
    });
  }

  return (
    <section className="employee-page">
      <header className="employee-page-header">
        <div><h1>Employee Management</h1><p>Manage system employees</p></div>
        <button className="employee-primary-btn" type="button" onClick={() => {
          setFormError(''); setShowCreate(true);
        }}><i className="bi bi-person-plus" /> Add Employee</button>
      </header>
      {success && <div className="employee-alert success" role="status">{success}</div>}
      {error && <div className="employee-alert error" role="alert">{error}<button type="button" onClick={() => void loadData()}>Retry</button></div>}
      <div className="employee-filters">
        <input aria-label="Search employees" value={search} onChange={(event) => {
          setSearch(event.target.value); setPage(1);
        }} placeholder="Search name, ID, email, mobile..." />
        <select aria-label="Filter by branch" value={branchFilter} onChange={(event) => {
          setBranchFilter(event.target.value); setPage(1);
        }}><option value="">All Branches</option>{branchOptions.map((branch) => <option key={branch}>{branch}</option>)}</select>
        <select aria-label="Filter by role" value={roleFilter} onChange={(event) => {
          setRoleFilter(event.target.value); setPage(1);
        }}><option value="">All Roles</option>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select>
        <select aria-label="Filter by status" value={statusFilter} onChange={(event) => {
          setStatusFilter(event.target.value); setPage(1);
        }}><option value="all">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        <button className="employee-clear-btn" type="button" onClick={() => {
          setSearch(''); setBranchFilter(''); setRoleFilter(''); setStatusFilter('all'); setPage(1);
        }}>Clear</button>
      </div>
      <div className="employee-table-card">
        {loading ? <div className="employee-empty">Loading employees...</div> : <>
          <div className="employee-table-scroll"><table className="employee-table">
            <thead><tr><th>Employee Name</th><th>Employee ID</th><th>Email</th><th>Mobile</th><th>Branch</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {visibleUsers.map((user, index) => <tr key={String(user.id ?? user.emailAddress ?? index)}>
                <td className="employee-name">{user.employeeName || '-'}</td><td>{user.employeeCode || '-'}</td>
                <td>{user.emailAddress || '-'}</td><td>{user.mobileNumber || '-'}</td><td>{user.branchName || '-'}</td>
                <td>{user.roles?.join(', ') || user.roleName || user.role || '-'}</td>
                <td><span className={`employee-status ${user.isActive === true ? 'active' : 'inactive'}`}>{user.isActive === true ? 'Active' : 'Inactive'}</span></td>
                <td><RowActionsMenu label={`Actions for ${user.employeeName || 'employee'}`} actions={[
                  { label: 'View details', onSelect: () => setProfile(user) },
                  { label: 'Manage roles', onSelect: () => openRoles(user) },
                ]} /></td>
              </tr>)}
              {visibleUsers.length === 0 && <tr><td className="employee-no-results" colSpan={8}>No employees found.</td></tr>}
            </tbody>
          </table></div>
          <footer className="employee-table-footer">
            <span>Showing {filteredUsers.length ? (activePage - 1) * pageSize + 1 : 0}–{Math.min(activePage * pageSize, filteredUsers.length)} of {filteredUsers.length} employees</span>
            <div className="employee-pagination">
              <button type="button" disabled={activePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
              <span>Page {activePage} of {totalPages}</span>
              <button type="button" disabled={activePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</button>
            </div>
          </footer>
        </>}
      </div>

      {showCreate && createPortal(<div className="employee-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) setShowCreate(false);
      }}><section className="employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title">
        <header><div><h2 id="employee-modal-title">Register Employee</h2><p>Create a new system employee</p></div>
          <button type="button" aria-label="Close" disabled={saving} onClick={() => setShowCreate(false)}>×</button></header>
        <form onSubmit={submitEmployee}><div className="employee-modal-grid">
          <label>Employee Name *<input autoComplete="name" minLength={2} required value={form.employeeName}
            onChange={(event) => setForm({ ...form, employeeName: event.target.value })} /></label>
          <label>Email Address *<input type="email" autoComplete="email" required value={form.emailAddress}
            onChange={(event) => setForm({ ...form, emailAddress: event.target.value })} /></label>
          <label>Mobile Number *<input type="tel" inputMode="numeric" maxLength={10} pattern="\\d{10}" required value={form.mobileNumber}
            onChange={(event) => setForm({ ...form, mobileNumber: event.target.value.replace(/\\D/g, '').slice(0, 10) })} /></label>
          <label>Branch *<select required value={form.branchId} onChange={(event) => setForm({ ...form, branchId: Number(event.target.value) })}>
            <option value={0}>Select Branch</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
          </select></label>
          <label className="employee-full-field">Role (optional)<select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}>
            <option value="">Select Role (Optional)</option>{roles.map((role) => <option value={role.roleId} key={role.roleId}>{role.roleName}</option>)}
          </select></label>
        </div>
        {formError && <div className="employee-alert error" role="alert">{formError}</div>}
        <footer><button type="button" className="employee-secondary-btn" disabled={saving} onClick={() => setShowCreate(false)}>Cancel</button>
          <button className="employee-primary-btn" type="submit" disabled={saving}>{saving ? 'Registering...' : 'Register Employee'}</button></footer>
        </form>
      </section></div>, document.body)}

      {profile && createPortal(<div className="employee-modal-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setProfile(null);
      }}><section className="employee-modal employee-profile-modal" role="dialog" aria-modal="true" aria-labelledby="employee-profile-title">
        <header><div><h2 id="employee-profile-title">{profile.employeeName || 'Employee Profile'}</h2>
          <p>{profile.roleName || profile.role || 'No role'} · {profile.employeeCode || '-'}</p></div>
          <button type="button" aria-label="Close" onClick={() => setProfile(null)}>×</button></header>
        <div className="employee-profile-grid">
          {[
            ['Employee Name', profile.employeeName], ['Employee Code', profile.employeeCode],
            ['Email Address', profile.emailAddress], ['Mobile Number', profile.mobileNumber],
            ['Branch', profile.branchName], ['Primary Role', profile.roleName || profile.role],
            ['Assigned Roles', profile.roles?.join(', ')], ['Account Status', profile.isActive === true ? 'Active' : 'Inactive / Not specified'],
          ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || 'Not available'}</strong></div>)}
        </div>
        <footer><button type="button" className="employee-secondary-btn" onClick={() => setProfile(null)}>Close</button>
          <button type="button" className="employee-primary-btn" onClick={() => { const selected = profile; setProfile(null); openRoles(selected); }}>Edit Access</button></footer>
      </section></div>, document.body)}
    </section>
  );
}
