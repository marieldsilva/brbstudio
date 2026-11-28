const AppError = require('./appError');
const { pool, withTransaction } = require('../config/db');
const { BOOKING_STATUS } = require('../config/bookingStatus');
const {
  ONGOING_STATUSES,
  STATUS_TRANSITIONS,
  GROUP_BY_STATUS,
} = require('../config/bookingRules');
const bookingManagementModel = require('../models/bookingManagementModel');
const { splitServices } = require('../models/bookingSql');
const { toCents, fromCents } = require('./money');
const { describePayment } = require('./paymentRules');

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;
const ALL_STATUSES = Object.values(BOOKING_STATUS);

const asText = (value) => String(value ?? '').trim();

function parsePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

