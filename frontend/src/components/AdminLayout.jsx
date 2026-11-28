import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageStyles from './PageStyles.jsx';
import { ADMIN_SESSION_EXPIRED_EVENT, getJson, sendJson } from '../lib/adminApi.js';
import { ADMIN_PAGE_STYLES, ADMIN_SHARED_STYLES } from '../lib/pageStyles.js';

const EMPTY_STYLESHEETS = [];

const NAV_ITEMS = [
  ['dashboard', 'Dashboard', '/admin/html/dashboard.html', 'dashboard'],
  ['payments', 'Payments', '/admin/html/payments.html', 'payments'],
  ['bookings', 'Bookings', '/admin/html/bookings.html', 'bookings'],
  ['calendar', 'Calendar', '/admin/html/calendar.html', 'calendar'],
  ['services', 'Services', '/admin/html/services.html', 'services'],
  ['clients', 'Clients', '/admin/html/clients.html', 'clients'],
  ['vouchers', 'Vouchers', '/admin/html/vouchers.html', 'vouchers'],
  ['reschedule-requests', 'Rescheduling Requests', '/admin/html/reschedule-requests.html', 'reschedule'],
  ['reports', 'Reports', '/admin/html/reports.html', 'reports'],
];

function LogoutDialog({ onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog logout-dialog"
      aria-labelledby="adminLogoutTitle"
      onClose={() => onClose(ref.current?.returnValue === 'confirm')}
    >
      <form className="dialog__form" method="dialog">
        <h2 className="dialog__title" id="adminLogoutTitle">Log out?</h2>
        <p className="dialog__text">Are you sure you want to log out?</p>
        <div className="dialog__actions">
          <button className="btn" type="submit" value="cancel">Cancel</button>
          <button className="btn btn--danger-solid" type="submit" value="confirm">Log out</button>
        </div>
      </form>
    </dialog>
  );
}

export default function AdminLayout({
  activePage,
  children,
  pageStyles = EMPTY_STYLESHEETS,
  title,
}) {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [error, setError] = useState('');
  const sidebarRef = useRef(null);
  const toggleRef = useRef(null);
  const stylesheets = useMemo(
    () => [...ADMIN_SHARED_STYLES, ...(ADMIN_PAGE_STYLES[activePage] ?? []), ...pageStyles],
    [activePage, pageStyles],
  );

  useEffect(() => {
    let cancelled = false;
    getJson('/api/auth/admin/me').then(({ admin }) => {
      if (!admin && !cancelled) navigate('/customer/html/login.html', { replace: true });
    }).catch((requestError) => {
      if (!cancelled) setError(requestError.message || 'Unable to verify your administrator session.');
    });
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    const handleExpiredSession = () => navigate('/customer/html/login.html', { replace: true });
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleExpiredSession);
  }, [navigate]);

  useEffect(() => {
    document.body.classList.toggle('admin-layout--sidebar-collapsed', sidebarCollapsed);
    if (sidebarRef.current) sidebarRef.current.inert = sidebarCollapsed;
    return () => {
      document.body.classList.remove('admin-layout--sidebar-collapsed');
    };
  }, [sidebarCollapsed]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 760px)');
    const updateSidebar = (event) => setSidebarCollapsed(event.matches);
    mediaQuery.addEventListener('change', updateSidebar);
    return () => mediaQuery.removeEventListener('change', updateSidebar);
  }, []);

  function toggleSidebar() {
    const collapse = !sidebarCollapsed;
    if (collapse && sidebarRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
    setSidebarCollapsed(collapse);
  }

  async function logout() {
    setLogoutPending(true);
    setError('');
    try {
      const { redirectTo } = await sendJson('/api/auth/logout', 'POST', {});
      if (typeof redirectTo !== 'string') throw new Error('Unable to log out. Please try again.');
      navigate(redirectTo, { replace: true });
    } catch (logoutError) {
      setError(logoutError.message || 'Unable to log out. Please try again.');
    } finally {
      setLogoutPending(false);
    }
  }

  return (
    <>
      <PageStyles
        bodyClass="admin-layout"
        stylesheets={stylesheets}
        title={title}
      />
      <aside className="sidebar" id="adminSidebar" ref={sidebarRef}>
        <div className="sidebar__brand">
          <img className="sidebar__logo" src="/admin/AdminImages/brb-logo.png" alt="BRB Studios" />
          <p className="sidebar__role">Administrator</p>
        </div>
        <nav className="sidebar__nav" aria-label="Admin navigation">
          <ul className="nav-list">
            {NAV_ITEMS.map(([key, label, href, icon]) => (
              <li key={key}>
                <Link className={`nav-link${activePage === key ? ' nav-link--active' : ''}`} to={href} aria-current={activePage === key ? 'page' : undefined}>
                  <span className={`nav-link__icon nav-link__icon--${icon}`} aria-hidden="true"></span>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar__footer">
          <Link className="sidebar__new-booking" to="/admin/html/new-booking.html">New Booking</Link>
          <button className="sidebar__logout" type="button" disabled={logoutPending} onClick={() => setLogoutDialogOpen(true)}>
            <span className="sidebar__logout-icon" aria-hidden="true"></span>
            Logout
          </button>
        </div>
      </aside>
      <button
        className="sidebar-toggle"
        ref={toggleRef}
        type="button"
        aria-controls="adminSidebar"
        aria-expanded={!sidebarCollapsed}
        aria-label={sidebarCollapsed ? 'Show admin navigation' : 'Hide admin navigation'}
        onClick={toggleSidebar}
      >
        <span>
          <span className="sidebar-toggle__line" aria-hidden="true"></span>
          <span className="sidebar-toggle__line" aria-hidden="true"></span>
          <span className="sidebar-toggle__line" aria-hidden="true"></span>
        </span>
      </button>
      {error && <p className="status-message admin-session-error" role="alert">{error}</p>}
      {children}
      {logoutDialogOpen && (
        <LogoutDialog
          onClose={(confirmed) => {
            setLogoutDialogOpen(false);
            if (confirmed) void logout();
          }}
        />
      )}
    </>
  );
}
