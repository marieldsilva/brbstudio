import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageStyles from './PageStyles.jsx';
import { postJson } from '../lib/api.js';
import { ACCOUNT_PAGE_STYLES, ACCOUNT_SHARED_STYLES } from '../lib/pageStyles.js';

const EMPTY_STYLESHEETS = [];

function LogoutConfirmDialog({ open, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, [open]);

  function handleClose() {
    onClose(dialogRef.current?.returnValue === 'confirm');
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog logout-dialog"
      aria-labelledby="logoutConfirmationTitle"
      aria-describedby="logoutConfirmationMessage"
      onClose={handleClose}
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

export default function AccountLayout({
  activePage,
  children,
  customer,
  pageStyles = EMPTY_STYLESHEETS,
  title,
}) {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    window.matchMedia('(max-width: 56rem)').matches
  ));
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const headerRef = useRef(null);
  const sidebarRef = useRef(null);
  const toggleRef = useRef(null);
  const stylesheets = useMemo(
    () => [...ACCOUNT_SHARED_STYLES, ...(ACCOUNT_PAGE_STYLES[activePage] ?? []), ...pageStyles],
    [activePage, pageStyles],
  );
  const customerName = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || 'Customer';

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 56rem)');
    const handleMediaChange = (event) => setSidebarCollapsed(event.matches);
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('account-layout--sidebar-collapsed', sidebarCollapsed);
    return () => document.body.classList.remove('account-layout--sidebar-collapsed');
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !sidebarCollapsed) setSidebarCollapsed(true);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sidebarCollapsed]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return undefined;

    const previousHeight = document.documentElement.style.getPropertyValue('--account-header-height');
    const updateHeaderOffset = () => {
      document.documentElement.style.setProperty(
        '--account-header-height',
        `${header.getBoundingClientRect().height}px`,
      );
    };

    updateHeaderOffset();
    let observer;
    if ('ResizeObserver' in window) {
      observer = new ResizeObserver(updateHeaderOffset);
      observer.observe(header);
    } else {
      window.addEventListener('resize', updateHeaderOffset);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateHeaderOffset);
      if (previousHeight) {
        document.documentElement.style.setProperty('--account-header-height', previousHeight);
      } else {
        document.documentElement.style.removeProperty('--account-header-height');
      }
    };
  }, []);

  function toggleSidebar() {
    const collapse = !sidebarCollapsed;
    if (collapse && sidebarRef.current?.contains(document.activeElement)) {
      toggleRef.current?.focus();
    }
    setSidebarCollapsed(collapse);
  }

  async function logout() {
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

  function handleLogoutDialogClose(confirmed) {
    setLogoutDialogOpen(false);
    if (confirmed) void logout();
  }

  return (
    <>
      <PageStyles bodyClass="account-page" stylesheets={stylesheets} title={title} />
      <header className="site-header account-site-header" ref={headerRef}>
        <div className="site-header__inner">
          <Link className="site-header__brand" to="/customer/html/home.html">
            <img className="site-header__logo" src="/customer/CustomerImages/brb-logo.png" alt="BRB Studios" />
          </Link>
          <nav className="site-header__nav" aria-label="Main">
            <Link className="site-header__link" to="/customer/html/home.html">Home</Link>
            <Link className="site-header__link" to="/customer/html/home.html#about">About</Link>
            <Link className="site-header__link" to="/customer/html/home.html#contact">Contact</Link>
            <Link className="site-header__link site-header__link--accent" to="/customer/html/book-service.html">My Profile</Link>
          </nav>
        </div>
      </header>

      <div className="account">
        <aside
          className="account__sidebar"
          id="accountSidebar"
          ref={sidebarRef}
          inert={sidebarCollapsed}
        >
          <img className="account__logo" src="/customer/CustomerImages/brb-logo.png" alt="BRB Studios" />
          <p className="account__eyebrow">Account</p>
          <p className="account__name">{customerName}</p>
          <nav className="account__menu" aria-label="Account">
            <Link className={`account__link${activePage === 'book-service' ? ' account__link--current' : ''}`} to="/customer/html/book-service.html">
              Book a service
            </Link>
            <Link className={`account__link${activePage === 'my-bookings' ? ' account__link--current' : ''}`} to="/customer/html/my-bookings.html">
              My bookings
            </Link>
            <Link className={`account__link${activePage === 'settings' ? ' account__link--current' : ''}`} to="/customer/html/settings.html">
              Settings
            </Link>
          </nav>
          <button
            className="account__logout"
            type="button"
            disabled={logoutPending}
            onClick={() => {
              setLogoutError('');
              setLogoutDialogOpen(true);
            }}
          >
            <span className="account__logout-icon" aria-hidden="true"></span>
            Logout
          </button>
          {logoutError && <p className="site-header__logout-status" role="alert">{logoutError}</p>}
        </aside>

        <button
          className="account-sidebar-toggle"
          ref={toggleRef}
          type="button"
          aria-controls="accountSidebar"
          aria-expanded={!sidebarCollapsed}
          aria-label={sidebarCollapsed ? 'Show customer navigation' : 'Hide customer navigation'}
          onClick={toggleSidebar}
        >
          <span className="account-sidebar-toggle__icon" aria-hidden="true">
            <span className="account-sidebar-toggle__line"></span>
            <span className="account-sidebar-toggle__line"></span>
            <span className="account-sidebar-toggle__line"></span>
          </span>
        </button>

        <main className="account__main">{children}</main>
      </div>
      <LogoutConfirmDialog open={logoutDialogOpen} onClose={handleLogoutDialogClose} />
    </>
  );
}
