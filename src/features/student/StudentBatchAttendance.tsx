import { useEffect, useState } from 'react';
import { studentApi } from '@/api/studentApi';
import { apiErrorMessage, httpStatus } from '@/core/http/errors';
import { AutoDismissAlert } from '@/components/AutoDismissAlert';
import { normalizeStudentAttendance, type StudentAttendanceEntry } from './studentAttendanceData';

interface Props {
  batchId: number;
  studentId: number;
  registrationIds: number[];
}

type AttendanceState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: StudentAttendanceEntry[] };

function formatDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? match[3] + '/' + match[2] + '/' + match[1] : date || '—';
}

export default function StudentBatchAttendance({ batchId, studentId, registrationIds }: Props) {
  const [state, setState] = useState<AttendanceState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const registrationKey = [...new Set(registrationIds)].sort((a, b) => a - b).join(',');

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    const owned = registrationKey ? registrationKey.split(',').map(Number) : [];
    studentApi.getBatchAttendance(batchId)
      .then(response => {
        if (!active) return;
        const rows = normalizeStudentAttendance(response, studentId, batchId, owned);
        setState({ status: 'ready', rows });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const status = httpStatus(error);
        setState({
          status: 'error',
          message: apiErrorMessage(error, status === 404
            ? 'The attendance service could not find this batch (ID ' + batchId + ').'
            : status === 403
              ? 'The attendance service did not allow access to this batch.'
              : 'Your attendance could not be loaded or verified.'),
        });
      });

    return () => { active = false; };
  }, [batchId, studentId, registrationKey, attempt]);

  if (state.status === 'loading') return <p className="sp-muted" role="status">Loading your attendance…</p>;
  if (state.status === 'error') return (
    <AutoDismissAlert className="sp-alert" message={state.message}>
      <button type="button" className="sp-batch-attendance-retry" onClick={() => setAttempt(value => value + 1)}>Retry</button>
    </AutoDismissAlert>
  );
  if (!state.rows.length) return <p className="sp-muted">No attendance records yet for this batch.</p>;

  const present = state.rows.filter(row => row.status === 'Present').length;
  const absent = state.rows.filter(row => row.status === 'Absent').length;
  // The API calculates attendance against all lectures, including unmarked ones.
  const total = state.rows.length;
  const notMarked = total - present - absent;
  return (
    <div className="sp-batch-attendance-content">
      <div className="sp-batch-attendance-summary">
        <span>Sessions <strong>{total}</strong></span>
        <span>Present <strong>{present}</strong></span>
        <span>Absent <strong>{absent}</strong></span>
        <span>Not marked <strong>{notMarked}</strong></span>
        <span>Attendance <strong>{Math.round(present / total * 100) + '%'}</strong></span>
      </div>
      <div className="sp-batch-attendance-scroll">
        <table className="sp-batch-attendance-table">
          <thead><tr><th>Session</th><th>Topic</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            {state.rows.map(row => (
              <tr key={row.key}>
                <td>{row.session || '—'}</td>
                <td>{row.topic || '—'}</td>
                <td>{formatDate(row.date)}</td>
                <td><span className={'sp-batch-attendance-badge ' + (row.status === 'Present' ? 'is-present' : row.status === 'Absent' ? 'is-absent' : 'is-unmarked')}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
