const CUSTOMER_FONT = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:ital,wght@0,400;0,500;0,700;1,400&display=swap';
const ADMIN_FONT = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap';

export const HOME_PAGE_STYLES = [
  CUSTOMER_FONT,
  '/customer/css/customer-base.css',
  '/customer/css/site-header.css',
  '/customer/css/home.css',
  '/customer/css/calendar.css',
  '/customer/css/home-calendar.css',
];

export const AUTH_PAGE_STYLES = [
  CUSTOMER_FONT,
  '/customer/css/customer-base.css',
  '/customer/css/auth.css',
];

export const LOGIN_PAGE_STYLES = [...AUTH_PAGE_STYLES, '/customer/css/login.css'];
export const REGISTER_PAGE_STYLES = [...AUTH_PAGE_STYLES, '/customer/css/register.css'];

export const ACCOUNT_SHARED_STYLES = [
  CUSTOMER_FONT,
  '/customer/css/customer-base.css',
  '/customer/css/site-header.css',
  '/customer/css/account-layout.css',
];

export const ACCOUNT_PAGE_STYLES = {
  'book-service': ['/customer/css/booking.css', '/customer/css/calendar.css'],
  'my-bookings': [
    '/customer/css/auth.css',
    '/customer/css/calendar.css',
    '/customer/css/my-bookings.css',
  ],
  settings: ['/customer/css/auth.css', '/customer/css/settings.css'],
};

export const CONTRACT_PAGE_STYLES = [
  CUSTOMER_FONT,
  '/customer/css/customer-base.css',
  '/customer/css/contract.css',
];

export const ADMIN_SHARED_STYLES = [
  ADMIN_FONT,
  '/admin/css/base.css',
  '/admin/css/layout.css',
  '/admin/css/sidebar.css',
  '/admin/css/components.css',
];

export const ADMIN_PAGE_STYLES = {
  dashboard: ['/admin/css/dashboard.css'],
  payments: ['/admin/css/payments.css'],
  bookings: ['/admin/css/bookings.css'],
  calendar: ['/admin/css/calendar.css'],
  clients: ['/admin/css/clients.css'],
  reports: ['/admin/css/reports.css'],
  'reschedule-requests': ['/admin/css/reschedule-requests.css'],
  services: ['/admin/css/services.css'],
  vouchers: ['/admin/css/vouchers.css'],
};

export const ADMIN_NEW_BOOKING_STYLES = ['/admin/css/new-booking.css'];
