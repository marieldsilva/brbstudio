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

function readListQuery(query) {
  const status = asText(query.status);
  const date = asText(query.date);
  const search = asText(query.search).slice(0, MAX_SEARCH_LENGTH);

  if (status && status !== 'all' && !ALL_STATUSES.includes(status)) {
    throw new AppError('Unknown booking status.', 400, { status: 'Unknown booking status.' });
  }
  if (date && !isValidIsoDate(date)) {
    throw new AppError('Date must be a valid YYYY-MM-DD value.', 400, { date: 'Enter a valid date.' });
  }

  return {
    filters: {
      search: search || null,
      serviceId: parsePositiveInteger(query.serviceId, null),
      date: date || null,
    },
    status: status && status !== 'all' ? status : null,
    page: parsePositiveInteger(query.page, 1),
    pageSize: Math.min(parsePositiveInteger(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE),
  };
}

function toListEntry(row) {
  const totalCents = toCents(row.totalAmount);
  const paidCents = toCents(row.amountPaid);

  return {
    id: row.id,
    reference: row.reference,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    services: splitServices(row.services),
    eventDate: row.eventDate,
    timeLabel: formatTimeRange(row.startMinutes, row.endMinutes),
    status: row.status,
    group: GROUP_BY_STATUS[row.status],
    totalAmount: fromCents(totalCents),
    amountPaid: fromCents(paidCents),
    paymentLabel: describePayment(totalCents, paidCents),
    pendingPayments: row.pendingPayments,
  };
}

async function listBookings(query = {}) {
  const { filters, status, page, pageSize } = readListQuery(query);

  const [rows, total, statusCounts] = await Promise.all([
    bookingManagementModel.findPage(filters, status, pageSize, (page - 1) * pageSize),
    bookingManagementModel.countFiltered(filters, status),
    bookingManagementModel.countByStatus(filters),
  ]);

  const counts = Object.fromEntries(ALL_STATUSES.map((name) => [name, 0]));
  statusCounts.forEach((row) => {
    counts[row.status] = row.total;
  });
  counts.all = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return { bookings: rows.map(toListEntry), page, pageSize, total, counts };
}

module.exports = {
  listBookings
};
