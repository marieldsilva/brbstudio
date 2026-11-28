const bcrypt = require('bcryptjs');
const customerModel = require('../models/customerModel');
const adminModel = require('../models/adminModel');
const AppError = require('./appError');

const SALT_ROUNDS = 10;
const MYSQL_DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

const LOGIN_PAGE = '/customer/html/login.html';
const CUSTOMER_HOME = '/customer/html/home.html';
const ADMIN_HOME = '/admin/html/dashboard.html';

const ROLE = Object.freeze({ ADMIN: 'admin', CUSTOMER: 'customer' });

const NAME_PATTERN = /^\p{L}[\p{L} .'-]*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_PATTERN = /^09\d{9}$/;

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS);

const asText = (value) => String(value ?? '');

function normalizeRegistration(body = {}) {
  return {
    firstName: asText(body.firstName).trim(),
    lastName: asText(body.lastName).trim(),
    email: asText(body.email).trim().toLowerCase(),
    contactNumber: asText(body.contactNumber).replace(/[\s-]/g, ''),
    password: asText(body.password),
    confirmPassword: asText(body.confirmPassword),
  };
}

function validateName(value, label) {
  if (!value) return `${label} is required.`;
  if (value.length > 50) return `${label} must be 50 characters or fewer.`;
  if (!NAME_PATTERN.test(value)) {
    return `${label} can only contain letters, spaces, apostrophes and hyphens.`;
  }
  return null;
}

function validatePassword(password) {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 72) return 'Password must be 72 characters or fewer.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

function validateRegistration(data) {
  const errors = {
    firstName: validateName(data.firstName, 'First name'),
    lastName: validateName(data.lastName, 'Last name'),
    email: null,
    contactNumber: null,
    password: validatePassword(data.password),
    confirmPassword: null,
  };

  if (!data.email) errors.email = 'Email address is required.';
  else if (data.email.length > 100 || !EMAIL_PATTERN.test(data.email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!data.contactNumber) errors.contactNumber = 'Contact number is required.';
  else if (!CONTACT_PATTERN.test(data.contactNumber)) {
    errors.contactNumber = 'Enter a valid mobile number, e.g. 09123456789.';
  }

  if (!errors.password && data.password !== data.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match. Please re-enter your password.';
  }

  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
}

function toPublicProfile(customer) {
  return {
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
  };
}

function toAdminProfile(admin) {
  return {
    id: admin.id,
    firstName: admin.firstName,
    lastName: admin.lastName,
    email: admin.email,
  };
}

const emailTakenError = () =>
  new AppError('This email is already registered.', 409, {
    email: 'This email is already registered.',
  });

async function registerCustomer(body) {
  const data = normalizeRegistration(body);

  const errors = validateRegistration(data);
  if (Object.keys(errors).length > 0) {
    throw new AppError('Please fix the highlighted fields.', 400, errors);
  }

  if (await customerModel.findByEmail(data.email)) throw emailTakenError();

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  try {
    const id = await customerModel.create({ ...data, passwordHash });
    return toPublicProfile({ ...data, id });
  } catch (error) {
    if (error.code === MYSQL_DUPLICATE_ENTRY) throw emailTakenError();
    throw error;
  }
}

function readCredentials(body = {}) {
  const email = asText(body.email).trim().toLowerCase();
  const password = asText(body.password);

  const errors = {};
  if (!email) errors.email = 'Email address is required.';
  if (!password) errors.password = 'Password is required.';
  if (Object.keys(errors).length > 0) {
    throw new AppError('Please enter your email address and password.', 400, errors);
  }

  return { email, password };
}

const invalidLoginError = () => new AppError('Invalid email or password.', 401);

// One login form serves both roles: the admin table is checked first, then the customer table.
async function authenticateUser(body) {
  const { email, password } = readCredentials(body);

  const admin = await adminModel.findByEmail(email);

  if (admin) {
    if (!(await bcrypt.compare(password, admin.passwordHash))) throw invalidLoginError();

    return { role: ROLE.ADMIN, profile: toAdminProfile(admin), redirectTo: ADMIN_HOME };
  }

  const customer = await customerModel.findByEmail(email);
  const passwordMatches = await bcrypt.compare(password, customer ? customer.passwordHash : DUMMY_HASH);

  if (!customer || !passwordMatches) throw invalidLoginError();

  return { role: ROLE.CUSTOMER, profile: toPublicProfile(customer), redirectTo: CUSTOMER_HOME };
}

module.exports = {
  LOGIN_PAGE,
  CUSTOMER_HOME,
  ADMIN_HOME,
  ROLE,
  registerCustomer,
  authenticateUser,
};
