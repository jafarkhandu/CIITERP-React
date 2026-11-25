import { apiErrorMessage } from '@/core/http/errors';
import { useAutoDismissMessage } from '@/core/notifications/useAutoDismissMessage';
import { AutoDismissAlert } from '@/components/AutoDismissAlert';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { enquiryApi, type EnquiryRecord } from '@/api/enquiryApi';
import { directoryApi } from '@/api/directoryApi';
import { sendAutomaticEmail } from '@/core/notifications/automaticEmail';
import { getEnquiryLeadSources, useEnquiryOptions } from './useEnquiryOptions';
import './Enquiry.css';

type FormState = Omit<EnquiryRecord, 'enquiryId'>;
const initialForm: FormState = {
  enquiryDate: new Date().toISOString().slice(0, 10),
  candidateName: '',
  gender: '',
  localAddress: '',
  emailAddress: '',
  mobileNumber: '',
  birthDate: '',
  qualificationId: 0,
  qualification: '',
  leadSources: '',
  enquiryFors: '',
  interestedTopics: '',
  status: 'New',
  branchId: 0,
  branchName: '',
};

function isValidIndianMobile(number: string): boolean {
  return /^[6-9]\d{9}$/.test(number) && !/^(\d)\1{9}$/.test(number);
}

export default function EnquiryForm() {
  const { id = '' } = useParams();
  return <EnquiryFormPage key={id} enquiryId={Number(id)} />;
}

function EnquiryFormPage({ enquiryId }: { enquiryId: number }) {
  const navigate = useNavigate();
  const editMode = enquiryId > 0;
  const [form, setForm] = useState<FormState>(initialForm);
  const branchOptions = useEnquiryOptions(directoryApi.getBranches);
  const qualificationOptions = useEnquiryOptions(enquiryApi.getQualifications);
  const sourceOptions = useEnquiryOptions(getEnquiryLeadSources);
  const { rows: branches } = branchOptions;
  const { rows: qualifications } = qualificationOptions;
  const { rows: leadSources } = sourceOptions;
  const [recordLoading, setRecordLoading] = useState(editMode);
  const [recordError, setRecordError] = useState(false);
  const [recordRevision, setRecordRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useAutoDismissMessage();
  const [mobileTouched, setMobileTouched] = useState(false);
  const optionsLoading = branchOptions.loading || qualificationOptions.loading || (Boolean(form.leadSources) && sourceOptions.loading);
  const mobileError = form.mobileNumber && !isValidIndianMobile(form.mobileNumber)
    ? 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9. Repeated digits are not allowed.'
    : '';
  const enquiryForOptions = ['Job Placement', 'College Project', 'Upgrade Skill', 'Other', 'Real Time Project', 'AI', 'Certification'];
  const leadSourceOptions = ['Website', 'Facebook', 'Instagram', 'Google Ads', 'Walk-in', 'Phone Call', 'Online', 'String', 'CIIT Student', 'Banar'];
  const topicOptions = ['@$','1','2','Advanced Java','AI','AI ML','Ak','ALML','angular','asdf','C#','Data Analytics','DataScience','devops','Dot Net + AI with Azure','Dot Net with AI','Dotnet','DS','Excel','Excel & power bi','FrontEnd Developer','Full stack developer','Full Stack Java + DevOps + AI','full stack Python'];
  function toggleSelection(key: 'enquiryFors' | 'leadSources' | 'interestedTopics', option: string) {
    const selected = form[key].split(',').map((value) => value.trim()).filter(Boolean);
    change(key, selected.includes(option) ? selected.filter((value) => value !== option).join(', ') : [...selected, option].join(', '));
  }
  function isSelected(key: 'enquiryFors' | 'leadSources' | 'interestedTopics', option: string) {
    return form[key].split(',').map((value) => value.trim()).includes(option);
  }

  useEffect(() => {
    if (!editMode) return;
    let active = true;
    void enquiryApi.getById(enquiryId).then((record) => {
      if (!active) return;
      if (record) {
        const item = record as EnquiryRecord & Record<string, unknown>;
        setForm({
          ...initialForm,
          ...item,
          enquiryDate: String(item.enquiryDate ?? item.enquiry_date ?? '').slice(0, 10),
          candidateName: String(item.candidateName ?? item.candidate_name ?? ''),
          gender: String(item.gender ?? ''),
          localAddress: String(item.localAddress ?? item.local_address ?? ''),
          emailAddress: String(item.emailAddress ?? item.email_address ?? item.email ?? ''),
          mobileNumber: String(item.mobileNumber ?? item.mobile_number ?? item.mobile ?? ''),
          birthDate: String(item.birthDate ?? item.birth_date ?? '').slice(0, 10),
          branchId: Number(item.branchId ?? item.branch_Id ?? item.branch_id ?? 0),
          branchName: String(item.branchName ?? item.branch_name ?? ''),
          qualificationId: Number(item.qualificationId ?? item.qualification_Id ?? item.qualification_id ?? 0),
          qualification: String(item.qualification ?? item.qualification_Name ?? item.qualificationName ?? ''),
          leadSources: String(item.leadSources ?? item.lead_sources ?? ''),
          enquiryFors: String(item.enquiryFors ?? item.enquiry_fors ?? ''),
          interestedTopics: String(item.interestedTopics ?? item.interested_topics ?? ''),
          status: String(item.status ?? 'New'),
        });
      } else setRecordError(true);
    }, () => { if (active) setRecordError(true); })
      .finally(() => { if (active) setRecordLoading(false); });
    return () => { active = false; };
  }, [editMode, enquiryId, recordRevision]);

  function change<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (optionsLoading) return;
    setError('');
    const branch = branches.find((item) => item.id === Number(form.branchId));
    const qualification = qualifications.find((item) =>
      Number(item.qualificationId ?? item.qualification_Id ?? item.qualification_id ?? item.QualificationId ?? item.id) === Number(form.qualificationId));
    const qualificationName = String(qualification?.qualificationName ?? qualification?.qualification_Name ?? qualification?.qualification_name ?? qualification?.qualification ?? qualification?.QualificationName ?? qualification?.name ?? form.qualification).trim();
    if (!branch || !qualificationName) {
      setError('Please select a branch and qualification.');
      return;
    }
    if (!isValidIndianMobile(form.mobileNumber)) {
      setMobileTouched(true);
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    const selectedSourceNames = form.leadSources.split(',').map((name) => name.trim()).filter(Boolean);
    const matchingSources = selectedSourceNames.map((name) =>
      leadSources.find((source) => source.sourceName.trim().toLowerCase() === name.toLowerCase())
    );
    if (selectedSourceNames.length && matchingSources.some((source) => !source)) {
      setError('Selected lead source could not be verified. Refresh the page and try again.');
      return;
    }
    const payload: any = {
      ...form,
      branchId: branch.id,
      branchName: branch.name,
      qualificationId: Number(form.qualificationId),
      qualification: qualificationName,
      status: form.status || 'New',
      enquiryFors: form.enquiryFors.trim(),
      sourceId: matchingSources[0]?.sourceId ?? 0,
      leadSources: form.leadSources.trim(),
      interestedTopics: form.interestedTopics.trim(),
    };
    setSaving(true);
    try {
      if (editMode) {
        await enquiryApi.update(enquiryId, { enquiryId, ...payload } as EnquiryRecord);
      } else {
        await enquiryApi.create(payload);
        sendAutomaticEmail(
          form.emailAddress,
          'CIIT enquiry confirmation',
          `Hello ${form.candidateName},\n\nYour enquiry has been recorded successfully. Our team will contact you about your training interests.\n\nCIIT Training Institute`,
        );
      }
      navigate('/main/enquiry');
    } catch (requestError: any) {
      setError(apiErrorMessage(requestError, (editMode ? 'Unable to update enquiry.' : 'Unable to create enquiry.')));
    } finally {
      setSaving(false);
    }
  }

  return <section className="enquiry-page">
    <header className="enquiry-header"><div><h1>{editMode ? 'Edit Enquiry' : 'Add Enquiry'}</h1><p>Capture candidate enquiry details</p></div>
      <button className="enquiry-secondary-btn" type="button" onClick={() => navigate('/main/enquiry')}>Back to Enquiries</button>
    </header>
    {recordLoading && <p role="status">Loading enquiry...</p>}
    {recordError && <AutoDismissAlert className="enquiry-alert" message="Unable to load enquiry details."><button type="button" onClick={() => {
      setRecordError(false);
      setRecordLoading(true);
      setRecordRevision((revision) => revision + 1);
    }}>Retry</button></AutoDismissAlert>}
    {branchOptions.error && <AutoDismissAlert className="enquiry-alert" message="Unable to load branches."><button type="button" onClick={branchOptions.retry}>Retry</button></AutoDismissAlert>}
    {qualificationOptions.error && <AutoDismissAlert className="enquiry-alert" message="Unable to load qualifications."><button type="button" onClick={qualificationOptions.retry}>Retry</button></AutoDismissAlert>}
    {sourceOptions.error && <AutoDismissAlert className="enquiry-alert" message="Unable to load lead sources."><button type="button" onClick={sourceOptions.retry}>Retry</button></AutoDismissAlert>}
    {error && <div className="enquiry-alert" role="alert">{error}</div>}
    {!recordLoading && !recordError && <div className="enquiry-table-card" style={{ padding: 24 }}>
      <form onSubmit={submit} className="enquiry-form">
        <div className="enquiry-original-layout">
          <div className="enquiry-original-fields">
            <label>Enquiry Date:<input type="date" required value={form.enquiryDate} onChange={(e) => change('enquiryDate', e.target.value)} /></label>
            <label>Branch Name:<select required disabled={branchOptions.loading || branchOptions.error} value={form.branchId} onChange={(e) => change('branchId', Number(e.target.value))}>
              <option value={0}>{branchOptions.loading ? 'Loading branches…' : 'Select Branch'}</option>
              {branchOptions.loading && form.branchId > 0 && <option value={form.branchId}>{form.branchName || 'Current Branch'}</option>}
              {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <label>Candidate Name:<input required minLength={2} placeholder="Enter candidate name" value={form.candidateName} onChange={(e) => change('candidateName', e.target.value)} /></label>
            <fieldset className="enquiry-gender"><legend>Gender:</legend>{['Male','Female','Other'].map((gender) => <label key={gender}><input type="radio" name="gender" required checked={form.gender === gender} onChange={() => change('gender', gender)} />{gender}</label>)}</fieldset>
            <label>Local Address:<textarea rows={2} value={form.localAddress} onChange={(e) => change('localAddress', e.target.value)} /></label>
            <label>Email Address:<input type="email" required value={form.emailAddress} onChange={(e) => change('emailAddress', e.target.value)} /></label>
            <label>
              Mobile Number:
              <input
                required
                inputMode="numeric"
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                value={form.mobileNumber}
                onChange={(event) => change('mobileNumber', event.target.value.replace(/\D/g, '').slice(0, 10))}
                onBlur={() => setMobileTouched(true)}
                aria-invalid={mobileTouched && !!mobileError}
                aria-describedby={mobileTouched && mobileError ? 'enquiry-mobile-error' : undefined}
              />
              {mobileTouched && mobileError && (
                <small id="enquiry-mobile-error" className="enquiry-field-error" role="alert">{mobileError}</small>
              )}
            </label>
            <label>Birth Date:<input type="date" value={form.birthDate} onChange={(e) => change('birthDate', e.target.value)} /></label>
            <label>Qualification:<select required disabled={qualificationOptions.loading || qualificationOptions.error} value={form.qualificationId} onChange={(e) => {
              const selected = qualifications.find((item) => Number(item.qualificationId ?? item.qualification_Id ?? item.qualification_id ?? item.QualificationId ?? item.id) === Number(e.target.value));
              change('qualificationId', Number(e.target.value));
              change('qualification', String(selected?.qualificationName ?? selected?.qualification_Name ?? selected?.qualification_name ?? selected?.qualification ?? selected?.QualificationName ?? selected?.name ?? ''));
            }}>
              <option value={0}>{qualificationOptions.loading ? 'Loading qualifications…' : 'Select Qualification'}</option>
              {qualificationOptions.loading && form.qualificationId > 0 && <option value={form.qualificationId}>{form.qualification || 'Current Qualification'}</option>}
              {qualifications.map((item) => {
              const qid = Number(item.qualificationId ?? item.qualification_Id ?? item.qualification_id ?? item.QualificationId ?? item.id ?? 0);
              const name = String(item.qualificationName ?? item.qualification_Name ?? item.qualification_name ?? item.qualification ?? item.QualificationName ?? item.name ?? 'Qualification');
              return <option key={qid} value={qid}>{name}</option>;
            })}</select></label>
            <label>Status:<select value={form.status} onChange={(e) => change('status', e.target.value)}><option>New</option><option>In Progress</option><option>Converted</option><option>Closed</option></select></label>
          </div>
          <div className="enquiry-original-groups">
            <section className="enquiry-choice-panel"><h2>Enquiry For</h2><div className="enquiry-choice-grid">{enquiryForOptions.map((option) => <label key={option}><input type="checkbox" checked={isSelected('enquiryFors', option)} onChange={() => toggleSelection('enquiryFors', option)} />{option}</label>)}</div></section>
            <section className="enquiry-choice-panel"><h2>How did you come to know about us?</h2><div className="enquiry-choice-grid">{leadSourceOptions.map((option) => <label key={option}><input type="checkbox" checked={isSelected('leadSources', option)} onChange={() => toggleSelection('leadSources', option)} />{option}</label>)}</div></section>
            <section className="enquiry-choice-panel"><h2>Tick your Interesting Training</h2><div className="enquiry-choice-grid enquiry-topic-grid">{topicOptions.map((option) => <label key={option}><input type="checkbox" checked={isSelected('interestedTopics', option)} onChange={() => toggleSelection('interestedTopics', option)} />{option}</label>)}</div></section>
          </div>
        </div>
        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
          <button className="enquiry-secondary-btn" type="button" disabled={saving} onClick={() => navigate('/main/enquiry')}>Cancel</button>
          <button className="enquiry-primary-btn" type="submit" disabled={saving || optionsLoading}>{saving ? 'Saving...' : editMode ? 'Update Enquiry' : 'Create Enquiry'}</button>
        </footer>
      </form>
    </div>}
  </section>;
}
