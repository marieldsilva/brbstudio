import { useEffect, useRef, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { getJson, sendJson } from '../lib/adminApi.js';

const API_BASE = '/api/admin/reschedule';
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const DECISIONS = {
  approve: {
    title: 'Approve this request?',
    confirmLabel: 'Approve',
    confirmClass: 'btn--primary',
    successMessage: 'Request approved. The booking now uses the new schedule.',
  },
  reject: {
    title: 'Reject this request?',
    confirmLabel: 'Reject',
    confirmClass: 'btn--danger-solid',
    successMessage: 'Request rejected. The booking keeps its original schedule.',
  },
};

function formatDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return DATE_FORMAT.format(new Date(year, month - 1, day));
}

function RequestCard({ request, onDecision }) {
  return (
    <article className="panel request-card">
      <header className="request-card__header">
        <h2 className="request-card__reference">Booking ID: #{request.reference}</h2>
        <p className="request-card__requested">
          Requested on {formatDate(request.requestedAt.slice(0, 10))}
        </p>
      </header>

      <p className="request-card__summary">
        {request.customerName} - {request.services.join(', ')}
      </p>

      <div className="request-card__schedules">
        <div className="schedule-box">
          <p className="schedule-box__label">Original</p>
          <p className="schedule-box__date">{formatDate(request.oldDate)}</p>
          <p className="schedule-box__time">{request.oldTimeLabel}</p>
        </div>

        <span className="request-card__arrow" aria-hidden="true"></span>

        <div className="schedule-box schedule-box--requested">
          <p className="schedule-box__label">Requested</p>
          <p className="schedule-box__date">{formatDate(request.newDate)}</p>
          <p className="schedule-box__time">{request.newTimeLabel}</p>
        </div>
      </div>

      <div className="request-card__actions">
        <button className="btn btn--primary" type="button" onClick={() => onDecision(request, 'approve')}>
          Approve
        </button>
        <button className="btn" type="button" onClick={() => onDecision(request, 'reject')}>
          Reject
        </button>
      </div>
    </article>
  );
}

export default function AdminReschedulePage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pendingDecision, setPendingDecision] = useState(null);
  const [decisionError, setDecisionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    getJson(API_BASE)
      .then((data) => {
        if (!Array.isArray(data.requests)) {
          throw new Error('The server returned an invalid rescheduling request list.');
        }
        if (!cancelled) setRequests(data.requests);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || 'Unable to load rescheduling requests.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (pendingDecision && dialog && !dialog.open) dialog.showModal();
    if (!pendingDecision && dialog?.open) dialog.close();
  }, [pendingDecision]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function openDecision(request, action) {
    setDecisionError('');
    setPendingDecision({ request, action });
  }

  function closeDecision() {
    if (saving) return;
    setPendingDecision(null);
    setDecisionError('');
  }

  async function confirmDecision() {
    if (!pendingDecision || saving) return;
    const { request, action } = pendingDecision;
    setSaving(true);
    setDecisionError('');

    try {
      await sendJson(`${API_BASE}/${request.id}/${action}`, 'POST', {});
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setPendingDecision(null);
      setToast({ message: DECISIONS[action].successMessage, type: 'success' });
    } catch (error) {
      setDecisionError(error.message || 'Unable to update this request. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const decision = pendingDecision && DECISIONS[pendingDecision.action];
  const { request, action } = pendingDecision || {};

  return (
    <AdminLayout
      activePage="reschedule-requests"
      title="Rescheduling Requests | BRB Studios Admin"
    >
      <main className="admin-main">
        <header className="page-header">
          <p className="page-header__eyebrow">Schedule Changes</p>
          <h1 className="page-header__title">Rescheduling Requests</h1>
        </header>

        {loading && <p className="status-message" role="status">Loading requests&hellip;</p>}
        {!loading && loadError && <p className="status-message" role="alert">{loadError}</p>}
        {!loading && !loadError && requests.length > 0 && (
          <section className="request-list" aria-label="Pending rescheduling requests">
            {requests.map((item) => (
              <RequestCard key={item.id} request={item} onDecision={openDecision} />
            ))}
          </section>
        )}
        {!loading && !loadError && requests.length === 0 && (
          <p className="request-empty" role="status">
            No pending rescheduling requests. New requests from customers will appear here.
          </p>
        )}
      </main>

      <dialog
        ref={dialogRef}
        className="dialog"
        aria-labelledby="confirmDialogTitle"
        onCancel={(event) => {
          event.preventDefault();
          closeDecision();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDecision();
        }}
        onClose={() => {
          if (!saving) setPendingDecision(null);
        }}
      >
        {pendingDecision && (
          <div className="dialog__form">
            <h2 className="dialog__title" id="confirmDialogTitle">{decision.title}</h2>
            <p className="dialog__text">
              {request.customerName}&apos;s booking #{request.reference}{' '}
              {action === 'approve'
                ? `will move to ${formatDate(request.newDate)}, ${request.newTimeLabel}.`
                : `will stay on ${formatDate(request.oldDate)}, ${request.oldTimeLabel}.`}
            </p>
            {decisionError && <p className="alert alert--error" role="alert">{decisionError}</p>}
            <div className="dialog__actions">
              <button className="btn" type="button" disabled={saving} onClick={closeDecision}>
                Cancel
              </button>
              <button
                className={`btn ${decision.confirmClass}`}
                type="button"
                disabled={saving}
                onClick={() => void confirmDecision()}
              >
                {saving ? 'Saving…' : decision.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </dialog>

      {toast && (
        <p className={`toast${toast.type === 'error' ? ' toast--error' : ''}`} role="status">
          {toast.message}
        </p>
      )}
    </AdminLayout>
  );
}
