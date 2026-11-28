import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AccountLayout from '../components/AccountLayout.jsx';
import { getJson, postJson } from '../lib/api.js';
import { getBusinessDate, getBusinessDateOffset } from '../lib/businessDate.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat'];

function formatDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPeso(amount) {
  const value = Number(amount);
  const digits = Number.isInteger(value) ? 0 : 2;
  return `₱ ${value.toLocaleString('en-PH', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function formatTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

function ServiceConflictDialog({ onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="service-conflict-dialog"
      aria-labelledby="serviceConflictTitle"
      aria-describedby="serviceConflictMessage"
      onClose={onClose}
    >
      <div className="service-conflict-dialog__content">
        <span className="service-conflict-dialog__icon" aria-hidden="true">!</span>
        <h2 className="service-conflict-dialog__title" id="serviceConflictTitle">Services can&apos;t be combined</h2>
        <p className="service-conflict-dialog__text" id="serviceConflictMessage">
          Modeling Workshop is a full-day service and must be booked by itself. Please remove it or choose another service.
        </p>
        <button
          className="service-conflict-dialog__button"
          type="button"
          onClick={() => dialogRef.current?.close()}
        >
          Got it
        </button>
      </div>
    </dialog>
  );
}

export default function BookServicePage() {
  const navigate = useNavigate();
  const requestedDate = new URLSearchParams(window.location.search).get('date');
  const requestedService = Number(new URLSearchParams(window.location.search).get('service'));
  const [customer, setCustomer] = useState(null);
  const [services, setServices] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [serviceConflictDialogOpen, setServiceConflictDialogOpen] = useState(false);
  const [serviceStatus, setServiceStatus] = useState('Loading services...');
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(() => (
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate >= getBusinessDateOffset(2)
      ? requestedDate
      : ''
  ));
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate >= getBusinessDateOffset(2)) {
      const [year, month] = requestedDate.split('-').map(Number);
      return new Date(year, month - 1, 1);
    }
    const earliestBookingDate = getBusinessDateOffset(2);
    const [year, month] = earliestBookingDate.split('-').map(Number);
    return new Date(year, month - 1, 1);
  });
  const [blockedDates, setBlockedDates] = useState([]);
  const [bookedDates, setBookedDates] = useState([]);
  const [calendarStatus, setCalendarStatus] = useState('');
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [pendingReservations, setPendingReservations] = useState([]);
  const [wholeDay, setWholeDay] = useState(false);
  const [dayAvailable, setDayAvailable] = useState(false);
  const [durationHours, setDurationHours] = useState(0);
  const [slotStatus, setSlotStatus] = useState('Choose services and a date to see available times.');
  const [scheduleError, setScheduleError] = useState('');
  const [hoursNote, setHoursNote] = useState('');
  const [voucher, setVoucher] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [voucherMessage, setVoucherMessage] = useState('');
  const [voucherError, setVoucherError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [working, setWorking] = useState(false);
  const availabilityRequest = useRef(0);
  const monthRequest = useRef(0);
  const serviceIdsKey = [...selectedIds].sort((a, b) => a - b).join(',');
  const selectedServices = useMemo(
    () => services.filter((service) => selectedIds.has(service.id)),
    [services, selectedIds],
  );
  const workshopSelected = selectedServices.some((service) => /modeling workshop/i.test(service.name));
  const regularSelected = selectedServices.some((service) => !/modeling workshop/i.test(service.name));
  const subtotal = selectedServices.reduce((sum, service) => sum + Number(service.price), 0);
  const total = subtotal - discountAmount;
  const monthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;
  const today = getBusinessDate();
  const earliestBookingDate = getBusinessDateOffset(2);
  const currentMonth = today.slice(0, 7);
  const days = Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, index) => index + 1);
  const firstWeekday = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      let session;
      try {
        session = await getJson('/api/auth/me');
      } catch {
        if (!cancelled) navigate('/customer/html/login.html', { replace: true });
        return;
      }
      if (!session.ok || !session.data?.customer) {
        navigate('/customer/html/login.html', { replace: true });
        return;
      }
      if (cancelled) return;
      setCustomer(session.data.customer);

      try {
        const [serviceResponse, hoursResponse] = await Promise.all([
          getJson('/api/services'),
          getJson('/api/calendar/hours').catch(() => ({ ok: false, data: {} })),
        ]);
        if (cancelled) return;
        if (!serviceResponse.ok || !Array.isArray(serviceResponse.data)) {
          setServiceStatus('Services could not be loaded. Please refresh the page.');
        } else if (serviceResponse.data.length === 0) {
          setServiceStatus('No services are available right now.');
        } else {
          setServices(serviceResponse.data);
          setSelectedIds(new Set(serviceResponse.data.some((service) => service.id === requestedService) ? [requestedService] : []));
          setServiceStatus('');
        }
        setHoursNote(hoursResponse.ok
          ? `Studio hours: ${formatTime(hoursResponse.data.open)} - ${formatTime(hoursResponse.data.close)}.`
          : 'Studio hours could not be loaded.');
      } catch {
        if (!cancelled) setServiceStatus('Unable to reach the server. Please check your connection and try again.');
      }
    }
    initialize();
    return () => { cancelled = true; };
  }, [navigate, requestedService]);

  useEffect(() => {
    let cancelled = false;
    const request = ++monthRequest.current;
    setCalendarLoading(true);
    setCalendarStatus('');
    getJson(`/api/calendar/month?month=${monthKey}`).then(({ ok, data }) => {
      if (cancelled || request !== monthRequest.current) return;
      if (!ok || !Array.isArray(data.blockedDates) || !Array.isArray(data.bookedDates)) {
        throw new Error('Unavailable dates could not be loaded.');
      }
      setBlockedDates(data.blockedDates);
      setBookedDates(data.bookedDates);
    }).catch(() => {
      if (!cancelled && request === monthRequest.current) {
        setBlockedDates([]);
        setBookedDates([]);
        setCalendarStatus('Unavailable dates could not be loaded.');
      }
    }).finally(() => {
      if (!cancelled && request === monthRequest.current) setCalendarLoading(false);
    });
    return () => { cancelled = true; };
  }, [monthKey]);

  useEffect(() => {
    const request = ++availabilityRequest.current;
    setSlots([]);
    setSelectedSlot(null);
    setPendingReservations([]);
    setWholeDay(false);
    setDayAvailable(false);
    setDurationHours(0);
    setScheduleError('');

    if (!date || selectedIds.size === 0) {
      setSlotStatus('Choose services and a date to see available times.');
      return undefined;
    }

    setSlotStatus('Checking available slots...');
    const params = new URLSearchParams({ date, serviceIds: serviceIdsKey });
    getJson(`/api/bookings/availability?${params}`).then(({ ok, data }) => {
      if (request !== availabilityRequest.current) return;
      if (!ok) throw new Error(data.message || 'Could not load available slots.');
      setSlots(data.slots ?? []);
      setPendingReservations(data.pendingReservations ?? []);
      setWholeDay(Boolean(data.wholeDay));
      setDayAvailable(Boolean(data.available));
      setDurationHours(data.durationHours ?? 0);
      setSlotStatus(data.wholeDay
        ? (data.available ? 'Modeling Workshop is a full-day booking. No time selection is needed.' : 'This date is unavailable for a Modeling Workshop.')
        : (data.slots?.length
          ? `Available slots for ${data.durationHours} hour${data.durationHours === 1 ? '' : 's'}:`
          : 'No time slots are available for the selected services on this date. Please choose another date.'));
    }).catch((error) => {
      if (request === availabilityRequest.current) setSlotStatus(error.message || 'Unable to load available slots. Please try again.');
    });
    return undefined;
  }, [date, serviceIdsKey, selectedIds.size]);

  function toggleService(serviceId) {
    const service = services.find((item) => item.id === serviceId);
    if (!service) return;

    const isSelected = selectedIds.has(serviceId);
    const isWorkshop = /modeling workshop/i.test(service.name);
    if (!isSelected && ((isWorkshop && regularSelected) || (!isWorkshop && workshopSelected))) {
      setServiceConflictDialogOpen(true);
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
    setDiscountAmount(0);
    setVoucherCode('');
    setVoucher('');
    setVoucherMessage('');
  }

  function selectDate(value) {
    setDate(value);
    setSelectedSlot(null);
  }

  function goToStep(nextStep) {
    setStep(nextStep);
    setScheduleError('');
    if (nextStep === 3) {
      setVoucherMessage('');
      setVoucherError('');
    }
    window.scrollTo({ top: 0 });
  }

  function continueToSummary() {
    if (!date) {
      setScheduleError('Please choose a date for your booking.');
      return;
    }
    if (date < earliestBookingDate) {
      setScheduleError('Choose a date at least two days from today.');
      return;
    }
    if (wholeDay && !dayAvailable) {
      setScheduleError('Choose an available date for the Modeling Workshop.');
      return;
    }
    if (!wholeDay && !selectedSlot) {
      setScheduleError('Choose an available time slot.');
      return;
    }
    goToStep(3);
  }

  async function applyVoucher() {
    const code = voucher.trim().toUpperCase();
    setVoucherError('');
    setVoucherMessage('');
    if (!code) {
      setVoucherError('Enter a voucher code.');
      return;
    }
    setWorking(true);
    try {
      const response = await postJson('/api/bookings/validate-voucher', { voucherCode: code, subtotal });
      if (!response.ok) {
        setVoucherError(response.data.errors?.voucherCode || response.data.message || 'Invalid voucher code.');
        return;
      }
      setDiscountAmount(response.data.discountAmount);
      setVoucherCode(response.data.voucherCode);
      setVoucher(response.data.voucherCode);
      setVoucherMessage(`Voucher applied! You save ${formatPeso(response.data.discountAmount)}.`);
    } catch {
      setVoucherError('Unable to reach the server.');
    } finally {
      setWorking(false);
    }
  }

  async function submitBooking() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        serviceIds: [...selectedIds],
        eventDate: date,
        ...(wholeDay ? {} : { startTime: selectedSlot?.startTime }),
        voucherCode,
      };
      const response = await postJson('/api/bookings', payload);
      if (response.ok) {
        setRequestSent(true);
        return;
      }
      if (response.status === 401) {
        navigate('/customer/html/login.html', { replace: true });
        return;
      }
      if (response.data.errors?.voucherCode) setVoucherError(response.data.errors.voucherCode);
      else setSubmitError(Object.values(response.data.errors ?? {})[0] || response.data.message || 'Something went wrong. Please try again.');
    } catch {
      setSubmitError('Unable to reach the server. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const steps = ['Choose a service', 'Pick a date and time', 'Booking Summary'];
  const selectedStart = selectedSlot ? Number(selectedSlot.startTime.slice(0, 2)) * 60 + Number(selectedSlot.startTime.slice(3, 5)) : 0;
  const reservationConflicts = pendingReservations.filter((reservation) => (
    selectedSlot
    && selectedStart < reservation.endMinute
    && selectedStart + durationHours * 60 > reservation.startMinute
  ));

  return (
    <AccountLayout activePage="book-service" customer={customer} title="Book a Service | BRB Studios">
      {serviceConflictDialogOpen && (
        <ServiceConflictDialog onClose={() => setServiceConflictDialogOpen(false)} />
      )}
      <div className="booking">
        <h1 className="booking__title">{steps[step - 1]}</h1>
        <p className="booking__subtitle">
          {step === 1
            ? 'You can book multiple services at once.'
            : step === 2
              ? 'Choose a date and an available service-length slot'
              : 'Check all details before submitting'}
        </p>

        <ol className="stepper" aria-label="Booking progress">
          {steps.map((label, index) => {
            const number = index + 1;
            return (
              <li className={`stepper__step${number <= step ? ' is-reached' : ''}`} key={label}>
                <button className="stepper__dot" type="button" disabled={number > step} aria-label={`Go to ${label}`} aria-current={number === step ? 'step' : undefined} onClick={() => goToStep(number)}>
                  {number}
                </button>
              </li>
            );
          })}
          <li className="stepper__step stepper__step--locked">
            <span className="stepper__dot stepper__dot--lock" role="img" aria-label="Payment step, locked until the studio accepts your request"></span>
          </li>
        </ol>

        {requestSent ? (
          <div className="sent">
            <span className="sent__icon" aria-hidden="true"></span>
            <h2 className="sent__title">Booking Request Sent!</h2>
            <p className="sent__text">We'll notify you once your booking is confirmed for the downpayment process.</p>
            <Link className="btn-primary sent__link" to="/customer/html/my-bookings.html">Go to My Bookings</Link>
          </div>
        ) : step === 1 ? (
          <section className="booking-step">
            {serviceStatus && <p className="booking-step__status" role="status">{serviceStatus}</p>}
            <ul className="service-options">
              {services.map((service) => {
                return (
                  <li key={service.id}>
                    <label className="service-option">
                      <input className="service-option__input" type="checkbox" checked={selectedIds.has(service.id)} onChange={() => toggleService(service.id)} />
                      <span className="service-option__card">
                        <span className="service-option__media">
                          {service.imageUrl && <img className="service-option__image" src={service.imageUrl} alt={service.name} />}
                        </span>
                        <span className="service-option__info">
                          <span className="service-option__name">{service.name}</span>
                          <span className="service-option__price-label">Price:</span>
                          <span className="service-option__price">{formatPeso(service.price)}</span>
                          <span className="service-option__duration">{service.durationHours === null ? 'Full day' : `${service.durationHours} hour${service.durationHours === 1 ? '' : 's'}`}</span>
                        </span>
                        <span className="service-option__check" aria-hidden="true"></span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <footer className="booking-step__footer booking-step__footer--end">
              <button className="btn-primary" type="button" disabled={!selectedIds.size || Boolean(serviceStatus)} onClick={() => goToStep(2)}>Continue</button>
            </footer>
          </section>
        ) : step === 2 ? (
          <section className="booking-step">
            {scheduleError && <p className="form-alert form-alert--error" role="alert">{scheduleError}</p>}
            <div className="schedule">
              <div className="schedule__date">
                <h2 className="schedule__label">Pick a date</h2>
                <div className="calendar">
                  <div className="calendar__header">
                    <button className="calendar__nav calendar__nav--prev" type="button" aria-label="Previous month" disabled={monthKey === currentMonth} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}></button>
                    <p className="calendar__month" aria-live="polite">{calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                    <button className="calendar__nav calendar__nav--next" type="button" aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}></button>
                  </div>
                  <div className="calendar__weekdays" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
                  <div className="calendar__days">
                    {Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} />)}
                    {days.map((day) => {
                      const iso = `${monthKey}-${String(day).padStart(2, '0')}`;
                      const past = iso < earliestBookingDate;
                      const blocked = blockedDates.includes(iso);
                      const booked = bookedDates.includes(iso);
                      const selected = date === iso;
                      return (
                        <button
                          className={['calendar__day', past && 'is-past', blocked && 'is-blocked', booked && 'is-booked', selected && 'is-selected'].filter(Boolean).join(' ')}
                          type="button"
                          key={iso}
                          data-date={iso}
                          disabled={calendarLoading || past || blocked}
                          aria-label={booked ? `${formatDate(iso)}, has bookings; available times may be limited` : undefined}
                          aria-pressed={selected}
                          onClick={() => selectDate(iso)}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  <p className="calendar__legend">Bookings start {formatDate(earliestBookingDate)}. Marked dates have bookings; select a date to see available times.</p>
                  {calendarStatus && <p className="calendar__status" role="status">{calendarStatus}</p>}
                </div>
              </div>
              <div className="schedule__time">
                <h2 className="schedule__label">Available time slots</h2>
                <p className="schedule__hours">{hoursNote}</p>
                {workshopSelected && <p className="form-alert form-alert--error" role="status">Modeling Workshop is a full-day booking.</p>}
                <p className="schedule__slot-status" role="status">{slotStatus}</p>
                {slots.length > 0 && !wholeDay && (
                  <div className="schedule__slots" role="group" aria-label="Available time slots">
                    {slots.map((slot) => (
                      <button className={`schedule__slot${selectedSlot?.startTime === slot.startTime ? ' schedule__slot--selected' : ''}`} type="button" key={slot.startTime} aria-pressed={selectedSlot?.startTime === slot.startTime} onClick={() => setSelectedSlot(slot)}>{slot.label}</button>
                    ))}
                  </div>
                )}
                {reservationConflicts.length > 0 && (
                  <div className="schedule__booked" role="status">
                    <p className="schedule__booked-title">
                      {reservationConflicts.length === 1 ? 'Another customer has also booked this time; their request is only waiting for admin approval.' : 'Other customers have also booked this time; their requests are only waiting for admin approval.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <footer className="booking-step__footer">
              <button className="booking-step__back" type="button" onClick={() => goToStep(1)}>Back</button>
              <button className="btn-primary" type="button" disabled={!date || (wholeDay ? !dayAvailable : !selectedSlot)} onClick={continueToSummary}>Continue</button>
            </footer>
          </section>
        ) : (
          <section className="booking-step">
            {requestSent ? (
              <div className="sent">
                <span className="sent__icon" aria-hidden="true"></span>
                <h2 className="sent__title">Booking Request Sent!</h2>
                <p className="sent__text">We'll notify you once your booking is confirmed for the downpayment process.</p>
                <Link className="btn-primary sent__link" to="/customer/html/my-bookings.html">Go to My Bookings</Link>
              </div>
            ) : (
              <>
                {submitError && <p className="form-alert form-alert--error" role="alert">{submitError}</p>}
                <dl className="summary__list">
                  <div className="summary__row"><dt>Services:</dt><dd><ul className="summary__services">{selectedServices.map((service) => <li key={service.id}>{service.name}</li>)}</ul></dd></div>
                  <div className="summary__row"><dt>Date:</dt><dd>{date ? formatDate(date) : '—'}</dd></div>
                  <div className="summary__row"><dt>Time:</dt><dd>{wholeDay ? 'Full day' : selectedSlot?.label || '—'}</dd></div>
                </dl>
                <div className="summary__voucher">
                  <label className="summary__voucher-label" htmlFor="voucherInput">Voucher</label>
                  <div className="summary__voucher-row">
                    <input className="summary__voucher-input" id="voucherInput" value={voucher} onChange={(event) => setVoucher(event.target.value)} placeholder="Enter code" maxLength={30} disabled={Boolean(voucherCode) || working} />
                    <button className="summary__voucher-btn" type="button" onClick={applyVoucher} disabled={Boolean(voucherCode) || working}>{voucherCode ? 'Applied' : working ? 'Checking...' : 'Apply'}</button>
                  </div>
                  {voucherError && <p className="form-alert form-alert--error summary__voucher-alert" role="alert">{voucherError}</p>}
                  {voucherMessage && <p className="form-alert form-alert--success summary__voucher-alert" role="status">{voucherMessage}</p>}
                </div>
                <div className="summary__breakdown">
                  <p className="summary__breakdown-row"><span>Subtotal</span><span>{formatPeso(subtotal)}</span></p>
                  <p className="summary__breakdown-row"><span>Discount</span><span>{discountAmount > 0 ? `−${formatPeso(discountAmount)}` : '—'}</span></p>
                </div>
                <p className="summary__total"><span className="summary__total-label">Total:</span><span className="summary__total-value">{formatPeso(total)}</span></p>
              </>
            )}
            <footer className="booking-step__footer">
              {!requestSent && <button className="booking-step__back" type="button" onClick={() => goToStep(2)}>Back</button>}
              {!requestSent && <button className="btn-primary" type="button" disabled={submitting} onClick={submitBooking}>{submitting ? 'Submitting...' : 'Submit Booking Request'}</button>}
            </footer>
          </section>
        )}
      </div>
    </AccountLayout>
  );
}
