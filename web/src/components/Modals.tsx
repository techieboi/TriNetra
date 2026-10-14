import { useEffect, useState } from 'react';
import type { AuditEntry } from '../types';
import { istClock } from '../lib/format';

interface ModalProps {
  title: React.ReactNode;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}

export function Modal({ title, onClose, width = 820, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="c2-modal-backdrop active" onClick={onClose}>
      <div className="c2-modal-card" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="c2-modal-header">
          <div className="modal-cam-title">{title}</div>
          <button className="c2-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="c2-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function AuditModal({ entries, onClose }: { entries: AuditEntry[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const shown = [...entries].reverse().filter((e) => !q || `${e.category} ${e.actor} ${e.summary}`.toLowerCase().includes(q.toLowerCase()));

  const exportCsv = () => {
    const rows = [['timestamp', 'category', 'actor', 'summary'], ...shown.map((e) => [e.timestamp, e.category, e.actor, e.summary])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trinetra-audit.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal title={<span style={{ fontWeight: 600, color: '#fff' }}>Audit trail · append-only</span>} onClose={onClose} width={900}>
      <div className="audit-toolbar">
        <input className="c2-input-field" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="c2-btn-ghost" onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="audit-scroll">
        <table className="audit-modal-table">
          <thead><tr><th>Time</th><th>Category</th><th>Actor</th><th>Summary</th></tr></thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.audit_id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{istClock(new Date(e.timestamp))}</td>
                <td style={{ color: '#93c5fd' }}>{e.category}</td>
                <td>{e.actor}</td>
                <td>{e.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

interface NoteProps {
  action: 'dismiss' | 'escalate';
  alertId: string;
  onSubmit: (note: string) => Promise<void>;
  onClose: () => void;
}

export function NoteModal({ action, alertId, onSubmit, onClose }: NoteProps) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dismiss = action === 'dismiss';

  const submit = async () => {
    if (!note.trim()) return setError('A note is required.');
    setBusy(true);
    try {
      await onSubmit(note.trim());
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={<span style={{ fontWeight: 600, color: '#fff' }}>{dismiss ? 'Dismiss' : 'Escalate'} {alertId} · note required</span>} onClose={onClose} width={480}>
      <div style={{ padding: 16 }}>
        <p className="note-help">
          {dismiss
            ? 'Dismissing closes the alert as normal activity and lowers the score of similar future events at this node and hour.'
            : 'Escalating sends this alert to sector command.'}
        </p>
        <input
          autoFocus
          className="c2-input-field"
          placeholder={dismiss ? 'e.g. Known villagers returning late' : 'e.g. Group crossing toward road, need QRT backup'}
          value={note}
          onChange={(e) => { setNote(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {error && <div className="note-error">{error}</div>}
        <div className="note-actions">
          <button className="c2-btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`c2-btn-primary ${dismiss ? 'danger' : ''}`} disabled={busy} onClick={submit}>
            {dismiss ? 'Dismiss alert' : 'Escalate alert'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
