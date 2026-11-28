const path = require('path');

const ADMIN_PAGES_ROOT = '/admin/html';
const LOGIN_PAGE = '/customer/html/login.html';

// Guards every /api/admin/* endpoint. Only a session created by the admin login passes.
function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({ message: 'Administrator login required.' });
  }

  next();
}

function isAdminPagePath(requestPath) {
  let decoded;

  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return false;
  }

  // Normalise so encoded, backslashed or doubled-slash variants cannot slip past the check.
  const normalized = path.posix.normalize(decoded.replace(/\\/g, '/')).toLowerCase();

  return normalized === ADMIN_PAGES_ROOT || normalized.startsWith(`${ADMIN_PAGES_ROOT}/`);
}

// Guards the admin HTML pages so typing the URL no longer opens them without logging in.
function requireAdminPage(req, res, next) {
  if (!isAdminPagePath(req.path)) return next();

  if (!req.session.admin) return res.redirect(LOGIN_PAGE);

  // Keeps the browser's Back button from showing an admin page after logout.
  res.set('Cache-Control', 'no-store');
  next();
}

module.exports = { requireAdmin, requireAdminPage };
