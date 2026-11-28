import { useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { deleteRequest, getJson, sendJson } from '../lib/adminApi.js';

const API_BASE = '/api/admin/calendar';
const MONTH_TITLE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const LONG_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const SHORT_MONTH_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short' });
const MONTH_NAMES = Array.from({ length: 12 }, (_, index) => SHORT_MONTH_FORMAT.format(new Date(2000, index, 1)));

const pad = (value) => String(value).padStart(2, '0');
const toIsoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function fromIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLongDate(value) {
  return LONG_DATE_FORMAT.format(fromIsoDate(value));
}

function formatHour(hour) {
  return `${hour % 12 || 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
}

function isValidArray(value) {
  return Array.isArray(value);
}

export default function AdminCalendarPage() {
  const now = new Date();
  const today = toIsoDate(now);
  const [displayMonth, setDisplayMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [bookedDates, setBookedDates] = useState([]);
  const [blockedDates, setBlockedDates] = useState([]);
  const [blockedDateList, setBlockedDateList] = useState([]);
  const [day, setDay] = useState(null);
  const [dayError, setDayError] = useState('');
  const [bookingHours, setBookingHours] = useState(null);
  const [hoursError, setHoursError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(now.getFullYear());
  const [blockConfirmation, setBlockConfirmation] = useState(false);
  const [toast, setToast] = useState(null);
  const pickerRef = useRef(null);
  const pickerGridRef = useRef(null);
  const blockDialogRef = useRef(null);
  const latestDayRequest = useRef(0);

  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();
  const monthKey = `${year}-${pad(month + 1)}`;
  const bookedDateSet = useMemo(() => new Set(bookedDates), [bookedDates]);
  const blockedDateSet = useMemo(() => new Set(blockedDates), [blockedDates]);
  const selectedIsPast = Boolean(selectedDate && selectedDate < today);

  useEffect(() => {
    let cancelled = false;
    getJson(`${API_BASE}/month?month=${monthKey}`)
      .then((overview) => {
        if (!isValidArray(overview.bookedDates) || !isValidArray(overview.blockedDates)) {
          throw new Error('The server returned an invalid calendar overview.');
        }
        if (!cancelled) {
          setBookedDates(overview.bookedDates);
          setBlockedDates(overview.blockedDates);
        }
      })
      .catch((error) => {
        if (!cancelled) setToast({ message: error.message || 'Unable to load the calendar.', type: 'error' });
      });

    return () => { cancelled = true; };
  }, [monthKey, refreshKey]);

  useEffect(() => {
    if (!selectedDate) {
      latestDayRequest.current += 1;
      setDay(null);
      setDayError('');
      return undefined;
    }

    const requestId = ++latestDayRequest.current;
    let cancelled = false;
    setDay(null);
    setDayError('');

    getJson(`${API_BASE}/day?date=${selectedDate}`)
      .then((dayDetails) => {
        if (cancelled || requestId !== latestDayRequest.current) return;
        if (
          !isValidArray(dayDetails.bookings)
          || !isValidArray(dayDetails.busyIntervals)
          || !isValidArray(dayDetails.blockedTimes)
        ) {
          throw new Error('The server returned invalid availability details.');
        }
        setDay(dayDetails);
      })
      .catch((error) => {
        if (cancelled || requestId !== latestDayRequest.current) return;
        setDayError(error.message || 'Unable to load bookings for this date.');
      });

    return () => { cancelled = true; };
  }, [selectedDate, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    getJson(`${API_BASE}/blocked-dates`)
      .then((dates) => {
        if (!isValidArray(dates)) throw new Error('The server returned an invalid blocked-date list.');
        if (!cancelled) setBlockedDateList(dates);
      })
      .catch((error) => {
        if (!cancelled) setToast({ message: error.message || 'Unable to load blocked dates.', type: 'error' });
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/calendar/hours')
      .then((hours) => {
        const hourPattern = /^(?:[01]\d|2[0-3]):00$/;
        if (!hourPattern.test(hours.open || '') || !hourPattern.test(hours.close || '')) {
          throw new Error('The configured studio hours are invalid.');
        }
        const open = Number(hours.open.slice(0, 2));
        const close = Number(hours.close.slice(0, 2));
        if (close <= open) throw new Error('The configured studio hours are invalid.');
        if (!cancelled) {
          setBookingHours({ open, close });
          setHoursError('');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setHoursError(error.message || 'Unable to load studio operating hours.');
          setToast({ message: error.message || 'Unable to load studio operating hours.', type: 'error' });
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const dialog = blockDialogRef.current;
    if (blockConfirmation && dialog && !dialog.open) dialog.showModal();
    if (!blockConfirmation && dialog?.open) dialog.close();
  }, [blockConfirmation]);

  useEffect(() => {
    if (pickerOpen) {
      const selectedButton = pickerGridRef.current?.querySelector('[aria-pressed="true"]');
      (selectedButton || pickerGridRef.current?.firstElementChild)?.focus();
    }
  }, [pickerOpen, pickerYear]);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    function handlePointerDown(event) {
      if (!pickerRef.current?.contains(event.target)) setPickerOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pickerOpen]);

  const calendarCells = useMemo(() => {
    const leadingBlanks = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;
    return Array.from({ length: totalCells }, (_, index) => {
      const dateNumber = index - leadingBlanks + 1;
      if (dateNumber < 1 || dateNumber > daysInMonth) return null;
      return `${monthKey}-${pad(dateNumber)}`;
    });
  }, [year, month, monthKey]);

  function showMonth(yearValue, monthValue) {
    const target = new Date(yearValue, monthValue, 1);
    setDisplayMonth(target);
    if (selectedDate && !selectedDate.startsWith(`${target.getFullYear()}-${pad(target.getMonth() + 1)}`)) {
      setSelectedDate(null);
      setDay(null);
    }
  }

  function changeMonth(step) {
    showMonth(year, month + step);
  }

  function selectDate(date) {
    setSelectedDate((current) => current === date ? null : date);
  }

  function selectBlockedDate(date) {
    const target = fromIsoDate(date);
    showMonth(target.getFullYear(), target.getMonth());
    setSelectedDate(date);
  }

  async function runCalendarAction(action, successMessage) {
    setBusy(true);
    try {
      await action();
      setToast({ message: successMessage, type: 'success' });
    } catch (error) {
      setToast({ message: error.message || 'Unable to update availability.', type: 'error' });
    } finally {
      setBusy(false);
      setRefreshKey((current) => current + 1);
    }
  }

  function blockDate(date) {
    return runCalendarAction(
      () => sendJson(`${API_BASE}/blocked-dates`, 'POST', { date }),
      `${formatLongDate(date)} is now unavailable.`,
    );
  }

  function unblockDate(date) {
    return runCalendarAction(
      () => deleteRequest(`${API_BASE}/blocked-dates/${date}`),
      `${formatLongDate(date)} is available again.`,
    );
  }

  function blockTime(startTime) {
    if (!selectedDate) return Promise.resolve();
    return runCalendarAction(
      () => sendJson(`${API_BASE}/blocked-times`, 'POST', { date: selectedDate, startTime }),
      `${formatHour(Number(startTime.slice(0, 2)))}-${formatHour(Number(startTime.slice(0, 2)) + 1)} is now blocked.`,
    );
  }

  function unblockTime(id) {
    return runCalendarAction(
      () => deleteRequest(`${API_BASE}/blocked-times/${id}`),
      'The blocked hour is available again.',
    );
  }

  function toggleDateAvailability() {
    if (!selectedDate || !day || selectedIsPast || busy) return;
    if (day.blocked) {
      void unblockDate(selectedDate);
    } else if (day.bookings.length === 0) {
      void blockDate(selectedDate);
    } else {
      setBlockConfirmation(true);
    }
  }

  const selectedBlocked = Boolean(day?.blocked);
  const dateBlockMessage = selectedDate && day
    ? `${formatLongDate(selectedDate)} already has ${day.bookings.length} ${day.bookings.length === 1 ? 'booking' : 'bookings'}. They stay on the schedule, but customers won't be able to choose this date for new bookings.`
    : '';

  return (
    <AdminLayout
      activePage="calendar"
      title="Calendar | BRB Studios Admin"
    >
      <main className="admin-main">
        <header className="page-header">
          <p className="page-header__eyebrow">Availability</p>
          <h1 className="page-header__title">Calendar</h1>
          <p className="page-header__subtitle">Select a date to see bookings or change its availability.</p>
        </header>

        <div className="calendar-layout">
          <div className="calendar-layout__row">
            <section className="panel calendar" aria-label="Monthly calendar">
              <header className="calendar__header">
                <button
                  className="calendar__nav calendar__nav--previous"
                  type="button"
                  aria-label="Previous month"
                  onClick={() => changeMonth(-1)}
                />
                <div className="month-picker" ref={pickerRef}>
                  <h2 className="calendar__title">
                    <button
                      className="calendar__title-button"
                      type="button"
                      aria-haspopup="true"
                      aria-expanded={pickerOpen}
                      aria-controls="monthPicker"
                      onClick={() => {
                        setPickerYear(year);
                        setPickerOpen((open) => !open);
                      }}
                    >
                      <span aria-live="polite">{MONTH_TITLE_FORMAT.format(displayMonth)}</span>
                      <span className="calendar__caret" aria-hidden="true" />
                    </button>
                  </h2>
                  <div
                    className="month-picker__popover"
                    id="monthPicker"
                    role="group"
                    aria-label="Choose a month and year"
                    hidden={!pickerOpen}
                  >
                    <div className="month-picker__year">
                      <button
                        className="month-picker__year-nav month-picker__year-nav--previous"
                        type="button"
                        aria-label="Previous year"
                        onClick={() => setPickerYear((current) => current - 1)}
                      />
                      <span className="month-picker__year-label">{pickerYear}</span>
                      <button
                        className="month-picker__year-nav month-picker__year-nav--next"
                        type="button"
                        aria-label="Next year"
                        onClick={() => setPickerYear((current) => current + 1)}
                      />
                    </div>
                    <div className="month-picker__grid" ref={pickerGridRef}>
                      {MONTH_NAMES.map((name, index) => {
                        const selected = pickerYear === year && index === month;
                        const current = pickerYear === now.getFullYear() && index === now.getMonth();
                        const className = [
                          'month-picker__month',
                          selected && 'month-picker__month--selected',
                          current && !selected && 'month-picker__month--current',
                        ].filter(Boolean).join(' ');
                        return (
                          <button
                            key={name}
                            className={className}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              showMonth(pickerYear, index);
                              setPickerOpen(false);
                            }}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <button
                  className="calendar__nav calendar__nav--next"
                  type="button"
                  aria-label="Next month"
                  onClick={() => changeMonth(1)}
                />
              </header>

              <div className="calendar__weekdays" aria-hidden="true">
                <span>Sun</span><span>Mon</span><span>Tues</span><span>Wed</span><span>Thurs</span><span>Fri</span><span>Sat</span>
              </div>
              <div className="calendar__grid">
                {calendarCells.map((date, index) => {
                  if (!date) {
                    return <span key={`empty-${index}`} className="calendar__day calendar__day--empty" aria-hidden="true" />;
                  }
                  const isSelected = date === selectedDate;
                  const isToday = date === today;
                  const isPast = date < today;
                  const isBlocked = blockedDateSet.has(date);
                  const hasBookings = bookedDateSet.has(date);
                  const className = [
                    'calendar__day',
                    isPast && 'calendar__day--past',
                    isToday && 'calendar__day--today',
                    isBlocked && 'calendar__day--unavailable',
                    isSelected && 'calendar__day--selected',
                  ].filter(Boolean).join(' ');
                  const description = [
                    formatLongDate(date),
                    isToday && 'today',
                    isPast && 'past date',
                    isBlocked && 'unavailable',
                    hasBookings && 'has bookings',
                  ].filter(Boolean).join(', ');
                  return (
                    <button
                      key={date}
                      className={className}
                      type="button"
                      aria-label={description}
                      aria-pressed={isSelected}
                      onClick={() => selectDate(date)}
                    >
                      <span className="calendar__number">{Number(date.slice(-2))}</span>
                      {hasBookings && <span className="calendar__dot" />}
                    </button>
                  );
                })}
              </div>

              <ul className="calendar__legend" aria-label="Legend">
                <li className="legend-item"><span className="legend-item__swatch legend-item__swatch--unavailable" />Unavailable</li>
                <li className="legend-item"><span className="legend-item__swatch" />Available</li>
                <li className="legend-item"><span className="legend-item__swatch legend-item__swatch--past" />Past</li>
                <li className="legend-item"><span className="legend-item__swatch legend-item__swatch--today" />Today</li>
                <li className="legend-item"><span className="legend-item__swatch legend-item__swatch--selected" />Selected</li>
                <li className="legend-item"><span className="legend-item__swatch legend-item__swatch--dot" />Has Bookings</li>
              </ul>
            </section>

            <section className="panel day-panel" aria-labelledby="dayTitle">
              <h2 className="day-panel__title" id="dayTitle">
                {selectedDate ? formatLongDate(selectedDate) : 'No date selected'}
              </h2>
              <div className="day-panel__body">
                <h3 className="day-panel__label">Bookings</h3>
                {day?.bookings?.length > 0 && (
                  <ul className="booking-list">
                    {day.bookings.map((booking) => (
                      <li className="booking-item" key={booking.id}>
                        <div className="booking-item__heading">
                          <p className="booking-item__time">{booking.timeLabel}</p>
                          <span className={`booking-item__status booking-item__status--${booking.status.toLowerCase().replace(/\s+/g, '-')}`}>
                            {booking.status}
                          </span>
                        </div>
                        <p className="booking-item__client">{booking.clientName}</p>
                        <p className="booking-item__services">{booking.services}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {dayError
                  ? <p className="day-panel__empty" role="alert">{dayError}</p>
                  : !selectedDate
                    ? <p className="day-panel__empty" role="status">Select a date on the calendar to see its bookings.</p>
                    : !day
                      ? <p className="day-panel__empty" role="status">Loading bookings...</p>
                      : day.bookings.length === 0
                        ? <p className="day-panel__empty" role="status">No bookings on this date.</p>
                        : null}
              </div>
              <footer className="day-panel__footer">
                {selectedIsPast && (
                  <p className="day-panel__note">Dates that have already passed can&apos;t be changed.</p>
                )}
                <button
                  className={`btn btn--block btn--lg ${selectedBlocked ? 'btn--success' : 'btn--primary'}`}
                  type="button"
                  disabled={busy || !selectedDate || !day || selectedIsPast}
                  onClick={toggleDateAvailability}
                >
                  <span className={`btn__icon ${selectedBlocked ? 'btn__icon--check' : 'btn__icon--ban'}`} aria-hidden="true" />
                  {selectedBlocked ? 'Mark as Available' : 'Mark as Unavailable'}
                </button>
              </footer>
            </section>
          </div>

          <div className="calendar-layout__row">
            <section className="panel hourly-panel" aria-labelledby="hourAvailabilityTitle">
              <h2 className="hourly-panel__title" id="hourAvailabilityTitle">Hourly Availability</h2>
              <div className="hourly-panel__body">
                <p className="hour-availability__hint">Select an available hour to block or unblock it.</p>
                {!selectedDate
                  ? <p className="status-message">Select a date to see its available hours.</p>
                  : dayError
                    ? <p className="status-message" role="alert">{dayError}</p>
                    : !day
                      ? <p className="status-message">Loading hourly availability...</p>
                      : hoursError
                        ? <p className="status-message" role="alert">{hoursError}</p>
                        : !bookingHours
                          ? <p className="status-message">Loading studio operating hours...</p>
                          : (() => {
                            const nowTime = new Date();
                            const nowMinutes = nowTime.getHours() * 60 + nowTime.getMinutes();
                            const hours = [];
                            for (let hour = bookingHours.open; hour < bookingHours.close; hour += 1) {
                              const startMinutes = hour * 60;
                              const endMinutes = startMinutes + 60;
                              const booking = day.busyIntervals.some((interval) =>
                                startMinutes < interval.endMinutes && endMinutes > interval.startMinutes);
                              if (booking) continue;

                              const timeBlock = day.blockedTimes.find((interval) =>
                                startMinutes < interval.endMinutes && endMinutes > interval.startMinutes);
                              const isPast = selectedDate < today
                                || (selectedDate === today && startMinutes <= nowMinutes);
                              const status = timeBlock
                                ? 'blocked'
                                : day.blocked
                                  ? 'date-blocked'
                                  : isPast
                                    ? 'past'
                                    : 'available';
                              const statusLabel = {
                                blocked: 'Blocked',
                                'date-blocked': 'Date blocked',
                                past: 'Past',
                                available: 'Available',
                              }[status];
                              hours.push(
                                <li className={`hour-list__item hour-list__item--${status}`} key={hour}>
                                  <span className="hour-list__time">{formatHour(hour)} - {formatHour(hour + 1)}</span>
                                  <span className="hour-list__status">{statusLabel}</span>
                                  {timeBlock && (
                                    <button
                                      className="hour-list__action"
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void unblockTime(timeBlock.id)}
                                    >
                                      Unblock
                                    </button>
                                  )}
                                  {!timeBlock && status === 'available' && (
                                    <button
                                      className="hour-list__action"
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void blockTime(`${pad(hour)}:00`)}
                                    >
                                      Block
                                    </button>
                                  )}
                                </li>,
                              );
                            }
                            return (
                              <ul className="hour-list" aria-live="polite">
                                {hours.length > 0
                                  ? hours
                                  : <li className="hour-list__empty">No unbooked hours to manage for this date.</li>}
                              </ul>
                            );
                          })()}
              </div>
            </section>

            <section className="panel blocked-panel" aria-labelledby="blockedTitle">
              <h2 className="blocked-panel__title" id="blockedTitle">Blocked Dates</h2>
              <ul className="blocked-list">
                {blockedDateList.map((date) => (
                  <li className="blocked-item" key={date}>
                    <button
                      className="blocked-item__date"
                      type="button"
                      onClick={() => selectBlockedDate(date)}
                    >
                      {formatLongDate(date)}
                    </button>
                    <button
                      className="btn btn--sm blocked-item__remove"
                      type="button"
                      disabled={busy}
                      aria-label={`Remove block on ${formatLongDate(date)}`}
                      onClick={() => void unblockDate(date)}
                    >
                      Remove Block
                    </button>
                  </li>
                ))}
              </ul>
              {blockedDateList.length === 0 && (
                <p className="blocked-panel__empty" role="status">No blocked dates.</p>
              )}
            </section>
          </div>
        </div>
      </main>

      <dialog
        ref={blockDialogRef}
        className="dialog"
        aria-labelledby="blockDialogTitle"
        onCancel={(event) => {
          event.preventDefault();
          setBlockConfirmation(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setBlockConfirmation(false);
        }}
      >
        <div className="dialog__form">
          <h2 className="dialog__title" id="blockDialogTitle">Block this date?</h2>
          <p className="dialog__text">{dateBlockMessage}</p>
          <div className="dialog__actions">
            <button className="btn" type="button" onClick={() => setBlockConfirmation(false)}>Cancel</button>
            <button
              className="btn btn--primary"
              type="button"
              disabled={busy || !selectedDate}
              onClick={() => {
                setBlockConfirmation(false);
                if (selectedDate) void blockDate(selectedDate);
              }}
            >
              Mark as Unavailable
            </button>
          </div>
        </div>
      </dialog>

      {toast && (
        <p className={`toast${toast.type === 'error' ? ' toast--error' : ''}`} role="status">
          {toast.message}
        </p>
      )}
    </AdminLayout>
  );
}
