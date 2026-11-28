import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageStyles from '../components/PageStyles.jsx';
import { getJson, postJson } from '../lib/api.js';
import { HOME_PAGE_STYLES } from '../lib/pageStyles.js';
import { getBusinessDate, getBusinessDateOffset } from '../lib/businessDate.js';

const STUDIO_MAP_URL = 'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.bing.com%2Fmaps%2Fdefault.aspx%3Fv%3D2%26pc%3DFACEBK%26mid%3D8100%26where1%3D13.932117479722%252C%2520120.81314808899%26FORM%3DFBKPL1%26name%3DMarasigan%2520St.%2520Poblacion%25204%252C%2520Calaca%2520City%252C%2520Calaca%252C%2520Philippines%252C%25204212%26mkt%3Den-GB%26fbclid%3DIwZXh0bgNhZW0CMTAAcGRvZgVicmlkETFWekJxRFV4WEpYODJPaXRnc3J0YwZhcHBfaWQQMjIyMDM5MTc4ODIwMDg5MgABH0WStDvUVIv76aw0_9FUWlrV32tO_Jtvw5JwjSmXP9k9JucgbbRkdWnHKP7U_aem_wS08rMv-8UNYNwPW9y1TKw&h=AUD2XMspgMC1iEqx1S5lERRr4114H8tg-UQazJSYYBR_-U44t6VqTZ_PrdzNJaVksXfUQeYI5bO-py7ve4KPCNMbzRN5muBXxZaGAzfn0bexOPa_ZuSTif751kWEiIwDXoFd';

function formatLongDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function LogoutConfirmDialog({ onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog logout-dialog"
      aria-labelledby="logoutConfirmationTitle"
      aria-describedby="logoutConfirmationMessage"
      onClose={() => onClose(dialogRef.current?.returnValue === 'confirm')}
    >
      <form className="dialog__form" method="dialog">
        <h2 className="dialog__title" id="logoutConfirmationTitle">Log out?</h2>
        <p className="dialog__text" id="logoutConfirmationMessage">Are you sure you want to log out?</p>
        <div className="dialog__actions">
          <button className="btn" type="submit" value="cancel">Cancel</button>
          <button className="btn btn--danger-solid" type="submit" value="confirm">Log out</button>
        </div>
      </form>
    </dialog>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [services, setServices] = useState([]);
  const [serviceStatus, setServiceStatus] = useState('Loading services...');
  const [dayHeading, setDayHeading] = useState('Select a date');
  const [dayStatus, setDayStatus] = useState('Choose a date on the calendar to see its bookings.');
  const [dayBookings, setDayBookings] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const earliestBookingDate = getBusinessDateOffset(2);
    const [year, month] = earliestBookingDate.split('-').map(Number);
    return new Date(year, month - 1, 1);
  });
  const [blockedDates, setBlockedDates] = useState([]);
  const [bookedDates, setBookedDates] = useState([]);
  const [calendarStatus, setCalendarStatus] = useState('');
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const headerRef = useRef(null);
  const dayRequestRef = useRef(0);
  const monthRequestRef = useRef(0);
  const initialDateSelectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      try {
        const [serviceResponse, sessionResponse] = await Promise.all([
          getJson('/api/services'),
          getJson('/api/auth/me').catch(() => ({ ok: false, data: {} })),
        ]);
        if (cancelled) return;

        if (sessionResponse.ok) {
          const currentCustomer = sessionResponse.data?.customer ?? null;
          setCustomer(currentCustomer);
        }

        if (!serviceResponse.ok || !Array.isArray(serviceResponse.data)) {
          setServiceStatus('Services could not be loaded. Please refresh the page.');
          return;
        }
        if (serviceResponse.data.length === 0) {
          setServices([]);
          setServiceStatus('No services are available right now.');
          return;
        }

        setServices(serviceResponse.data);
        setServiceStatus('');
      } catch {
        if (!cancelled) {
          setServiceStatus('Unable to reach the server. Please check your connection and try again.');
        }
      }
    }

    loadPageData();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadDay(isoDate) {
    const request = ++dayRequestRef.current;
    setSelectedDate(isoDate);
    setDayHeading(formatLongDate(isoDate));
    setDayBookings([]);
    setDayStatus('Loading bookings...');

    try {
      const response = await getJson(`/api/calendar/day?date=${encodeURIComponent(isoDate)}`);
      if (request !== dayRequestRef.current) return;
      if (!response.ok) throw new Error(response.data?.message || 'Request failed');
      if (response.data?.blocked) {
        setDayStatus('This date is unavailable.');
        return;
      }
      if (!Array.isArray(response.data?.booked)) {
        throw new Error('The server returned an invalid calendar response.');
      }

      setDayBookings(response.data.booked);
      setDayStatus(response.data.booked.length ? '' : 'No bookings yet. This date is open.');
    } catch {
      if (request === dayRequestRef.current) {
        setDayStatus('Bookings for this date could not be loaded.');
      }
    }
  }

  const monthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    let cancelled = false;
    const request = ++monthRequestRef.current;
    setCalendarLoading(true);
    setCalendarStatus('');

    async function loadMonth() {
      try {
        const response = await getJson(`/api/calendar/month?month=${monthKey}`);
        if (cancelled || request !== monthRequestRef.current) return;
        if (!response.ok || !Array.isArray(response.data?.blockedDates) || !Array.isArray(response.data?.bookedDates)) {
          throw new Error('Request failed');
        }

        setBlockedDates(response.data.blockedDates);
        setBookedDates(response.data.bookedDates);

        const earliestBookingDate = getBusinessDateOffset(2);
        const currentMonthKey = earliestBookingDate.slice(0, 7);
        if (!initialDateSelectedRef.current && monthKey === earliestBookingDate.slice(0, 7) && !response.data.blockedDates.includes(earliestBookingDate)) {
          initialDateSelectedRef.current = true;
          void loadDay(earliestBookingDate);
        }
      } catch {
        if (!cancelled && request === monthRequestRef.current) {
          setCalendarStatus('Unavailable dates could not be loaded.');
          setBlockedDates([]);
          setBookedDates([]);
        }
      } finally {
        if (!cancelled && request === monthRequestRef.current) setCalendarLoading(false);
      }
    }

    loadMonth();
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  useEffect(() => {
    const links = document.querySelectorAll('[data-section]');
    const aboutSection = document.getElementById('about');
    const contactSection = document.getElementById('contact');
    const header = headerRef.current;

    function highlightCurrentSection() {
      if (!header || !aboutSection || !contactSection) return;
      const reachedBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const threshold = header.offsetHeight + window.innerHeight * 0.3;
      const current = reachedBottom || contactSection.getBoundingClientRect().top <= threshold
        ? 'contact'
        : aboutSection.getBoundingClientRect().top <= threshold
          ? 'about'
          : 'home';

      links.forEach((link) => {
        link.classList.toggle('site-header__link--current', link.dataset.section === current);
      });
    }

    window.addEventListener('scroll', highlightCurrentSection, { passive: true });
    window.addEventListener('resize', highlightCurrentSection);
    highlightCurrentSection();
    return () => {
      window.removeEventListener('scroll', highlightCurrentSection);
      window.removeEventListener('resize', highlightCurrentSection);
    };
  }, []);

  async function handleLogout() {
    setLogoutPending(true);
    setLogoutError('');

    try {
      const response = await postJson('/api/auth/logout', {});
      if (!response.ok || typeof response.data?.redirectTo !== 'string') {
        throw new Error(response.data?.message || 'Unable to log out. Please try again.');
      }
      navigate(response.data.redirectTo, { replace: true });
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Unable to log out. Please try again.');
    } finally {
      setLogoutPending(false);
    }
  }

  const bookingHref = customer ? '/customer/html/book-service.html' : '/customer/html/login.html';
  const dateBookingHref = selectedDate
    ? `${bookingHref}${customer ? `?date=${encodeURIComponent(selectedDate)}` : ''}`
    : bookingHref;
  const calendarDays = Array.from(
    { length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() },
    (_, index) => index + 1,
  );
  const calendarSpacers = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const todayIso = getBusinessDate();
  const earliestBookingDate = getBusinessDateOffset(2);
  const currentMonthKey = earliestBookingDate.slice(0, 7);

  return (
    <>
      <PageStyles
        bodyClass="home-page"
        stylesheets={HOME_PAGE_STYLES}
        title="BRB Studios | Home"
      />

      <header className="site-header" id="siteHeader" ref={headerRef}>
        <div className="site-header__inner">
          <a className="site-header__brand" href="#home">
            <img className="site-header__logo" src="/customer/CustomerImages/brb-logo.png" alt="BRB Studios" />
          </a>
          <nav className="site-header__nav" aria-label="Main">
            <a className="site-header__link site-header__link--current" href="#home" data-section="home">Home</a>
            <a className="site-header__link" href="#about" data-section="about">About</a>
            <a className="site-header__link" href="#contact" data-section="contact">Contact</a>
          </nav>
          {!customer ? (
            <div className="site-header__account">
              <Link className="site-header__link" to="/customer/html/login.html">Login</Link>
              <Link className="site-header__link site-header__link--accent" to="/customer/html/register.html">Register</Link>
            </div>
          ) : (
            <div className="site-header__account">
              <Link className="site-header__link site-header__link--accent" to="/customer/html/book-service.html">My Profile</Link>
              <button
                className="site-header__button site-header__button--dark"
                type="button"
                disabled={logoutPending}
                onClick={() => setLogoutDialogOpen(true)}
              >
                Logout
              </button>
              {logoutError && <span className="site-header__logout-status" role="alert">{logoutError}</span>}
            </div>
          )}
        </div>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="hero__content">
            <p className="hero__eyebrow">Hair and make up, modeling, photography, and events booking</p>
            <h1 className="hero__title">Look your best.<br />Be remembered.</h1>
            <p className="hero__text">
              BRB Studios brings styling, photography, pageant styling and event planning
              together so every moment is camera ready
            </p>
            <div className="hero__actions">
              <Link className="btn-link btn-link--solid" to={bookingHref}>Book a Service</Link>
              <a className="btn-link btn-link--outline" href="#services">Explore Services</a>
            </div>
          </div>
          <div className="hero__gallery" role="img" aria-label="Makeup, photography, and modeling">
            <img className="hero__photo" src="/customer/CustomerImages/home-makeup.png" alt="" />
            <img className="hero__photo" src="/customer/CustomerImages/home-photography.jpg" alt="" />
            <img className="hero__photo" src="/customer/CustomerImages/home-modeling.jpg" alt="" />
          </div>
        </section>

        <section className="section" id="services">
          <div className="section__inner">
            <p className="section__eyebrow">What we offer</p>
            <h2 className="section__title">Our Services</h2>
            {serviceStatus && <p className="services__status" role="status">{serviceStatus}</p>}
            <ul className="services__grid">
              {services.map((service) => (
                <li className="service-card" key={service.id}>
                  <div className="service-card__media">
                    {service.imageUrl && (
                      <img className="service-card__image" src={service.imageUrl} alt={service.name} />
                    )}
                  </div>
                  <div className="service-card__body">
                    <h3 className="service-card__name">{service.name}</h3>
                    <p className="service-card__description">{service.description}</p>
                    <Link
                      className="btn-link btn-link--dark service-card__book"
                      to={`${bookingHref}${customer ? `?service=${encodeURIComponent(service.id)}` : ''}`}
                    >
                      Book this service
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section" id="calendar">
          <div className="section__inner">
            <h2 className="section__title">Check The Calendar</h2>
            <div className="availability">
              <div className="calendar">
                <div className="calendar__header">
                  <button
                    className="calendar__nav calendar__nav--prev"
                    type="button"
                    aria-label="Previous month"
                    disabled={monthKey === currentMonthKey}
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                  ></button>
                  <p className="calendar__month" aria-live="polite">
                    {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </p>
                  <button
                    className="calendar__nav calendar__nav--next"
                    type="button"
                    aria-label="Next month"
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                  ></button>
                </div>
                <div className="calendar__weekdays" aria-hidden="true">
                  <span>Sun</span><span>Mon</span><span>Tues</span><span>Wed</span>
                  <span>Thurs</span><span>Fri</span><span>Sat</span>
                </div>
                <div className="calendar__days">
                  {Array.from({ length: calendarSpacers }, (_, index) => <span key={`spacer-${index}`} />)}
                  {calendarDays.map((day) => {
                    const isoDate = `${monthKey}-${String(day).padStart(2, '0')}`;
                    const isPast = isoDate < earliestBookingDate;
                    const isBlocked = blockedDates.includes(isoDate);
                    const isBooked = bookedDates.includes(isoDate);
                    const isSelected = selectedDate === isoDate;
                    const classNames = [
                      'calendar__day',
                      isPast && 'is-past',
                      isBlocked && 'is-blocked',
                      isBooked && 'is-booked',
                      isSelected && 'is-selected',
                    ].filter(Boolean).join(' ');

                    return (
                      <button
                        className={classNames}
                        type="button"
                        key={isoDate}
                        data-date={isoDate}
                        disabled={calendarLoading || isPast || isBlocked}
                        aria-label={isBooked ? `${formatLongDate(isoDate)}, has bookings; available times may be limited` : undefined}
                        aria-pressed={isSelected}
                        onClick={() => void loadDay(isoDate)}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                {calendarStatus && <p className="calendar__status" role="status">{calendarStatus}</p>}
              </div>
              <div className="day-panel">
                <h3 className="day-panel__date">{dayHeading}</h3>
                {dayStatus && <p className="day-panel__status" role="status">{dayStatus}</p>}
                <ul className="day-panel__list">
                  {dayBookings.map((booking, index) => (
                    <li className="day-panel__row" key={`${booking.serviceName}-${booking.timeLabel}-${index}`}>
                      <div>
                        <p className="day-panel__service">{booking.serviceName}</p>
                        <p className="day-panel__time">{booking.timeLabel}</p>
                      </div>
                      <span className="day-panel__badge">Booked</span>
                    </li>
                  ))}
                </ul>
                {selectedDate && (
                  <Link className="btn-link btn-link--solid day-panel__book" to={dateBookingHref}>
                    Book on this date
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="about">
          <div className="section__inner">
            <div className="about">
              <div className="about__text">
                <h2 className="section__title">Where every look becomes a memory</h2>
                <p>
                  BRB Studios is a creative studio owned by John Roy Marasigan. We bring hair
                  and make-up, modeling, photography, styling, pageant coaching and event
                  planning together, so every moment is camera-ready.
                </p>
                <p>
                  Booking used to mean long message threads. Now you can pick your services,
                  check the calendar and send your request online.
                </p>
                <div className="hero__actions">
                  <Link className="btn-link btn-link--solid" to={bookingHref}>Book a service</Link>
                  <a className="btn-link btn-link--outline" href="#contact">Contact Us</a>
                </div>
              </div>
              <img className="about__photo about__photo--studio" src="/customer/CustomerImages/studio-interior.jpg" alt="Inside BRB Studios" />
              <img className="about__photo about__photo--voucher" src="/customer/CustomerImages/gift-voucher.jpg" alt="BRB Studios gift vouchers" />
            </div>
            <ol className="steps">
              <li className="steps__item"><p className="steps__number">Step 1</p><h3 className="steps__title">Choose a service</h3><p className="steps__text">Pick one or more services in one booking</p></li>
              <li className="steps__item"><p className="steps__number">Step 2</p><h3 className="steps__title">Pick a date and time</h3><p className="steps__text">See open and booked dates before you decide</p></li>
              <li className="steps__item"><p className="steps__number">Step 3</p><h3 className="steps__title">Waiting for approval</h3><p className="steps__text">The studio checks your schedule and accepts your request</p></li>
              <li className="steps__item"><p className="steps__number">Step 4</p><h3 className="steps__title">Pay and get confirmed</h3><p className="steps__text">Send your downpayment and receive your confirmation</p></li>
            </ol>
          </div>
        </section>

        <section className="section" id="contact">
          <div className="section__inner contact">
            <p className="section__eyebrow">Get In Touch</p>
            <h2 className="section__title">Contact Us</h2>
            <p className="section__subtitle">Reach BRB Studio through any of these</p>
            <ul className="contact__list">
              <li className="contact__item"><span className="contact__icon contact__icon--location" aria-hidden="true"></span><div><p className="contact__label">BRB Studio Address</p><p className="contact__value"><a href={STUDIO_MAP_URL} target="_blank" rel="noopener noreferrer">Marasigan St. Poblacion 4, Calaca City, Calaca, Philippines, 4212</a></p></div></li>
              <li className="contact__item"><span className="contact__icon contact__icon--phone" aria-hidden="true"></span><div><p className="contact__label">BRB Studio Contact Number</p><p className="contact__value"><a href="tel:+639051738581">0905 173 8581</a></p></div></li>
              <li className="contact__item"><span className="contact__icon contact__icon--mail" aria-hidden="true"></span><div><p className="contact__label">BRB Studio Email</p><p className="contact__value"><a href="mailto:inquiry.teambrb@gmail.com">inquiry.teambrb@gmail.com</a></p></div></li>
              <li className="contact__item"><span className="contact__icon contact__icon--facebook" aria-hidden="true"></span><div><p className="contact__label">BRB Studio Facebook</p><p className="contact__value"><a href="https://www.facebook.com/share/1DmR6jPquL/" target="_blank" rel="noopener noreferrer">BRB Studios</a></p></div></li>
              <li className="contact__item"><span className="contact__icon contact__icon--clock" aria-hidden="true"></span><div><p className="contact__label">BRB Studio Hours</p><p className="contact__value">Monday - Sunday 7:00AM - 7:00PM</p></div></li>
            </ul>
          </div>
        </section>
      </main>

      {logoutDialogOpen && (
        <LogoutConfirmDialog
          onClose={(confirmed) => {
            setLogoutDialogOpen(false);
            if (confirmed) void handleLogout();
          }}
        />
      )}
    </>
  );
}
