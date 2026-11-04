import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { directoryApi, type RoleOption } from '@/api/directoryApi';
import './Employee.css';

export default function EditUserRoles() {
  const { userId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const userName = (location.state as { userName?: string } | null)?.userName || '';
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!userId) { setError('User ID not found.'); setLoading(false); return; }
      try {
        const [allRoles, currentRoles] = await Promise.all([
          directoryApi.getRoles(), directoryApi.getUserRoles(userId),
        ]);
        if (cancelled) return;
        setRoles(allRoles);
        const selectedIds = currentRoles.map((role: any) => {
          if (typeof role === 'string') {
            return allRoles.find((item) => item.roleName.toLowerCase() === role.toLowerCase())?.roleId;
          }
          const id = role?.roleId ?? role?.id;
          if (id !== undefined && id !== null) return String(id);
          const name = role?.roleName ?? role?.name;
          return name ? allRoles.find((item) => item.roleName.toLowerCase() === String(name).toLowerCase())?.roleId : undefined;
        }).filter((id): id is string => Boolean(id));
        setOriginal(selectedIds);
        setSelected(selectedIds);
      } catch (requestError: any) {
        if (!cancelled) setError(requestError?.response?.data?.message || 'Unable to load user roles.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  const visibleRoles = useMemo(
    () => roles.filter((role) => role.roleName.toLowerCase().includes(search.toLowerCase())),
    [roles, search],
  );
  const hasChanges = [...selected].sort().join('|') !== [...original].sort().join('|');

  function toggle(roleId: string) {
    setSelected((current) => current.includes(roleId)
      ? current.filter((id) => id !== roleId)
      : [...current, roleId]);
  }

  async function save() {
    if (saving || !hasChanges) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const additions = selected.filter((id) => !original.includes(id));
      const removals = original.filter((id) => !selected.includes(id));
      await Promise.all([
        ...additions.map((roleId) => directoryApi.assignRole(userId, roleId)),
        ...removals.map((roleId) => directoryApi.removeRole(userId, roleId)),
      ]);
      setOriginal([...selected]);
      setSuccess('Roles updated successfully.');
      window.setTimeout(() => navigate('/main/user'), 700);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Role update failed. Some changes may have saved; reload roles before retrying.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="employee-page">
    <header className="employee-page-header">
      <div><h1>Edit User Roles</h1><p>{userName || `User ID: ${userId}`}</p></div>
      <button className="employee-secondary-btn" type="button" onClick={() => navigate('/main/user')}>← Back</button>
    </header>
    {loading ? <div className="employee-table-card employee-empty">Loading roles...</div> : (
      <div className="employee-table-card employee-roles-card">
        {error && <div className="employee-alert error" role="alert">{error}</div>}
        {success && <div className="employee-alert success" role="status">{success}</div>}
        <div className="employee-roles-heading">
          <h2>Assign User Roles</h2>
          <input aria-label="Filter roles" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter roles by name" />
        </div>
        <div className="employee-role-list">
          {visibleRoles.map((role) => <label key={role.roleId}>
            <input type="checkbox" checked={selected.includes(role.roleId)} onChange={() => toggle(role.roleId)} />
            <span>{role.roleName}</span>
          </label>)}
          {visibleRoles.length === 0 && <p>No matching roles.</p>}
        </div>
        <div className="employee-selected-roles">
          <strong>Selected Roles ({selected.length})</strong>
          <div>{roles.filter((role) => selected.includes(role.roleId)).map((role) =>
            <span key={role.roleId}>{role.roleName}</span>)}
            {selected.length === 0 && <small>No roles selected</small>}
          </div>
        </div>
        <footer className="employee-role-footer">
          <button className="employee-secondary-btn" type="button" disabled={saving} onClick={() => navigate('/main/user')}>Cancel</button>
          <button className="employee-primary-btn" type="button" disabled={saving || !hasChanges} onClick={() => void save()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </footer>
      </div>
    )}
  </section>;
}
