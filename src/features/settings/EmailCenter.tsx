import { useEffect, useState, type FormEvent } from 'react';
import { emailApi, type EmailLog, type EmailQueueItem, type EmailTemplate, type SmtpSettings } from '@/api/emailApi';
import './EmailCenter.css';

const blankSmtp: SmtpSettings = { provider: 'SMTP', host: '', port: 587, username: '', fromEmail: '', fromName: 'CIIT ERP', useTls: true, password: '' };
const blankTemplate: EmailTemplate = { key: 'welcome', name: 'Welcome Email', subject: '', body: '', enabled: true };
const asRows = <T,>(value: unknown): T[] => Array.isArray(value) ? value : Array.isArray((value as any)?.data) ? (value as any).data : Array.isArray((value as any)?.items) ? (value as any).items : [];

export default function EmailCenter() {
  const [tab, setTab] = useState<'smtp' | 'templates' | 'logs' | 'queue'>('smtp');
  const [smtp, setSmtp] = useState<SmtpSettings>(blankSmtp);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [queue, setQueue] = useState<EmailQueueItem[]>([]);
  const [template, setTemplate] = useState<EmailTemplate>(blankTemplate);
  const [testRecipient, setTestRecipient] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true); setError('');
    const results = await Promise.allSettled([emailApi.getSmtpSettings(), emailApi.getTemplates(), emailApi.getLogs(), emailApi.getQueue()]);
    if (results[0].status === 'fulfilled') setSmtp({ ...blankSmtp, ...results[0].value, password: '' });
    if (results[1].status === 'fulfilled') setTemplates(asRows<EmailTemplate>(results[1].value));
    if (results[2].status === 'fulfilled') setLogs(asRows<EmailLog>(results[2].value));
    if (results[3].status === 'fulfilled') setQueue(asRows<EmailQueueItem>(results[3].value));
    if (results.every((r) => r.status === 'rejected')) setError('Email API endpoints are not available yet. Backend email service must expose the integration routes.');
    else if (results.some((r) => r.status === 'rejected')) setError('Some email service data could not be loaded. Check backend email API availability.');
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);

  async function saveSmtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try { await emailApi.saveSmtpSettings(smtp); setSmtp((current) => ({ ...current, password: '' })); setMessage('Email provider settings saved. Secret value cleared from the form.'); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not save provider settings. Email backend endpoint may not be configured.'); }
    finally { setSaving(false); }
  }
  async function testEmail() {
    if (!testRecipient.trim()) { setError('Enter a recipient email for the SMTP test.'); return; }
    setSaving(true); setError(''); setMessage('');
    try { await emailApi.testSmtp(testRecipient.trim()); setMessage('Test email request submitted.'); }
    catch (e: any) { setError(e?.response?.data?.message || 'SMTP test endpoint is unavailable.'); }
    finally { setSaving(false); }
  }
  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try { await emailApi.saveTemplate(template); setMessage('Template saved.'); await refresh(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Could not save template. Email backend endpoint may not be configured.'); }
    finally { setSaving(false); }
  }
  async function retry(id: number) {
    setSaving(true); setError(''); setMessage('');
    try { await emailApi.retryQueuedEmail(id); setMessage('Retry request submitted.'); await refresh(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Email retry endpoint is unavailable.'); }
    finally { setSaving(false); }
  }

  return <section className="email-center-page">
    <header className="email-center-header"><div><span>WORKSPACE / ADMINISTRATION</span><h1>Email Services</h1><p>Provider settings, templates, delivery logs and background queue.</p></div><button type="button" onClick={() => void refresh()} disabled={loading}>↻ Refresh</button></header>
    <div className="email-center-notice"><strong>Secure integration</strong><p>Email secrets are sent only to the backend service; this screen never reads or stores SMTP passwords in browser storage. Backend email endpoints are required for delivery.</p></div>
    {error && <div className="email-center-alert error" role="alert">{error}</div>}{message && <div className="email-center-alert success" role="status">{message}</div>}
    <nav className="email-center-tabs" aria-label="Email services sections">{(['smtp', 'templates', 'logs', 'queue'] as const).map((value) => <button key={value} type="button" className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value === 'smtp' ? 'Provider / SMTP' : value === 'templates' ? 'Templates' : value === 'logs' ? 'Email Logs' : 'Queue & Retry'}</button>)}</nav>
    {loading ? <div className="email-center-loading" role="status">Loading email service configuration…</div> : <>
      {tab === 'smtp' && <form className="email-center-card" onSubmit={saveSmtp}><h2>Provider Configuration</h2><div className="email-center-grid">
        <label>Provider<select value={smtp.provider} onChange={(e) => setSmtp({ ...smtp, provider: e.target.value })}><option>SMTP</option><option>SendGrid</option><option>Amazon SES</option><option>Other</option></select></label>
        <label>SMTP Host<input required value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.example.com" /></label>
        <label>Port<input type="number" required min="1" max="65535" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} /></label>
        <label>Username<input value={smtp.username} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} autoComplete="off" /></label>
        <label>From Email<input type="email" required value={smtp.fromEmail} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} /></label>
        <label>From Name<input required value={smtp.fromName} onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })} /></label>
        <label className="full">SMTP Secret / Password<input type="password" value={smtp.password || ''} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} autoComplete="new-password" placeholder="Enter only when setting or rotating secret" /></label>
        <label className="email-center-check"><input type="checkbox" checked={smtp.useTls} onChange={(e) => setSmtp({ ...smtp, useTls: e.target.checked })} /> Use TLS</label>
      </div><div className="email-center-actions"><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Provider Settings'}</button><div className="email-center-test"><input type="email" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="Test recipient email" /><button type="button" onClick={() => void testEmail()} disabled={saving}>Send Test Email</button></div></div></form>}
      {tab === 'templates' && <div className="email-center-card"><h2>Email Templates Management</h2><div className="email-center-grid"><label>Choose Template<select value={template.key} onChange={(e) => setTemplate(templates.find((item) => item.key === e.target.value) || { ...blankTemplate, key: e.target.value, name: e.target.value })}><option value="welcome">welcome</option>{templates.filter((item) => item.key !== 'welcome').map((item) => <option key={item.key} value={item.key}>{item.name} ({item.key})</option>)}</select></label></div><form onSubmit={saveTemplate} className="email-center-template-form"><label>Template Name<input required value={template.name} onChange={(e) => setTemplate({ ...template, name: e.target.value })} /></label><label>Subject<input required value={template.subject} onChange={(e) => setTemplate({ ...template, subject: e.target.value })} /></label><label>Body<textarea required rows={9} value={template.body} onChange={(e) => setTemplate({ ...template, body: e.target.value })} placeholder="Use backend-supported placeholders, e.g. {{studentName}}, {{courseName}}" /></label><label className="email-center-check"><input type="checkbox" checked={template.enabled} onChange={(e) => setTemplate({ ...template, enabled: e.target.checked })} /> Enabled</label><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Template'}</button></form></div>}
      {tab === 'logs' && <div className="email-center-card"><h2>Email Logs · {logs.length}</h2><div className="email-center-table-wrap"><table><thead><tr><th>Recipient</th><th>Subject</th><th>Status</th><th>Date</th><th>Failure detail</th></tr></thead><tbody>{logs.map((item) => <tr key={item.id}><td>{item.recipient}</td><td>{item.subject}</td><td><span className={'email-center-status ' + item.status.toLowerCase()}>{item.status}</span></td><td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</td><td>{item.error || '—'}</td></tr>)}{logs.length === 0 && <tr><td colSpan={5}>No email log entries returned.</td></tr>}</tbody></table></div></div>}
      {tab === 'queue' && <div className="email-center-card"><h2>Background Email Queue · {queue.length}</h2><div className="email-center-table-wrap"><table><thead><tr><th>Recipient</th><th>Subject</th><th>Status</th><th>Attempts</th><th>Queued</th><th>Action</th></tr></thead><tbody>{queue.map((item) => <tr key={item.id}><td>{item.recipient}</td><td>{item.subject}</td><td>{item.status}</td><td>{item.attempts}</td><td>{item.queuedAt ? new Date(item.queuedAt).toLocaleString() : '—'}</td><td><button type="button" disabled={saving || !/failed|pending/i.test(item.status)} onClick={() => void retry(item.id)}>Retry</button></td></tr>)}{queue.length === 0 && <tr><td colSpan={6}>No queued emails returned.</td></tr>}</tbody></table></div></div>}
    </>}
  </section>;
}
