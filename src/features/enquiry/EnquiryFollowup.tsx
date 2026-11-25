import { useAutoDismissMessage } from '@/core/notifications/useAutoDismissMessage';
import { AutoDismissAlert } from '@/components/AutoDismissAlert';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { enquiryApi, type EnquiryRecord } from '@/api/enquiryApi';
import { enquiryFollowupApi, type EnquiryFollowupRecord } from '@/api/enquiryFollowupApi';
import { apiErrorMessage } from '@/core/http/errors';
import { useFollowupHistory } from '@/features/followup/useFollowupHistory';
import { getEnquiryLeadSources, useEnquiryOptions } from './useEnquiryOptions';
import './Enquiry.css';

function localDateTime(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function dateValue(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString('en-GB');
}
function idOf(record: Record<string, unknown>): number {
  return Number(record.followupId ?? record.followup_id ?? record.followUpId ?? record.FollowupId ?? record.enquiryFollowupId ?? record.enquiry_followup_id ?? record.id ?? 0);
}

async function getAdditionalFollowups(enquiryId: number) {
  const rows = await enquiryFollowupApi.getAll() as unknown as Record<string, unknown>[];
  return rows.filter((item) => Number(item.enquiryId ?? item.enquiry_id ?? 0) === enquiryId);
}

function mergeFollowups(scoped: Record<string, unknown>[], additional: Record<string, unknown>[], enquiryId: number) {
  const merged = new Map<number, Record<string, unknown>>();
  [...scoped, ...additional].forEach((record) => {
    const id = idOf(record);
    if (id > 0) merged.set(id, {
      ...record,
      followupId: id,
      enquiryId: Number(record.enquiryId ?? record.enquiry_id ?? enquiryId),
      deletedAt: record.deletedAt ?? record.deleted_at
        ?? ((record.is_deleted ?? record.isDeleted ?? record.deleted) ? 'deleted' : null),
    });
  });
  return [...merged.values()];
}

function newFollowupForm() {
  return {
    candidateName: '', sourceId: null as number | null, followUpDate: localDateTime(),
    followUpBy: '', description: '', status: 'Hot', nextFollowupDate: new Date().toISOString().slice(0, 10),
  };
}

export default function EnquiryFollowup() {
  const { enquiryId = '' } = useParams();
  return <EnquiryFollowupPage key={enquiryId} enquiryId={Number(enquiryId)} />;
}

function EnquiryFollowupPage({ enquiryId }: { enquiryId: number }) {
  const navigate = useNavigate();
  const validEnquiryId = Number.isInteger(enquiryId) && enquiryId > 0;
  const [enquiry, setEnquiry] = useState<EnquiryRecord | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(validEnquiryId);
  const [detailsError, setDetailsError] = useState('');
  const [detailsRevision, setDetailsRevision] = useState(0);
  const [sourcesRequested, setSourcesRequested] = useState(false);
  const { rows: sources, loading: sourcesLoading, error: sourcesError, errorMessage: sourcesErrorMessage, retry: retrySources } = useEnquiryOptions(getEnquiryLeadSources, sourcesRequested);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useAutoDismissMessage();
  const [editingId, setEditingId] = useState(0);
  const [newFollowupExpanded, setNewFollowupExpanded] = useState(false);
  const [previousFollowupsExpanded, setPreviousFollowupsExpanded] = useState(false);
  const [historyRequested, setHistoryRequested] = useState(false);
  const [form, setForm] = useState(newFollowupForm);
  const history = useFollowupHistory(enquiryId, historyRequested, enquiryFollowupApi.getByEnquiryId, getAdditionalFollowups, mergeFollowups);

  useEffect(() => {
    if (!validEnquiryId) return;
    let active = true;
    void enquiryApi.getById(enquiryId).then(
      (record) => { if (active) setEnquiry(record); },
      (cause) => { if (active) setDetailsError(apiErrorMessage(cause, 'Unable to load enquiry details.')); },
    ).finally(() => { if (active) setDetailsLoading(false); });
    return () => { active = false; };
  }, [enquiryId, validEnquiryId, detailsRevision]);

  const sourceNames = new Set(String(enquiry?.leadSources ?? '').split(',').map((name) => name.trim().toLowerCase()).filter(Boolean));
  const matchingSources = sources.filter((source) => sourceNames.has(source.sourceName.trim().toLowerCase()));
  const selectedSourceId = form.sourceId ?? (matchingSources.length === 1 ? Number(matchingSources[0].sourceId) : 0);

  function resetForm() {
    setEditingId(0);
    setForm(newFollowupForm());
  }

  async function edit(item: Record<string, unknown>) {
    const id = idOf(item);
    setSaving(true); setError('');
    setSourcesRequested(true);
    try {
      const raw = await enquiryFollowupApi.getById(id) as Record<string, unknown>;
      const record = (raw.data ?? raw.result ?? raw) as Record<string, unknown>;
      setEditingId(id);
      setForm({
        candidateName: String(record.candidateName ?? enquiry?.candidateName ?? ''),
        sourceId: Number(record.sourceId ?? record.source_Id ?? 0),
        followUpDate: String(record.followUpDate ?? localDateTime()).slice(0, 16),
        followUpBy: String(record.followUpBy ?? ''),
        description: String(record.description ?? ''),
        status: String(record.status ?? 'Hot'),
        nextFollowupDate: String(record.nextFollowupDate ?? '').slice(0, 10),
      });
      setNewFollowupExpanded(true);
    } catch (requestError: any) {
      setError(apiErrorMessage(requestError, 'Unable to load follow-up for editing.'));
    } finally { setSaving(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.description.trim() || !form.status) { setError('Status and description are required.'); return; }
    const selectedSource = sources.find((source) => Number(source.sourceId) === selectedSourceId);
    if (!selectedSource) { setError('Select a valid lead source before saving the enquiry follow-up.'); return; }
    setSaving(true); setError('');
    const payload: EnquiryFollowupRecord = {
      ...form,
      enquiryId,
      sourceId: selectedSource.sourceId,
      sourceName: selectedSource.sourceName,
      candidateName: String(enquiry?.candidateName ?? form.candidateName).trim(),
      followUpDate: new Date(form.followUpDate).toISOString(),
      nextFollowupDate: form.nextFollowupDate ? new Date(`${form.nextFollowupDate}T00:00:00`).toISOString() : form.followUpDate,
    };
    try {
      if (editingId) await enquiryFollowupApi.update(editingId, payload);
      else await enquiryFollowupApi.create(payload);
      resetForm();
      history.refresh();
    } catch (requestError: any) {
      const fallback = editingId ? 'Unable to update follow-up' : 'Unable to create follow-up';
      const status = requestError?.response?.status;
      setError(apiErrorMessage(requestError, `${fallback}${status ? ` (HTTP ${status})` : ''}.`));
    } finally { setSaving(false); }
  }

  async function remove(item: Record<string, unknown>) {
    const id = idOf(item);
    if (!id || !window.confirm(`Delete follow-up for ${String(item.candidateName ?? enquiry?.candidateName ?? 'candidate')}?`)) return;
    setSaving(true); setError('');
    try { await enquiryFollowupApi.remove(id); history.refresh(); }
    catch (requestError: any) { setError(apiErrorMessage(requestError, 'Unable to delete follow-up.')); }
    finally { setSaving(false); }
  }
  async function restore(item: Record<string, unknown>) {
    const id = idOf(item);
    setSaving(true); setError('');
    try { await enquiryFollowupApi.restore(id); history.refresh(); }
    catch (requestError: any) { setError(apiErrorMessage(requestError, 'Unable to restore follow-up.')); }
    finally { setSaving(false); }
  }

  const detail = enquiry as any;
  const detailRows = [
    ['Candidate Name', detail?.candidateName],
    ['Enquiry Date', dateValue(String(detail?.enquiryDate ?? detail?.enquiry_date ?? ''))],
    ['Gender', detail?.gender],
    ['Mobile Number', detail?.mobileNumber ?? detail?.mobile_number],
    ['Email Address', detail?.emailAddress ?? detail?.email_address],
    ['Qualification', detail?.qualificationName ?? detail?.qualification],
    ['Enquiry For', detail?.enquiryFors ?? detail?.enquiryFor ?? detail?.enquiry_fors],
    ['Lead Source', detail?.sourceName ?? detail?.leadSources ?? detail?.lead_sources],
    ['Interested Topics', detail?.interestedTopics ?? detail?.interested_topics],
    ['Branch', detail?.branchName ?? detail?.branch_name],
    ['Status', detail?.status],
    ['Local Address', detail?.localAddress ?? detail?.local_address],
  ];
  return <section className="enquiry-page enquiry-followup-page">
    <header className="enquiry-header">
      <div><h1>Enquiry Followup</h1><p>Manage enquiry followup details</p></div>
      <button className="enquiry-secondary-btn" type="button" onClick={() => navigate('/main/enquiry')}>← Back</button>
    </header>
    {!validEnquiryId && <AutoDismissAlert className="enquiry-alert" message="Invalid enquiry ID." />}
    {detailsError && <AutoDismissAlert className="enquiry-alert" message={detailsError}><button type="button" onClick={() => {
      setDetailsError('');
      setDetailsLoading(true);
      setDetailsRevision((revision) => revision + 1);
    }}>Retry</button></AutoDismissAlert>}
    {error && <div className="enquiry-alert" role="alert">{error}</div>}
    <section className="enquiry-followup-section enquiry-details-card">
      <div className="enquiry-followup-section-title">
        <div><h2>Enquiry Details</h2><p>Candidate enquiry information</p></div>
        <span className="enquiry-id-pill">Enquiry #{enquiryId}</span>
      </div>
      {detailsLoading ? <p role="status">Loading enquiry details...</p> : enquiry && <div className="enquiry-details-grid">
        {detailRows.map(([label, value]) => <div className="enquiry-detail-item" key={label}>
          <span>{label}</span><strong>{String(value ?? '').trim() || '-'}</strong>
        </div>)}
      </div>}
    </section>
    <section className="enquiry-followup-section enquiry-accordion-card">
      <button className="enquiry-accordion-header" type="button" disabled={!validEnquiryId} aria-expanded={newFollowupExpanded} onClick={() => {
        setSourcesRequested(true);
        setNewFollowupExpanded((value) => !value);
      }}>
        <div className="enquiry-accordion-title"><span className="enquiry-accordion-icon">+</span><div>
          <h3>{editingId ? 'Edit Followup' : 'New Followup'}</h3><p>{editingId ? 'Update followup details' : 'Add a new followup for this enquiry'}</p>
        </div></div><span className="enquiry-accordion-expand">{newFollowupExpanded ? '−' : '+'}</span>
      </button>
      {newFollowupExpanded && <div className="enquiry-accordion-content">
        {sourcesError && <AutoDismissAlert className="enquiry-alert" message={sourcesErrorMessage || 'Unable to load lead sources.'}><button type="button" onClick={retrySources}>Retry</button></AutoDismissAlert>}
        <form onSubmit={submit}>
          <div className="enquiry-followup-form-grid">
            <label>Candidate Name *<input required value={editingId ? form.candidateName : String(enquiry?.candidateName ?? '')} readOnly /></label>
            <label>Lead Source *<select required disabled={sourcesLoading || sourcesError} value={selectedSourceId || ''} onChange={(e) => {
              const sourceId = Number(e.target.value);
              setForm((previous) => ({ ...previous, sourceId }));
            }}>
              <option value="">{sourcesLoading ? 'Loading sources…' : 'Select Source'}</option>
              {sources.map((source) => <option key={source.sourceId} value={source.sourceId}>{source.sourceName}</option>)}
            </select></label>
            <label>Followup By *<input required value={form.followUpBy} onChange={(e) => setForm({ ...form, followUpBy: e.target.value })} /></label>
            <label>Followup Date *<input type="date" required value={form.followUpDate.slice(0,10)} onChange={(e) => setForm({ ...form, followUpDate: e.target.value + 'T' + (form.followUpDate.slice(11,16) || '09:00') })} /></label>
            <label>Status *<select required value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['Hot','Warm','Cold'].map((status) => <option key={status}>{status}</option>)}</select></label>
            <label>Next Followup Date *<input type="date" required value={form.nextFollowupDate} onChange={(e) => setForm({ ...form, nextFollowupDate: e.target.value })} /></label>
            <label className="enquiry-followup-description">Description *<textarea required rows={5} placeholder="Enter followup description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </div>
          <footer className="enquiry-followup-form-actions">
            {editingId > 0 && <button className="enquiry-secondary-btn" type="button" disabled={saving} onClick={resetForm}>Cancel Edit</button>}
            <button className="enquiry-primary-btn" type="submit" disabled={saving || !enquiry || sourcesLoading || sourcesError}>{saving ? 'Saving...' : editingId ? 'Update Followup' : 'Save Followup'}</button>
          </footer>
        </form>
      </div>}
    </section>
    <section className="enquiry-followup-section enquiry-accordion-card">
      <button className="enquiry-accordion-header" type="button" disabled={!validEnquiryId} aria-expanded={previousFollowupsExpanded} onClick={() => {
        setHistoryRequested(true);
        setPreviousFollowupsExpanded((value) => !value);
      }}>
        <div className="enquiry-accordion-title"><span className="enquiry-accordion-icon enquiry-history-icon">◷</span><div>
          <h3>Previous Followups</h3><p>Followup history for this enquiry</p>
        </div></div><span className="enquiry-accordion-expand">{previousFollowupsExpanded ? '−' : '+'}</span>
      </button>
      {previousFollowupsExpanded && <div className="enquiry-accordion-content">
        {history.error != null && <AutoDismissAlert className="enquiry-alert" message={apiErrorMessage(history.error, 'Unable to load enquiry follow-ups.')}><button type="button" onClick={history.refresh}>Retry</button></AutoDismissAlert>}
        {history.pending && history.rows.length > 0 && <p role="status">Loading remaining follow-ups…</p>}
        <div className="enquiry-table-scroll"><table className="enquiry-table">
          <thead><tr><th>ID</th><th>Followup Date</th><th>Followup By</th><th>Status</th><th>Next Date</th><th>Description</th><th>Actions</th></tr></thead>
          <tbody>{history.rows.map((item, index) => {
            const deleted = Boolean(item.deletedAt ?? item.deleted_at);
            return <tr key={idOf(item) || index}><td>{idOf(item)}</td><td>{dateValue(String(item.followUpDate ?? item.follow_up_date ?? item.followupDate ?? ''))}</td>
              <td>{String(item.followUpBy ?? item.follow_up_by ?? item.followupBy ?? '-')}</td><td>{String(item.status ?? '-')}</td>
              <td>{dateValue(String(item.nextFollowupDate ?? item.next_followup_date ?? ''))}</td><td>{String(item.description ?? '-')}</td>
              <td><div className="enquiry-actions">{deleted ? <button type="button" disabled={saving} onClick={() => void restore(item)}>Restore</button> : <>
                <button type="button" disabled={saving} onClick={() => void edit(item)}>Edit</button><button type="button" disabled={saving} onClick={() => void remove(item)}>Delete</button>
              </>}</div></td></tr>;
          })}{history.rows.length === 0 && history.error == null && <tr><td colSpan={7} className="enquiry-empty">{history.pending ? 'Loading follow-ups...' : 'No follow-ups found.'}</td></tr>}</tbody>
        </table></div>
      </div>}
    </section>
  </section>;
}
