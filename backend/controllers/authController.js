const authService = require('../services/authService');
const sendError = require('./errorResponse');

const SESSION_COOKIE = 'brb.sid';

function startSession(req, role, profile) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((regenerateError) => {
      if (regenerateError) return reject(regenerateError);

      req.session[role] = profile;
      req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
    });
  });
}

async function register(req, res, next) {
  try {
    await authService.registerCustomer(req.body);

    res.status(201).json({
      message: 'Account created successfully.',
      redirectTo: `${authService.LOGIN_PAGE}?registered=1`,
    });
  } catch (error) {
    sendError(error, res, next);
  }
}

async function login(req, res, next) {
  try {
    const { role, profile, redirectTo } = await authService.authenticateUser(req.body);
    await startSession(req, role, profile);

    res.json({ message: 'Login successful.', role, redirectTo, [role]: profile });
  } catch (error) {
    sendError(error, res, next);
  }
}

function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie(SESSION_COOKIE);
    res.json({ message: 'Logged out.', redirectTo: authService.LOGIN_PAGE });
  });
}

function getCurrentCustomer(req, res) {
  if (!req.session.customer) {
    return res.status(401).json({ message: 'Not logged in.' });
  }
  res.json({ customer: req.session.customer });
}

function getCurrentAdmin(req, res) {
  if (!req.session.admin) {
    return res.status(401).json({ message: 'Administrator login required.' });
  }
  res.json({ admin: req.session.admin });
}

module.exports = { register, login, logout, getCurrentCustomer, getCurrentAdmin };
