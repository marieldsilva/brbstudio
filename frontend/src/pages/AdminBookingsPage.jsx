import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout.jsx';
import { deleteRequest, getJson, sendJson } from '../lib/adminApi.js';

const API_BASE = '/api/admin/bookings';
const CONTRACT_PAGE = '/customer/html/contract.html';
const STATUS_TABS = ['Pending', 'To Pay', 'Confirmed', 'Completed', 'Rejected', 'Cancelled'];
const GROUP_LABELS = { upcoming: 'Upcoming', ongoing: 'Ongoing', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled' };
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const LONG_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const TIME_FORMAT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

function fromIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  return DATE_FORMAT.format(fromIsoDate(value));
}

function formatLongDate(value) {
  return LONG_DATE_FORMAT.format(fromIsoDate(value));
}

function formatDateTime(value) {
  const [datePart, timePart] = value.split(' ');
  const [hours, minutes] = timePart.split(':').map(Number);
  const date = fromIsoDate(datePart);
  date.setHours(hours, minutes);
  return `${DATE_FORMAT.format(date)}, ${TIME_FORMAT.format(date)}`;
}

function formatPeso(value) {
  const amount = Number(value);
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function statusSlug(value) {
  return String(value).toLowerCase().replace(/\s+/g, '-');
}

function todayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function Dialog({ children, className = '', labelledBy, onClose, open }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      className={`dialog ${className}`.trim()}
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget || event.target.closest('[data-dialog-close]')) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

function BookingField({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </>
  );
}

function AdminBookingsPage() {
  const [status, setStatus] = useState('Pending');
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', serviceId: '', date: '' });
  const [page, setPage] = useState(1);
  const [services, setServices] = useState([]);
  const [serviceError, setServiceError] = useState('');
  const [autoCompleteDone, setAutoCompleteDone] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleStatus, setScheduleStatus] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleAvailable, setScheduleAvailable] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [confirmError, setConfirmError] = useState('');
  const [confirmPending, setConfirmPending] = useState(false);
  const [acceptingBookingId, setAcceptingBookingId] = useState(null);
  const [toast, setToast] = useState(null);
  const requestId = useRef(0);
  const availabilityRequestId = useRef(0);
  const searchTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/admin/services').then((items) => {
      if (!Array.isArray(items)) throw new Error('The server returned an invalid services list.');
      if (!cancelled) setServices(items);
    }).catch((error) => {
      if (!cancelled) setServiceError(error.message || 'Unable to load service filters.');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    sendJson(`${API_BASE}/auto-complete`, 'POST', {}).catch((error) => {
      console.warn('Automatic booking completion check failed:', error.message);
    }).finally(() => {
      if (!cancelled) setAutoCompleteDone(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!autoCompleteDone) return undefined;
    let cancelled = false;
    const currentRequest = ++requestId.current;
    const params = new URLSearchParams({ page: String(page), pageSize: '10', status });
    if (filters.search) params.set('search', filters.search);
    if (filters.serviceId) params.set('serviceId', filters.serviceId);
    if (filters.date) params.set('date', filters.date);
    setLoading(true);
    setLoadError('');
    getJson(`${API_BASE}?${params.toString()}`).then((result) => {
      if (cancelled || currentRequest !== requestId.current) return;
      if (!Array.isArray(result.bookings) || !result.counts) {
        throw new Error('The server returned an invalid bookings list.');
      }
      if (result.bookings.length === 0 && result.total > 0 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      setData(result);
    }).catch((error) => {
      if (cancelled || currentRequest !== requestId.current) return;
      setLoadError(error.message || 'Unable to load bookings. Please refresh the page.');
    }).finally(() => {
      if (!cancelled && currentRequest === requestId.current) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [autoCompleteDone, filters, page, refreshVersion, status]);

  useEffect(() => {
    searchTimer.current = window.setTimeout(() => {
      const search = searchInput.trim();
      setFilters((current) => current.search === search ? current : { ...current, search });
      setPage(1);
    }, 300);
    return () => window.clearTimeout(searchTimer.current);
  }, [searchInput]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!scheduleOpen || !viewing || !scheduleDate) return undefined;
    let cancelled = false;
    const currentRequest = ++availabilityRequestId.current;
    setScheduleAvailable(false);
    setScheduleError('');
    setScheduleLoading(true);
    setScheduleStatus('Checking availability...');
    getJson(`${API_BASE}/${viewing.id}/availability?date=${encodeURIComponent(scheduleDate)}`)
      .then((availability) => {
        if (cancelled || currentRequest !== availabilityRequestId.current) return;
        if (!availability.wholeDay) {
          throw new Error('Only full-day Modeling Workshop bookings can be rescheduled here.');
        }
        setScheduleAvailable(Boolean(availability.available));
        setScheduleStatus(availability.available
          ? 'Modeling Workshop is a full-day booking. This date is available.'
          : 'This date is unavailable for a Modeling Workshop.');
      })
      .catch((error) => {
        if (!cancelled && currentRequest === availabilityRequestId.current) {
          setScheduleStatus(error.message || 'Unable to check availability.');
        }
      })
      .finally(() => {
        if (!cancelled && currentRequest === availabilityRequestId.current) setScheduleLoading(false);
      });
    return () => { cancelled = true; };
  }, [scheduleDate, scheduleOpen, viewing]);

  function showToast(message, type = 'success') {
    setToast({ message, type });
  }

  const hasActiveFilters = Boolean(filters.search || filters.serviceId || filters.date);
  const bookings = data?.bookings ?? [];
  const counts = data?.counts ?? {};

  function setFilter(name, value) {
    setFilters((current) => current[name] === value ? current : { ...current, [name]: value });
    setPage(1);
  }

  function clearFilters() {
    setSearchInput('');
    setFilters({ search: '', serviceId: '', date: '' });
    setPage(1);
  }

  async function openView(id) {
    setViewing(null);
    setViewOpen(false);
    try {
      const details = await getJson(`${API_BASE}/${id}`);
      setViewing(details);
      setViewOpen(true);
    } catch (error) {
      showToast(error.message || 'Unable to load booking details.', 'error');
    }
  }

  function openScheduleEditor() {
    if (!viewing?.canReschedule || !viewing.wholeDay) return;
    setScheduleDate(viewing.eventDate);
    setScheduleStatus('');
    setScheduleError('');
    setScheduleOpen(true);
  }

  async function saveSchedule(event) {
    event.preventDefault();
    if (!viewing || !scheduleDate || !scheduleAvailable) {
      setScheduleError(!scheduleDate ? 'Choose a new date.' : 'Choose an available date.');
      return;
    }
    setScheduleError('');
    setScheduleLoading(true);
    try {
      await sendJson(`${API_BASE}/${viewing.id}`, 'PUT', { eventDate: scheduleDate });
      setScheduleOpen(false);
      showToast('Booking schedule updated.');
      setRefreshVersion((current) => current + 1);
      getJson(`${API_BASE}/${viewing.id}`).then(setViewing).catch((error) => {
        showToast(error.message || 'Schedule was updated, but refreshed booking details could not be loaded.', 'error');
      });
    } catch (error) {
      setScheduleError(error.message || 'Unable to update the booking schedule.');
    } finally {
      setScheduleLoading(false);
    }
  }

  function openConfirmation({ title, message, confirmLabel, variant, action, successMessage }) {
    setConfirm({ title, message, confirmLabel, variant, action, successMessage });
    setConfirmError('');
    setConfirmPending(false);
  }

  async function runConfirmed() {
    if (!confirm) return;
    setConfirmPending(true);
    setConfirmError('');
    try {
      await confirm.action();
      setConfirm(null);
      showToast(confirm.successMessage);
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      if (confirm.kind === 'accept' && Array.isArray(error.fieldErrors?.conflicts)) {
        openAcceptConfirmation(
          confirm.booking,
          error.fieldErrors.conflicts,
          'The pending requests changed while you were reviewing. Check the updated list and confirm again.',
        );
      } else {
        setConfirmError(error.message || 'The booking action could not be completed.');
      }
    } finally {
      setConfirmPending(false);
    }
  }

  function openAcceptConfirmation(booking, conflicts, warning = '') {
    const requiredDownpayment = Math.ceil((booking.totalAmount * 100) / 2) / 100;
    const pendingConflictIds = conflicts.map((conflict) => Number(conflict.id));
    const conflictCount = conflicts.length;
    setConfirm({
      kind: 'accept',
      booking,
      conflicts,
      title: 'Accept this booking?',
      message: conflictCount
        ? `Booking #${booking.reference} for ${booking.customerName} on ${formatDate(booking.eventDate)} (${booking.timeLabel}) overlaps ${conflictCount} pending request${conflictCount === 1 ? '' : 's'}. Accepting it will reject the listed request${conflictCount === 1 ? '' : 's'} and email those customers to choose another date or time. The customer for this booking can then pay the 50% downpayment of ${formatPeso(requiredDownpayment)}.`
        : `Booking #${booking.reference} for ${booking.customerName} on ${formatDate(booking.eventDate)} (${booking.timeLabel}) will be accepted. The customer can then pay the 50% downpayment of ${formatPeso(requiredDownpayment)}.`,
      confirmLabel: conflictCount ? 'Accept and decline conflicts' : 'Accept booking',
      variant: 'success',
      action: () => sendJson(`${API_BASE}/${booking.id}`, 'PUT', {
        status: 'To Pay',
        pendingConflictIds,
      }),
      successMessage: `Booking #${booking.reference} was accepted.${conflictCount ? ` ${conflictCount} conflicting request${conflictCount === 1 ? ' was' : 's were'} declined.` : ''}`,
    });
    setConfirmError(warning);
    setConfirmPending(false);
  }

  async function acceptBooking(booking) {
    setAcceptingBookingId(booking.id);
    try {
      const { conflicts } = await getJson(`${API_BASE}/${booking.id}/acceptance-conflicts`);
      if (!Array.isArray(conflicts)) throw new Error('The server returned an invalid conflict list.');
      openAcceptConfirmation(booking, conflicts);
    } catch (error) {
      showToast(error.message || 'Unable to check for conflicting requests.', 'error');
    } finally {
      setAcceptingBookingId(null);
    }
  }

  function declineBooking(booking) {
    openConfirmation({
      title: 'Decline this booking?',
      message: `Booking #${booking.reference} from ${booking.customerName} on ${formatDate(booking.eventDate)} will be marked as Rejected. You can still move it back to Pending later.`,
      confirmLabel: 'Decline booking',
      variant: 'danger-solid',
      action: () => sendJson(`${API_BASE}/${booking.id}`, 'PUT', { status: 'Rejected' }),
      successMessage: `Booking #${booking.reference} was declined.`,
    });
  }

  function deleteBooking(booking) {
    const notes = [];
    if (booking.amountPaid > 0) notes.push(`The ${formatPeso(booking.amountPaid)} in recorded payments for this booking will be deleted too.`);
    if (booking.pendingPayments > 0) notes.push('Its payment waiting for review will be deleted too.');
    const paymentNote = notes.length ? ` ${notes.join(' ')}` : '';
    openConfirmation({
      title: 'Delete this booking?',
      message: `Booking #${booking.reference} for ${booking.customerName} (${formatDate(booking.eventDate)}) will be permanently deleted.${paymentNote} This can't be undone.`,
      confirmLabel: 'Delete booking',
      variant: 'danger-solid',
      action: () => deleteRequest(`${API_BASE}/${booking.id}`),
      successMessage: `Booking #${booking.reference} was deleted.`,
    });
  }

  function openContract(id) {
    window.open(`${CONTRACT_PAGE}?id=${id}&from=admin`, '_blank', 'noopener');
  }

  function bookingAction(event, booking) {
    const action = event.currentTarget.dataset.action;
    if (action === 'view') void openView(booking.id);
    else if (action === 'contract') openContract(booking.id);
    else if (action === 'delete') deleteBooking(booking);
    else if (action === 'accept') void acceptBooking(booking);
    else if (action === 'decline') declineBooking(booking);
  }

  const firstItem = data && bookings.length ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastItem = firstItem + bookings.length - 1;

  return (
    <AdminLayout activePage="bookings" title="All Bookings | BRB Studios Admin">
      <main className="admin-main">
        <header className="page-header">
          <p className="page-header__eyebrow">Operations</p>
          <h1 className="page-header__title">All Bookings</h1>
          <p className="page-header__subtitle">Accept requests, follow payments and manage every booking in one place.</p>
        </header>

        <section className="panel filter-bar" aria-label="Search and filters">
          <label className="search-field">
            <span className="visually-hidden">Search by customer or reference</span>
            <span className="search-field__icon" aria-hidden="true"></span>
            <input
              className="field__input search-field__input"
              type="search"
              placeholder="Search customer or reference"
              autoComplete="off"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <label className="filter-bar__item">
            <span className="visually-hidden">Service</span>
            <select className="field__input" value={filters.serviceId} onChange={(event) => setFilter('serviceId', event.target.value)}>
              <option value="">All Services</option>
              {services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}
            </select>
          </label>
          <label className="filter-bar__item">
            <span className="visually-hidden">Event date</span>
            <input className="field__input" type="date" value={filters.date} onChange={(event) => setFilter('date', event.target.value)} />
          </label>
          {hasActiveFilters && <button className="filter-bar__clear" type="button" onClick={clearFilters}>Clear filters</button>}
        </section>
        {serviceError && <p className="status-message" role="alert">{serviceError}</p>}

        <div className="status-tabs" role="group" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => {
            const active = tab === status;
            return (
              <button
                className={`status-tab${active ? ' status-tab--active' : ''}${tab === 'Pending' && counts.Pending > 0 ? ' status-tab--attention' : ''}`}
                type="button"
                key={tab}
                aria-pressed={active}
                onClick={() => {
                  setStatus(tab);
                  setPage(1);
                }}
              >
                {tab}<span className="status-tab__count">{counts[tab] ?? 0}</span>
              </button>
            );
          })}
        </div>

        {bookings.length > 0 && (
          <div className="table-wrap">
            <table className="data-table bookings-table" aria-label="Bookings">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Service</th>
                  <th scope="col">Date and Time</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking, index) => {
                  const previous = bookings[index - 1];
                  const percent = booking.totalAmount > 0 ? Math.round((booking.amountPaid / booking.totalAmount) * 100) : 0;
                  return (
                    <Fragment key={booking.id}>
                      {booking.group !== previous?.group && (
                        <tr className="group-row">
                          <th scope="colgroup" colSpan="6">
                            <span className="group-row__label">{GROUP_LABELS[booking.group] || booking.group}</span>
                            <span className="group-row__count">{counts[status] ?? 0}</span>
                          </th>
                        </tr>
                      )}
                      <tr className={`data-row${booking.status === 'Pending' ? ' data-row--pending' : ''}`} data-booking-id={booking.id}>
                        <td className="bookings-table__customer">
                          <strong className="bookings-table__name">{booking.customerName}</strong>
                          <span className="bookings-table__reference">#{booking.reference}</span>
                        </td>
                        <td className="bookings-table__services">
                          {booking.services.map((service) => <span className="bookings-table__service" key={service}>{service}</span>)}
                        </td>
                        <td className="bookings-table__when">
                          <span className="bookings-table__date">{formatDate(booking.eventDate)}</span>
                          <span className="bookings-table__time">{booking.timeLabel}</span>
                        </td>
                        <td className="bookings-table__payment">
                          <span className="bookings-table__amounts">{formatPeso(booking.amountPaid)} / {formatPeso(booking.totalAmount)}</span>
                          <div className="progress"><div className="progress__bar" style={{ '--percent': `${percent}%` }}></div></div>
                          <span className="bookings-table__payment-label">{booking.paymentLabel}</span>
                          {booking.pendingPayments > 0 && <Link className="bookings-table__review-link" to="/admin/html/payments.html">Payment to review</Link>}
                        </td>
                        <td className="bookings-table__status">
                          <span className={`pill pill--${statusSlug(booking.status)}`}>{booking.status}</span>
                          {booking.status === 'Pending' && (
                            <div className="quick-actions">
                              <button className="btn btn--sm btn--success" type="button" data-action="accept" disabled={acceptingBookingId === booking.id} onClick={(event) => bookingAction(event, booking)}>
                                {acceptingBookingId === booking.id ? 'Checking...' : 'Accept'}
                              </button>
                              <button className="btn btn--sm btn--danger" type="button" data-action="decline" onClick={(event) => bookingAction(event, booking)}>Decline</button>
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="row-actions row-actions--nowrap">
                            <button className="btn btn--sm" type="button" data-action="view" aria-label={`View booking #${booking.reference}`} onClick={(event) => bookingAction(event, booking)}>
                              <span className="btn__icon btn__icon--eye" aria-hidden="true"></span>View
                            </button>
                            <button className="icon-button icon-button--contract" type="button" data-action="contract" title="Contract" aria-label={`Contract for booking #${booking.reference}`} onClick={(event) => bookingAction(event, booking)}></button>
                            <button className="icon-button icon-button--danger icon-button--delete" type="button" data-action="delete" title="Delete" aria-label={`Delete booking #${booking.reference}`} onClick={(event) => bookingAction(event, booking)}></button>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {loading && <p className="status-message bookings-status" role="status">Loading bookings...</p>}
        {!loading && loadError && <p className="status-message bookings-status" role="alert">{loadError}</p>}
        {!loading && !loadError && bookings.length === 0 && (
          <p className="status-message bookings-status" role="status">
            {hasActiveFilters ? 'No bookings match your search or filters.' : `There are no ${status.toLowerCase()} bookings yet.`}
          </p>
        )}

        {!loading && !loadError && bookings.length > 0 && (
          <footer className="pagination">
            <p className="pagination__summary">Showing {firstItem}–{lastItem} of {data.total}</p>
            <div className="pagination__buttons">
              <button className="btn" type="button" disabled={data.page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
              <button className="btn btn--lg" type="button" disabled={lastItem >= data.total} onClick={() => setPage((current) => current + 1)}>View Next</button>
            </div>
          </footer>
        )}
      </main>

      <Dialog className="dialog--wide" labelledBy="viewTitle" open={viewOpen} onClose={() => setViewOpen(false)}>
        <div className="dialog__form">
          <header className="dialog__header">
            <div>
              <p className="dialog__eyebrow">{viewing ? `Booking #${viewing.reference}` : 'Booking details'}</p>
              <h2 className="dialog__title" id="viewTitle">{viewing?.customer?.name || 'Booking'}</h2>
            </div>
            {viewing && <span className={`pill pill--${statusSlug(viewing.status)}`}>{viewing.status}</span>}
          </header>
          {viewing && (
            <>
              <div className="view-grid">
                <section>
                  <h3 className="view-section__title">Customer</h3>
                  <dl className="detail-list">
                    <BookingField label="Email" value={viewing.customer.email} />
                    <BookingField label="Contact" value={viewing.customer.contactNumber} />
                    <BookingField label="Booked on" value={formatDateTime(viewing.createdAt)} />
                  </dl>
                </section>
                <section>
                  <h3 className="view-section__title">Schedule</h3>
                  <dl className="detail-list">
                    <BookingField label="Date" value={formatLongDate(viewing.eventDate)} />
                    <BookingField label="Time" value={viewing.timeLabel} />
                    <BookingField label="Address" value={viewing.eventAddress} />
                  </dl>
                </section>
              </div>
              {viewing.canReschedule && viewing.wholeDay && (
                <div className="dialog__actions">
                  <button className="btn" type="button" onClick={openScheduleEditor}>Edit schedule</button>
                </div>
              )}
              <section>
                <h3 className="view-section__title">Services and payment</h3>
                <table className="mini-table">
                  <tbody>
                    {viewing.services.map((service) => (
                      <tr key={service.id}><td>{service.name}</td><td>{formatPeso(service.price)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td>Subtotal</td><td>{formatPeso(viewing.subtotal)}</td></tr>
                    {viewing.discountAmount > 0 && (
                      <tr><td>{viewing.voucherCode ? `Discount (${viewing.voucherCode})` : 'Discount'}</td><td>-{formatPeso(viewing.discountAmount)}</td></tr>
                    )}
                    <tr className="mini-table__total"><td>Total</td><td>{formatPeso(viewing.totalAmount)}</td></tr>
                    <tr><td>Paid so far</td><td>{formatPeso(viewing.amountPaid)}</td></tr>
                    <tr><td>Balance · {viewing.paymentLabel}</td><td>{formatPeso(viewing.balance)}</td></tr>
                  </tfoot>
                </table>
              </section>
              <section>
                <h3 className="view-section__title">Payment history</h3>
                {viewing.payments.length > 0 ? (
                  <ul className="payment-history">
                    {viewing.payments.map((payment) => {
                      const meta = [
                        payment.method,
                        payment.referenceNumber && `Ref ${payment.referenceNumber}`,
                        payment.recordedBy === 'Admin' ? 'Recorded by admin' : 'Submitted by customer',
                        formatDateTime(payment.submittedAt),
                      ].filter(Boolean).join(' · ');
                      return (
                        <li className="payment-history__item" key={payment.id}>
                          <div>
                            <strong>{payment.type}: {formatPeso(payment.amount)}</strong>
                            <span className="payment-history__meta">{meta}</span>
                          </div>
                          <span className={`pill pill--${statusSlug(payment.status)}`}>{payment.status}</span>
                          {payment.proofUrl && (
                            <a className="payment-history__link" href={payment.proofUrl} target="_blank" rel="noopener noreferrer">View proof</a>
                          )}
                          {payment.rejectReason && <p className="payment-history__reason">Rejected: {payment.rejectReason}</p>}
                          {payment.note && <p className="payment-history__meta">Note: {payment.note}</p>}
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="status-message">No payments yet.</p>}
              </section>
              <div className="dialog__actions">
                <button className="btn" type="button" data-dialog-close>Close</button>
                <button className="btn" type="button" onClick={() => openContract(viewing.id)}>
                  <span className="btn__icon btn__icon--file" aria-hidden="true"></span>Contract
                </button>
              </div>
            </>
          )}
        </div>
      </Dialog>

      <Dialog labelledBy="scheduleDialogTitle" open={scheduleOpen} onClose={() => setScheduleOpen(false)}>
        <form className="dialog__form" noValidate onSubmit={(event) => void saveSchedule(event)}>
          <h2 className="dialog__title" id="scheduleDialogTitle">Edit booking schedule</h2>
          <div className="field">
            <label className="field__label" htmlFor="bookingScheduleDate">New date</label>
            <input
              className="field__input"
              id="bookingScheduleDate"
              name="eventDate"
              type="date"
              min={todayIso()}
              required
              value={scheduleDate}
              onChange={(event) => setScheduleDate(event.target.value)}
            />
          </div>
          <p className="status-message" role="status">{scheduleStatus}</p>
          {scheduleError && <p className="alert alert--error" role="alert">{scheduleError}</p>}
          <div className="dialog__actions">
            <button className="btn" type="button" data-dialog-close disabled={scheduleLoading}>Cancel</button>
            <button className="btn btn--primary" type="submit" disabled={scheduleLoading || !scheduleAvailable}>
              {scheduleLoading ? 'Checking...' : 'Save schedule'}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog labelledBy="confirmTitle" open={Boolean(confirm)} onClose={() => setConfirm(null)}>
        {confirm && (
          <div className="dialog__form">
            <h2 className="dialog__title" id="confirmTitle">{confirm.title}</h2>
            <p className="dialog__text">{confirm.message}</p>
            {confirm.conflicts?.length > 0 && (
              <ul className="dialog__conflicts">
                {confirm.conflicts.map((conflict) => (
                  <li key={conflict.id}>
                    Booking #{conflict.reference} — {conflict.customerName}, {formatDate(conflict.eventDate)} · {conflict.startTime}–{conflict.endTime}
                  </li>
                ))}
              </ul>
            )}
            {confirmError && <p className="alert alert--error" role="alert">{confirmError}</p>}
            <div className="dialog__actions">
              <button className="btn" type="button" data-dialog-close disabled={confirmPending}>Cancel</button>
              <button className={`btn btn--${confirm.variant}`} type="button" disabled={confirmPending} onClick={() => void runConfirmed()}>
                {confirmPending ? 'Please wait...' : confirm.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </Dialog>
      {toast && <p className={`toast${toast.type === 'error' ? ' toast--error' : ''}`} role="status">{toast.message}</p>}
    </AdminLayout>
  );
}

export default AdminBookingsPage;
