import { apiErrorMessage } from '@/core/http/errors';
import { useAutoDismissMessage } from '@/core/notifications/useAutoDismissMessage';
import { AutoDismissAlert } from '@/components/AutoDismissAlert';
import { useEffect, useState, type FormEvent } from 'react';
import { studentApi, type StudentMyProfilePayload } from '@/api/studentApi';

type ProfileRecord = Record<string, unknown>;
type EditableField = 'studentName' | 'lastName' | 'emailAddress' | 'mobileNumber'
  | 'whatsappNumber' | 'qualification' | 'parentName' | 'parentNumber'
  | 'localAddress' | 'permanentAddress';

interface Props {
  studentId: number | null;
  profile: ProfileRecord | null;
  registration: ProfileRecord | null;
  loading: boolean;
  error: string;
  onSaved: (profile: StudentMyProfilePayload) => void;
}

const fields: { key: EditableField; label: string; type?: string; required?: boolean }[] = [
  { key: 'studentName', label: 'First name', required: true },
  { key: 'lastName', label: 'Last name' },
  { key: 'emailAddress', label: 'Email address', type: 'email', required: true },
  { key: 'mobileNumber', label: 'Mobile number', type: 'tel', required: true },
  { key: 'whatsappNumber', label: 'WhatsApp number', type: 'tel' },
  { key: 'qualification', label: 'Qualification' },
  { key: 'parentName', label: 'Parent name' },
  { key: 'parentNumber', label: 'Parent number', type: 'tel' },
  { key: 'localAddress', label: 'Local address' },
  { key: 'permanentAddress', label: 'Permanent address' },
];

const aliases: Record<keyof StudentMyProfilePayload, string[]> = {
  studentId: ['studentId', 'student_Id', 'StudentId'],
  studentName: ['studentName', 'student_Name', 'StudentName'],
  gender: ['gender', 'Gender'],
  mobileNumber: ['mobileNumber', 'mobile_Number', 'MobileNumber'],
  emailAddress: ['emailAddress', 'email_Address', 'EmailAddress'],
  birthDate: ['birthDate', 'birth_Date', 'BirthDate'],
  qualification: ['qualification', 'Qualification'],
  parentName: ['parentName', 'parent_Name', 'ParentName'],
  parentNumber: ['parentNumber', 'parent_Number', 'ParentNumber'],
  lastName: ['lastName', 'last_Name', 'LastName'],
  whatsappNumber: ['whatsappNumber', 'whatsapp_Number', 'WhatsAppNumber'],
  localAddress: ['localAddress', 'local_Address', 'LocalAddress'],
  permanentAddress: ['permanentAddress', 'permanent_Address', 'PermanentAddress'],
  aadharCardNumber: ['aadharCardNumber', 'aadhar_CardNumber', 'AadharCardNumber'],
  aadharCardPhoto: ['aadharCardPhoto', 'aadhar_CardPhoto', 'AadharCardPhoto'],
  branchId: ['branchId', 'branch_Id', 'BranchId'],
};

function existingValue(profile: ProfileRecord, registration: ProfileRecord | null, keys: string[]): unknown {
  for (const record of [profile, registration]) {
    if (!record) continue;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined) {
        return record[key];
      }
    }
  }
  return undefined;
}

function fullPayload(profile: ProfileRecord | null, registration: ProfileRecord | null, studentId: number | null) {
  if (!profile || !studentId) return null;
  const result: Record<string, string | number> = { studentId };
  const missing: string[] = [];
  for (const name of Object.keys(aliases) as (keyof StudentMyProfilePayload)[]) {
    if (name === 'studentId') continue;
    const value = existingValue(profile, registration, aliases[name]);
    if (value === undefined) {
      missing.push(name);
    } else if (name === 'branchId') {
      const id = Number(value);
      if (!Number.isSafeInteger(id) || id <= 0) missing.push(name);
      else result[name] = id;
    } else {
      result[name] = value == null ? '' : String(value);
    }
  }
  // The backend receives a full profile DTO; never overwrite unknown values
  // with guessed empty strings or a placeholder branch ID.
  return missing.length ? { payload: null, missing } : {
    payload: result as unknown as StudentMyProfilePayload,
    missing: [],
  };
}

function getInitialDraft(payload: StudentMyProfilePayload): Record<EditableField, string> {
  const draft = {} as Record<EditableField, string>;
  for (const field of fields) draft[field.key] = payload[field.key];
  return draft;
}

export default function StudentProfileEditor({ studentId, profile, registration, loading, error, onSaved }: Props) {
  const snapshot = fullPayload(profile, registration, studentId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<EditableField, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useAutoDismissMessage();

  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setMessage('');
  }, [studentId]);

  function beginEdit() {
    if (!snapshot?.payload) return;
    setDraft(getInitialDraft(snapshot.payload));
    setEditing(true);
    setMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot?.payload || !draft || !studentId || saving) return;
    const next = { ...snapshot.payload, ...draft, studentId };
    next.studentName = next.studentName.trim();
    next.lastName = next.lastName.trim();
    next.emailAddress = next.emailAddress.trim();
    next.mobileNumber = next.mobileNumber.trim();
    if (!next.studentName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.emailAddress)
        || !/^\+?[0-9 -]{7,16}$/.test(next.mobileNumber)) {
      setMessage('Enter a name, valid email address, and valid mobile number.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await studentApi.updateMyProfile(next);
      onSaved(next);
      setEditing(false);
      setDraft(null);
      setMessage('Profile updated successfully.');
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Profile update failed. Your existing details were not changed.'));
    } finally {
      setSaving(false);
    }
  }

  if (!studentId) return null;
  return <div className="sp-profile-editor">
    {!editing ? (
      <div className="sp-profile-edit-actions">
        <button type="button" className="sp-profile-edit-button" onClick={beginEdit}
          disabled={loading || !snapshot?.payload}>Edit profile</button>
        {loading && <p className="sp-muted" role="status">Loading editable profile…</p>}
        {!loading && error && <AutoDismissAlert as="p" className="sp-muted" message={error} />}
        {!loading && snapshot && !!snapshot.missing.length && (
          <AutoDismissAlert as="p" className="sp-muted" message={`Profile editing is unavailable because the backend did not return all the original fields (${snapshot.missing.join(', ')}). No incomplete profile will be submitted.`} />
        )}
      </div>
    ) : (
      <form className="sp-profile-edit-form" onSubmit={(event) => void submit(event)}>
        <p className="sp-muted">Your student ID, branch and Aadhaar document are kept unchanged.</p>
        <div className="sp-profile-edit-grid">
          {fields.map(field => <label key={field.key} className="sp-profile-edit-field">
            <span>{field.label}</span>
            {field.key === 'localAddress' || field.key === 'permanentAddress'
              ? <textarea value={draft?.[field.key] ?? ''} maxLength={500} rows={2}
                  onChange={event => setDraft(current => current ? { ...current, [field.key]: event.target.value } : current)} />
              : <input type={field.type ?? 'text'} value={draft?.[field.key] ?? ''}
                  required={field.required} maxLength={field.type === 'tel' ? 16 : 150}
                  onChange={event => setDraft(current => current ? { ...current, [field.key]: event.target.value } : current)} />}
          </label>)}
        </div>
        <div className="sp-profile-edit-actions">
          <button type="submit" className="sp-profile-edit-button" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          <button type="button" className="sp-profile-cancel-button" onClick={() => { setEditing(false); setDraft(null); setMessage(''); }} disabled={saving}>Cancel</button>
        </div>
      </form>
    )}
    {message && <p className="sp-muted" role="status">{message}</p>}
  </div>;
}
