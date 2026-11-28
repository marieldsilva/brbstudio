import { useEffect, useRef, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { getJson } from '../lib/adminApi.js';

const REPORTS_API = '/api/admin/reports';
const SERVICES_API = '/api/admin/services';
const SHORT_MONTH_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short' });
const LONG_MONTH_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function fromMonthKey(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function fromIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatPeso(value) {
  const amount = Number(value);
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatChartAmount(amount) {
  if (amount < 10000) return formatPeso(amount);
  const thousands = amount / 1000;
  return `₱${thousands.toLocaleString('en-PH', { maximumFractionDigits: 1 })}K`;
}

function statusSlug(status) {
  return String(status).toLowerCase().replace(/\s+/g, '-');
}

function readFilters() {
  const params = new URLSearchParams(window.location.search);
  const today = new Date();
  return {
    from: params.get('from') || toMonthKey(new Date(today.getFullYear(), 0, 1)),
    to: params.get('to') || toMonthKey(today),
    serviceId: params.get('serviceId') || '',
  };
}

function toQuery({ from, to, serviceId }) {
  const params = new URLSearchParams({ from, to });
  if (serviceId) params.set('serviceId', serviceId);
  return params.toString();
}

export default function AdminReportsPage() {
  const initialFilters = useRef(readFilters()).current;
  const [fromMonth, setFromMonth] = useState(initialFilters.from);
  const [toMonth, setToMonth] = useState(initialFilters.to);
  const [serviceId, setServiceId] = useState(initialFilters.serviceId);
  const [services, setServices] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latestRequest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getJson(SERVICES_API)
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('The server returned an invalid service list.');
        if (!cancelled) {
          setServices(data);
          if (initialFilters.serviceId && data.some((service) => String(service.id) === initialFilters.serviceId)) {
            setServiceId(initialFilters.serviceId);
          } else {
            setServiceId('');
          }
        }
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message || 'Unable to load report services.');
      });
    return () => { cancelled = true; };
  }, [initialFilters]);

  useEffect(() => {
    if (!fromMonth || !toMonth) return undefined;
    const requestId = ++latestRequest.current;
    const filters = { from: fromMonth, to: toMonth, serviceId };
    setLoading(true);
    setError('');
    getJson(`${REPORTS_API}?${toQuery(filters)}`)
      .then((data) => {
        if (requestId !== latestRequest.current) return;
        if (!data.summary) throw new Error('The server returned an invalid report.');
        setReport(data);
        window.history.replaceState(null, '', `reports.html?${toQuery(filters)}`);
      })
      .catch((requestError) => {
        if (requestId !== latestRequest.current) return;
        const fieldErrors = requestError.fieldErrors ?? {};
        setReport(null);
        setError(Object.values(fieldErrors)[0] || requestError.message || 'Unable to load the report.');
      })
      .finally(() => {
        if (requestId === latestRequest.current) setLoading(false);
      });
  }, [fromMonth, toMonth, serviceId]);

  const isService = report?.service !== null && report?.service !== undefined;
  const monthlyIncome = report?.monthlyIncome ?? [];
  const highest = Math.max(...monthlyIncome.map((entry) => entry.income), 1);
  const currentMonth = toMonthKey(new Date());
  const showYear = monthlyIncome.length > 0
    && monthlyIncome[0].month.slice(0, 4) !== monthlyIncome[monthlyIncome.length - 1].month.slice(0, 4);
  const hasIncome = monthlyIncome.some((entry) => entry.income > 0);

  function selectService(nextServiceId) {
    setServiceId(nextServiceId);
  }

  return (
    <AdminLayout activePage="reports" title={`${isService ? report.service.name : 'Reports'} | BRB Studios Admin`}>
      <main className="admin-main">
        <header className="page-header">
          <p className="page-header__eyebrow">Reports</p>
          <h1 className="page-header__title">{isService ? report.service.name : 'Overview'}</h1>
          <p className="page-header__subtitle">Figures count accepted bookings by event date. Pending and rejected bookings are left out.</p>
        </header>

        <form className="report-filters" noValidate onSubmit={(event) => event.preventDefault()}>
          <div className="field">
            <label className="field__label" htmlFor="fromMonth">From</label>
            <input
              className="field__input"
              id="fromMonth"
              name="from"
              type="month"
              placeholder="YYYY-MM"
              required
              value={fromMonth}
              onChange={(event) => setFromMonth(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="toMonth">To</label>
            <input
              className="field__input"
              id="toMonth"
              name="to"
              type="month"
              placeholder="YYYY-MM"
              required
              value={toMonth}
              onChange={(event) => setToMonth(event.target.value)}
            />
          </div>
          <div className="field report-filters__service">
            <label className="field__label" htmlFor="serviceSelect">Service</label>
            <select
              className="field__input"
              id="serviceSelect"
              name="serviceId"
              value={serviceId}
              onChange={(event) => selectService(event.target.value)}
            >
              <option value="">All Services</option>
              {services.map((service) => (
                <option value={service.id} key={service.id}>{service.name}</option>
              ))}
            </select>
          </div>
        </form>

        {error && <p className="alert alert--error" role="alert">{error}</p>}
        {loading && <p className="status-message" role="status">Loading report...</p>}

        {report && (
          <div>
            <section className="report-cards" aria-label="Report summary">
              {[
                ['Booking Value', 'bookingValue'],
                ['Received', 'received'],
                ['Outstanding Balance', 'outstanding'],
              ].map(([label, key]) => (
                <article className="panel report-card" key={key}>
                  <h2 className="report-card__label">{label}</h2>
                  <p className="report-card__value" data-stat={key}>{formatPeso(report.summary[key])}</p>
                </article>
              ))}
            </section>

            <div className={`report-grid${isService ? ' report-grid--service' : ''}`}>
              <section className="report-section" aria-labelledby="incomeTitle">
                <h2 className="section-heading" id="incomeTitle">Monthly Income</h2>
                <div className="panel income-chart">
                  {monthlyIncome.length > 0 ? (
                    <ol className="income-chart__bars">
                      {monthlyIncome.map((entry) => {
                        const date = fromMonthKey(entry.month);
                        const label = showYear
                          ? `${SHORT_MONTH_FORMAT.format(date)} '${String(date.getFullYear()).slice(2)}`
                          : SHORT_MONTH_FORMAT.format(date);
                        return (
                          <li
                            className={`income-bar${entry.month === currentMonth ? ' income-bar--current' : ''}`}
                            key={entry.month}
                            title={`${LONG_MONTH_FORMAT.format(date)}: ${formatPeso(entry.income)}`}
                          >
                            <div className="income-bar__track">
                              <span className="income-bar__value">{entry.income > 0 ? formatChartAmount(entry.income) : ''}</span>
                              <span className="income-bar__fill" style={{ '--percent': (entry.income / highest) * 100 }}></span>
                            </div>
                            <span className="income-bar__month">{label}</span>
                          </li>
                        );
                      })}
                    </ol>
                  ) : <p className="status-message">No payments received in this period.</p>}
                  {!hasIncome && monthlyIncome.length > 0 && (
                    <p className="status-message">No payments received in this period.</p>
                  )}
                </div>
              </section>

              {!isService && (
                <section className="report-section" aria-labelledby="serviceTitle">
                  <h2 className="section-heading" id="serviceTitle">Bookings by Service</h2>
                  <div className="table-wrap">
                    <table className="data-table report-table" aria-labelledby="serviceTitle">
                      <thead>
                        <tr>
                          <th scope="col">Service</th>
                          <th scope="col">Bookings</th>
                          <th scope="col">Order Value</th>
                          <th scope="col">Received</th>
                          <th scope="col">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report.services ?? []).map((service) => (
                          <tr className="data-row" key={service.id}>
                            <th className="report-table__name" scope="row">
                              <button
                                className="report-table__link"
                                type="button"
                                onClick={() => selectService(String(service.id))}
                              >
                                {service.name}
                              </button>
                            </th>
                            <td>{service.bookings}</td>
                            <td>{formatPeso(service.bookingValue)}</td>
                            <td>{formatPeso(service.received)}</td>
                            <td>{formatPeso(service.outstanding)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="report-table__total">
                          <th scope="row">Total</th>
                          <td>{report.summary.bookings}</td>
                          <td>{formatPeso(report.summary.bookingValue)}</td>
                          <td>{formatPeso(report.summary.received)}</td>
                          <td>{formatPeso(report.summary.outstanding)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="status-message">A booking with more than one service is counted under each of its services.</p>
                </section>
              )}

              {isService && (
                <section className="report-section" aria-labelledby="bookingTitle">
                  <h2 className="section-heading" id="bookingTitle">Bookings</h2>
                  {(report.bookings ?? []).length > 0 ? (
                    <div className="table-wrap">
                      <table className="data-table report-table" aria-labelledby="bookingTitle">
                        <thead>
                          <tr>
                            <th scope="col">Booking</th>
                            <th scope="col">Client</th>
                            <th scope="col">Event Date</th>
                            <th scope="col">Status</th>
                            <th scope="col">Value</th>
                            <th scope="col">Received</th>
                            <th scope="col">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.bookings.map((booking) => (
                            <tr className="data-row" key={booking.id ?? booking.reference}>
                              <th className="report-table__name" scope="row">#{booking.reference}</th>
                              <td className="report-table__name">{booking.clientName}</td>
                              <td>{DATE_FORMAT.format(fromIsoDate(booking.eventDate))}</td>
                              <td><span className={`pill pill--${statusSlug(booking.status)}`}>{booking.status}</span></td>
                              <td>{formatPeso(booking.bookingValue)}</td>
                              <td>{formatPeso(booking.received)}</td>
                              <td>{formatPeso(booking.outstanding)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="status-message">No bookings found for this period.</p>}
                </section>
              )}
            </div>
          </div>
        )}
      </main>
    </AdminLayout>
  );
}
