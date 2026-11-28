import { useEffect, useRef, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { getJson } from '../lib/adminApi.js';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short' });

function toIsoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function parseOperatingHour(value) {
  if (!/^(?:[01]\d|2[0-3]):00$/.test(value ?? '')) return null;
  return Number(value.slice(0, 2));
}

function formatHour(hour) {
  return `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function statValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-PH') : '—';
}

function AdminDashboardPage() {
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingError, setUpcomingError] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [scheduleHours, setScheduleHours] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [scheduleStatus, setScheduleStatus] = useState('Loading the day schedule...');
  const scheduleRequest = useRef(0);
  const selectedIso = toIsoDate(selectedDate);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/admin/dashboard/summary').then((data) => {
      if (!cancelled) setSummary(data);
    }).catch((error) => {
      if (!cancelled) setSummaryError(error.message || 'Could not load dashboard summary.');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/admin/dashboard/upcoming-bookings').then((data) => {
      if (!cancelled) setUpcoming(Array.isArray(data) ? data : []);
    }).catch((error) => {
      if (!cancelled) setUpcomingError(error.message || 'Unable to load upcoming bookings.');
    }).finally(() => {
      if (!cancelled) setUpcomingLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/calendar/hours').then((hours) => {
      const open = parseOperatingHour(hours.open);
      const close = parseOperatingHour(hours.close);
      if (open === null || close === null || close <= open) {
        throw new Error('The configured booking hours are invalid.');
      }
      if (!cancelled) setScheduleHours({ open, close });
    }).catch((error) => {
      if (!cancelled) setScheduleStatus(error.message || 'Unable to load the day schedule.');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!scheduleHours) return undefined;
    let cancelled = false;
    const request = ++scheduleRequest.current;
    setSchedule(null);
    setScheduleStatus('Loading the day schedule...');
    getJson(`/api/admin/dashboard/day-schedule?date=${encodeURIComponent(selectedIso)}`)
      .then((data) => {
        if (cancelled || request !== scheduleRequest.current) return;
        if (!Array.isArray(data.columns)) throw new Error('The server returned an invalid day schedule.');
        setSchedule(data);
        setScheduleStatus(data.columns.length ? '' : 'No active services to display.');
      })
      .catch((error) => {
        if (!cancelled && request === scheduleRequest.current) {
          setScheduleStatus(error.message || 'Unable to load the day schedule.');
        }
      });
    return () => { cancelled = true; };
  }, [scheduleHours, selectedIso]);

  const statCards = [
    ['totalBookings', 'Total Bookings'],
    ['waitingForReview', 'Waiting for Review'],
    ['totalClients', 'Total Clients'],
    ['paymentsToCollect', 'Payments to Collect'],
  ];

  function moveSelectedDate(days) {
    setSelectedDate((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + days));
  }

  function renderEvent(booking) {
    const gridStart = scheduleHours.open * 60;
    const gridEnd = scheduleHours.close * 60;
    const start = Math.max(booking.startMinutes, gridStart);
    const end = Math.min(booking.endMinutes, gridEnd);
    if (end <= start) return null;
    const statusClass = String(booking.status || '').toLowerCase().replace(/\s+/g, '-');

    return (
      <article
        className={`schedule-event${statusClass ? ` schedule-event--${statusClass}` : ''}`}
        key={booking.id}
        style={{ '--start': (start - gridStart) / 60, '--span': (end - start) / 60 }}
      >
        <p className="schedule-event__time">{booking.timeLabel}</p>
        <p className="schedule-event__service">{booking.serviceName}</p>
        <p className="schedule-event__client">{booking.clientName}</p>
      </article>
    );
  }

  return (
    <AdminLayout activePage="dashboard" title="Dashboard | BRB Studios Admin">
      <main className="admin-main">
        <header className="page-header">
          <p className="page-header__eyebrow">Dashboard</p>
          <h1 className="page-header__title">Overview</h1>
        </header>

        <section className="overview" aria-label="Studio summary">
          {statCards.map(([key, label]) => (
            <article className="panel stat-card" key={key}>
              <h2 className="stat-card__label">{label}</h2>
              <p className="stat-card__value" aria-live="polite">
                {summary ? statValue(summary[key]) : summaryError ? '—' : '...'}
              </p>
            </article>
          ))}
          <article className="panel upcoming">
            <h2 className="upcoming__title">Upcoming Bookings</h2>
            <ul className="upcoming__list">
              {upcoming.map((booking) => {
                const eventDate = fromIsoDate(booking.eventDate);
                return (
                  <li className="upcoming-item" key={booking.id}>
                    <div className="upcoming-item__date">
                      <span className="upcoming-item__month">{MONTH_FORMAT.format(eventDate)}</span>
                      <span className="upcoming-item__day">{eventDate.getDate()}</span>
                    </div>
                    <div>
                      <p className="upcoming-item__service">{booking.serviceName}</p>
                      <p className="upcoming-item__client">{booking.clientName} - {booking.startTime}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {(upcomingLoading || upcomingError || (!upcomingLoading && upcoming.length === 0)) && (
              <p className="status-message" role={upcomingError ? 'alert' : 'status'}>
                {upcomingLoading ? 'Loading upcoming bookings...' : upcomingError || 'No upcoming bookings.'}
              </p>
            )}
          </article>
        </section>

        {summaryError && <p className="status-message" role="alert">{summaryError}</p>}

        <section className="day-schedule" aria-labelledby="scheduleTitle">
          <header className="day-schedule__header">
            <h2 className="day-schedule__title" id="scheduleTitle">
              Day Schedule - <time dateTime={selectedIso}>{DATE_FORMAT.format(selectedDate)}</time>
            </h2>
            <div className="day-nav">
              <button className="day-nav__step" type="button" aria-label="Previous day" onClick={() => moveSelectedDate(-1)}>&lt;</button>
              <button className="day-nav__today" type="button" onClick={() => setSelectedDate(new Date())}>Today</button>
              <button className="day-nav__step" type="button" aria-label="Next day" onClick={() => moveSelectedDate(1)}>&gt;</button>
            </div>
          </header>

          {scheduleStatus && <p className="status-message" role="status">{scheduleStatus}</p>}
          {schedule?.columns?.length > 0 && scheduleHours && (
            <div
              className="panel schedule"
              style={{
                '--column-count': schedule.columns.length,
                '--hour-count': scheduleHours.close - scheduleHours.open,
              }}
            >
              <div className="schedule__corner"></div>
              <div className="schedule__services">
                {schedule.columns.map((column) => (
                  <div className="schedule__service" key={column.serviceId}>{column.serviceName}</div>
                ))}
              </div>
              <ol className="schedule__hours">
                {Array.from({ length: scheduleHours.close - scheduleHours.open + 1 }, (_, index) => {
                  const hour = scheduleHours.open + index;
                  return <li className="schedule__hour" style={{ '--index': index }} key={hour}>{formatHour(hour)}</li>;
                })}
              </ol>
              <div className="schedule__columns">
                {schedule.columns.map((column) => (
                  <div className="schedule__column" data-service-id={column.serviceId} key={column.serviceId}>
                    {column.bookings.map(renderEvent)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </AdminLayout>
  );
}

export default AdminDashboardPage;
