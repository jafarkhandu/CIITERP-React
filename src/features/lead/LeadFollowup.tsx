import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { leadApi, type LeadFollowupRecord, type LeadRecord } from '@/api/leadApi';
import { userSession } from '@/core/auth/session';
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

export default function LeadFollowup() {
  const { leadId: rawLeadId = '' } = useParams();
  const leadId = Number(rawLeadId);
  const navigate = useNavigate();
  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [followups, setFollowups] = useState<LeadFollowupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadLoading, setLeadLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedForm, setExpandedForm] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [status, setStatus] = useState('');
  const [description, setDescription] = useState('');
  const [followupDate] = useState(toLocalDateTime());
  const [nextFollowupDate, setNextFollowupDate] = useState(toLocalDate());

  async function loadLead() {
    setLeadLoading(true);
    try { setLead(await leadApi.getById(leadId)); }
    catch { setLead(null); setError('Unable to load lead details.'); }
    finally { setLeadLoading(false); }
  }
  async function loadFollowups() {
    setLoading(true);
    try {
      const items = await leadApi.getFollowups(leadId);
      setFollowups(items.sort((a, b) => Number(a.leadFollowupId || 0) - Number(b.leadFollowupId || 0)));
    } catch { setFollowups([]); setError('Unable to load follow-up history.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!Number.isInteger(leadId) || leadId <= 0) {
      setError('Invalid lead ID.'); setLeadLoading(false); setLoading(false); return;
    }
    void loadLead(); void loadFollowups();
  }, [leadId]);

  async function saveFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!status || !description.trim()) { setError('Select a status and enter follow-up details.'); return; }
    if (!lead) { setError('Lead details are not available.'); return; }
    setSaving(true);
    const payload: LeadFollowupRecord = {
      leadFollowupId: 0, leadId, candidateName: lead.candidateName || '',
      followUpDate: new Date(followupDate),
      followUpBy: userSession.employeeName || userSession.username || '',
      description: description.trim(), status,
      nextFollowupDate: nextFollowupDate ? new Date(`${nextFollowupDate}T00:00:00`) : new Date(),
    };
    try {
      await leadApi.createFollowup(payload);
      setDescription(''); setStatus('');
      await loadFollowups();
      navigate('/main/lead');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to save follow-up.');
    } finally { setSaving(false); }
  }

  return <section className="lead-page">
    <header className="lead-page-header"><div><h1>Lead Follow-up</h1><p>Manage lead communication and follow-up history</p></div>
      <button className="lead-secondary-btn" type="button" onClick={() => navigate('/main/lead')}>← Back to Leads</button>
    </header>
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
        <span><strong>＋ New Follow-up</strong><small>Record the latest communication with this lead</small></span><b>{expandedForm ? '−' : '+'}</b>
      </button>
      {expandedForm && <form onSubmit={saveFollowup} className="lead-followup-form">
        <div className="lead-form-grid">
          <label>Follow-up Date<input type="datetime-local" value={followupDate} disabled /></label>
          <label>Follow-up By<input value={userSession.employeeName || userSession.username || ''} disabled /></label>
          <label>Status<select required value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Select Status</option><option>Hot</option><option>Warm</option><option>Cold</option></select></label>
          <label>Next Follow-up Date<input type="date" min={toLocalDate()} value={nextFollowupDate} onChange={(event) => setNextFollowupDate(event.target.value)} /></label>
          <label className="lead-full-field">Description<textarea required rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Enter follow-up details..." /></label>
        </div>
        <footer><button className="lead-secondary-btn" type="button" onClick={() => navigate('/main/lead')}>Cancel</button><button className="lead-primary-btn" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Follow-up'}</button></footer>
      </form>}
    </div>
    <div className="lead-accordion-card">
      <button className="lead-accordion-header" type="button" aria-expanded={expandedHistory} onClick={() => setExpandedHistory((value) => !value)}>
        <span><strong>◷ Previous Lead Follow-ups</strong><small>View complete follow-up communication history</small></span><b>{expandedHistory ? '−' : '+'}</b>
      </button>
      {expandedHistory && <div className="lead-table-scroll"><table className="lead-table">
        <thead><tr><th>#</th><th>Follow-up Date</th><th>Follow-up By</th><th>Status</th><th>Description</th><th>Next Follow-up</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={6} className="lead-empty">Loading follow-ups...</td></tr> :
          followups.map((item, index) => <tr key={item.leadFollowupId ?? index}><td>{index + 1}</td><td>{formatDate(item.followUpDate, true)}</td><td>{item.followUpBy}</td><td>{item.status}</td><td>{item.description}</td><td>{formatDate(item.nextFollowupDate)}</td></tr>)}
          {!loading && followups.length === 0 && <tr><td colSpan={6} className="lead-empty">No previous follow-ups found.</td></tr>}
        </tbody>
      </table></div>}
    </div>
  </section>;
}
