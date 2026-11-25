import { apiErrorMessage } from '@/core/http/errors';
import { useAutoDismissMessage } from '@/core/notifications/useAutoDismissMessage';
import { AutoDismissAlert } from '@/components/AutoDismissAlert';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { leadApi, type LeadFollowupRecord, type LeadRecord } from '@/api/leadApi';
import { userSession } from '@/core/auth/session';
import { useFollowupHistory } from '@/features/followup/useFollowupHistory';
import './Lead.css';
import './LeadFollowup.css';

function toLocalDateTime(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function toLocalDate(date = new Date()): string { return toLocalDateTime(date).slice(0, 10); }
function formatDate(value: string | Date, withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return withTime ? date.toLocaleString('en-GB') : date.toLocaleDateString('en-GB');
}

async function getAdditionalFollowups(leadId: number) {
  const rows = await leadApi.getAllFollowups();
  return rows.filter((item) => Number(item.leadId ?? (item as any).lead_id ?? 0) === leadId);
}

function mergeFollowups(scoped: LeadFollowupRecord[], additional: LeadFollowupRecord[], leadId: number) {
  const merged = new Map<number, LeadFollowupRecord>();
  [...scoped, ...additional].forEach((item) => {
    const raw = item as LeadFollowupRecord & Record<string, unknown>;
    const id = Number(raw.leadFollowupId ?? raw.lead_followup_id ?? raw.id ?? 0);
    if (id > 0) merged.set(id, {
      ...item, leadFollowupId: id, leadId: Number(raw.leadId ?? raw.lead_id ?? leadId),
      deletedAt: (raw.deletedAt ?? raw.deleted_at ?? ((raw.is_deleted ?? raw.isDeleted ?? raw.deleted) ? 'deleted' : null)) as string | null,
    });
  });
  return [...merged.values()].sort((a, b) => Number(a.leadFollowupId) - Number(b.leadFollowupId));
}

export default function LeadFollowup() {
  const { leadId = '' } = useParams();
  return <LeadFollowupPage key={leadId} leadId={Number(leadId)} />;
}

function LeadFollowupPage({ leadId }: { leadId: number }) {
  const navigate = useNavigate();
  const validLeadId = Number.isInteger(leadId) && leadId > 0;
  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [leadLoading, setLeadLoading] = useState(validLeadId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useAutoDismissMessage();
  const [expandedForm, setExpandedForm] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [historyRequested, setHistoryRequested] = useState(false);
  const history = useFollowupHistory(leadId, historyRequested, leadApi.getFollowups, getAdditionalFollowups, mergeFollowups);
  const [editingFollowupId, setEditingFollowupId] = useState(0);
  const [status, setStatus] = useState('');
  const [description, setDescription] = useState('');
  const [followupDate, setFollowupDate] = useState(toLocalDateTime());
  const [followupBy, setFollowupBy] = useState(userSession.employeeName || userSession.username || '');
  const [nextFollowupDate, setNextFollowupDate] = useState(toLocalDate());

  useEffect(() => {
    if (!validLeadId) return;
    let active = true;
    void leadApi.getById(leadId).then(
      (record) => { if (active) setLead(record); },
      () => { if (active) setError('Unable to load lead details.'); },
    ).finally(() => { if (active) setLeadLoading(false); });
    return () => { active = false; };
  }, [leadId, validLeadId]);

  async function editFollowup(item: LeadFollowupRecord) {
    const id = Number(item.leadFollowupId ?? 0);
    if (!id) { setError('Invalid follow-up ID.'); return; }
    setSaving(true); setError('');
    try {
      const raw = await leadApi.getFollowupById(id) as any;
      const record = raw?.data ?? raw?.result ?? raw;
      setEditingFollowupId(id);
      setFollowupDate(String(record.followUpDate ?? item.followUpDate ?? toLocalDateTime()).slice(0, 16));
      setFollowupBy(String(record.followUpBy ?? item.followUpBy ?? userSession.employeeName ?? userSession.username ?? ''));
      setStatus(String(record.status ?? item.status ?? ''));
      setDescription(String(record.description ?? item.description ?? ''));
      setNextFollowupDate(String(record.nextFollowupDate ?? item.nextFollowupDate ?? '').slice(0, 10));
      setExpandedForm(true);
    } catch (requestError: any) { setError(apiErrorMessage(requestError, 'Unable to load follow-up.')); }
    finally { setSaving(false); }
  }

  async function removeFollowup(item: LeadFollowupRecord) {
    const id = Number(item.leadFollowupId ?? 0);
    if (!id || !window.confirm('Delete this lead follow-up?')) return;
    setSaving(true); setError('');
    try { await leadApi.removeFollowup(id); history.refresh(); }
    catch (requestError: any) { setError(apiErrorMessage(requestError, 'Unable to delete follow-up.')); }
    finally { setSaving(false); }
  }
  async function restoreFollowup(item: LeadFollowupRecord) {
    const id = Number(item.leadFollowupId ?? 0);
    setSaving(true); setError('');
    try { await leadApi.restoreFollowup(id); history.refresh(); }
    catch (requestError: any) { setError(apiErrorMessage(requestError, 'Unable to restore follow-up.')); }
    finally { setSaving(false); }
  }

  async function saveFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!status || !description.trim()) { setError('Select a status and enter follow-up details.'); return; }
    if (!lead) { setError('Lead details are not available.'); return; }
    setSaving(true);
    const payload: LeadFollowupRecord = {
      leadFollowupId: editingFollowupId || 0, leadId, candidateName: lead.candidateName || '',
      followUpDate: new Date(followupDate),
      followUpBy: followupBy,
      description: description.trim(), status,
      nextFollowupDate: nextFollowupDate ? new Date(`${nextFollowupDate}T00:00:00`) : new Date(),
    };
    try {
      if (editingFollowupId) await leadApi.updateFollowup(editingFollowupId, payload);
      else await leadApi.createFollowup(payload);
      setDescription(''); setStatus(''); setEditingFollowupId(0);
      setFollowupDate(toLocalDateTime()); setFollowupBy(userSession.employeeName || userSession.username || ''); setNextFollowupDate(toLocalDate());
      history.refresh();
    } catch (requestError: any) {
      setError(apiErrorMessage(requestError, 'Unable to save follow-up.'));
    } finally { setSaving(false); }
  }

  return <section className="lead-page">
    <header className="lead-page-header"><div><h1>Lead Follow-up</h1><p>Manage lead communication and follow-up history</p></div>
      <button className="lead-secondary-btn" type="button" onClick={() => navigate('/main/lead')}>← Back to Leads</button>
    </header>
    {!validLeadId && <AutoDismissAlert className="lead-alert" message="Invalid lead ID." />}
    {error && <div className="lead-alert" role="alert">{error}</div>}
    <div className="lead-details-card">
      <div className="lead-section-heading"><div><h2>Lead Details</h2><p>Lead information</p></div><span>Lead #{leadId}</span></div>
      {leadLoading ? <p>Loading lead details...</p> : lead ? <div className="lead-details-grid">
        <div><span>Candidate Name</span><strong>{lead.candidateName || '--'}</strong></div>
        <div><span>Email Address</span><strong>{lead.emailAddress || '--'}</strong></div>
        <div><span>Mobile Number</span><strong>{lead.mobileNumber || '--'}</strong></div>
        <div><span>Training Type</span><strong>{lead.trainingType || '--'}</strong></div>
        <div><span>Lead Status</span><strong>{lead.status || '--'}</strong></div>
        <div><span>Lead Date</span><strong>{formatDate(lead.leadDate)}</strong></div>
      </div> : <p>Lead details unavailable.</p>}
    </div>
    <div className="lead-accordion-card">
      <button className="lead-accordion-header" type="button" aria-expanded={expandedForm} onClick={() => setExpandedForm((value) => !value)}>
        <span><strong>{editingFollowupId ? 'Edit Follow-up' : '＋ New Follow-up'}</strong><small>Record or update communication with this lead</small></span><b>{expandedForm ? '−' : '+'}</b>
      </button>
      {expandedForm && <form onSubmit={saveFollowup} className="lead-followup-form">
        <div className="lead-form-grid">
          <label>Follow-up Date<input type="datetime-local" value={followupDate} disabled={!editingFollowupId} onChange={(event) => setFollowupDate(event.target.value)} /></label>
          <label>Follow-up By<input required value={followupBy} disabled={!editingFollowupId} onChange={(event) => setFollowupBy(event.target.value)} /></label>
          <label>Status<select required value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Select Status</option><option>Hot</option><option>Warm</option><option>Cold</option></select></label>
          <label>Next Follow-up Date<input type="date" min={toLocalDate()} value={nextFollowupDate} onChange={(event) => setNextFollowupDate(event.target.value)} /></label>
          <label className="lead-full-field">Description<textarea required rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Enter follow-up details..." /></label>
        </div>
        <footer><button className="lead-secondary-btn" type="button" onClick={() => { setEditingFollowupId(0); setDescription(''); setStatus(''); setExpandedForm(false); }}>Cancel</button><button className="lead-primary-btn" type="submit" disabled={saving}>{saving ? 'Saving...' : editingFollowupId ? 'Update Follow-up' : 'Save Follow-up'}</button></footer>
      </form>}
    </div>
    <div className="lead-accordion-card">
      <button className="lead-accordion-header" type="button" disabled={!validLeadId} aria-expanded={expandedHistory} onClick={() => {
        setHistoryRequested(true);
        setExpandedHistory((value) => !value);
      }}>
        <span><strong>◷ Previous Lead Follow-ups</strong><small>View complete follow-up communication history</small></span><b>{expandedHistory ? '−' : '+'}</b>
      </button>
      {expandedHistory && <>
        {history.error != null && <AutoDismissAlert className="lead-alert" message="Unable to load follow-up history."><button type="button" onClick={history.refresh}>Retry</button></AutoDismissAlert>}
        {history.pending && history.rows.length > 0 && <p role="status">Loading remaining follow-ups…</p>}
        <div className="lead-table-scroll"><table className="lead-table">
        <thead><tr><th>#</th><th>Follow-up Date</th><th>Follow-up By</th><th>Status</th><th>Description</th><th>Next Follow-up</th><th>Actions</th></tr></thead>
        <tbody>{history.rows.map((item, index) => { const deleted = Boolean(item.deletedAt); return <tr key={item.leadFollowupId ?? index}><td>{index + 1}</td><td>{formatDate(item.followUpDate, true)}</td><td>{item.followUpBy}</td><td>{item.status}</td><td>{item.description}</td><td>{formatDate(item.nextFollowupDate)}</td><td><div className="d-flex align-items-center justify-content-center gap-2 flex-nowrap">{deleted ? <button className="lead-secondary-btn" type="button" disabled={saving} onClick={() => void restoreFollowup(item)}>Restore</button> : <><button className="lead-secondary-btn" type="button" disabled={saving} onClick={() => void editFollowup(item)}>Edit</button><button className="lead-secondary-btn" type="button" disabled={saving} onClick={() => void removeFollowup(item)}>Delete</button></>}</div></td></tr>; })}
          {history.rows.length === 0 && history.error == null && <tr><td colSpan={7} className="lead-empty">{history.pending ? 'Loading follow-ups...' : 'No previous follow-ups found.'}</td></tr>}
        </tbody>
      </table></div></>}
    </div>
  </section>;
}
