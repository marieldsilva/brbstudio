const { pool } = require('../config/db');
const { ONGOING_STATUSES } = require('../config/bookingRules');
const {
  REFERENCE,
  CLIENT_NAME,
  START_MINUTES,
  END_MINUTES,
  SERVICES_SUBQUERY,
  PENDING_PAYMENTS_SUBQUERY,
} = require('./bookingSql');

const quoteList = (values) => values.map((value) => `'${value}'`).join(', ');

const BOOKING_FIELDS = `b.booking_id AS id,
                        b.customer_id AS customerId,
                        DATE_FORMAT(b.event_date, '%Y-%m-%d') AS eventDate,
                        TIME_FORMAT(b.start_time, '%H:%i') AS startTime,
                        TIME_FORMAT(b.end_time, '%H:%i') AS endTime,
                        b.event_address AS eventAddress,
                        b.total_amount AS totalAmount,
                        b.amount_paid AS amountPaid,
                        b.voucher_code AS voucherCode,
                        b.voucher_consumed AS voucherConsumed,
                        b.status AS status`;

function escapeLike(text) {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function buildFilters({ search, serviceId, date }) {
  const conditions = [];
  const params = [];

  if (search) {
    const term = `%${escapeLike(search.replace(/^#/, ''))}%`;
    conditions.push(`(${CLIENT_NAME} LIKE ? OR c.email LIKE ? OR ${REFERENCE} LIKE ?)`);
    params.push(term, term, term);
  }

  if (serviceId) {
    conditions.push('EXISTS (SELECT 1 FROM booking_service x WHERE x.booking_id = b.booking_id AND x.service_id = ?)');
    params.push(serviceId);
  }

  if (date) {
    conditions.push('b.event_date = ?');
    params.push(date);
  }

  return { conditions, params };
}

function whereClause(conditions) {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

async function findPage(filters, status, limit, offset) {
  const { conditions, params } = buildFilters(filters);

  if (status) {
    conditions.push('b.status = ?');
    params.push(status);
  }

  const ongoing = quoteList(ONGOING_STATUSES);

  const [rows] = await pool.query(
    `SELECT b.booking_id AS id,
            ${REFERENCE} AS reference,
            ${CLIENT_NAME} AS customerName,
            c.email AS customerEmail,
            ${SERVICES_SUBQUERY} AS services,
            DATE_FORMAT(b.event_date, '%Y-%m-%d') AS eventDate,
            ${START_MINUTES} AS startMinutes,
            ${END_MINUTES} AS endMinutes,
            b.status AS status,
            b.total_amount AS totalAmount,
            b.amount_paid AS amountPaid,
            ${PENDING_PAYMENTS_SUBQUERY} AS pendingPayments
       FROM booking b
       JOIN customer c ON c.customer_id = b.customer_id
       ${whereClause(conditions)}
      ORDER BY CASE WHEN b.status IN (${ongoing}) THEN 0 WHEN b.status = 'Completed' THEN 1 ELSE 2 END,
               CASE WHEN b.status IN (${ongoing}) THEN b.event_date END ASC,
               CASE WHEN b.status NOT IN (${ongoing}) THEN b.event_date END DESC,
               b.start_time, b.booking_id
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

async function countFiltered(filters, status) {
  const { conditions, params } = buildFilters(filters);

  if (status) {
    conditions.push('b.status = ?');
    params.push(status);
  }

  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM booking b
       JOIN customer c ON c.customer_id = b.customer_id
       ${whereClause(conditions)}`,
    params
  );
  return row.total;
}

async function countByStatus(filters) {
  const { conditions, params } = buildFilters(filters);

  const [rows] = await pool.query(
    `SELECT b.status AS status, COUNT(*) AS total
       FROM booking b
       JOIN customer c ON c.customer_id = b.customer_id
       ${whereClause(conditions)}
      GROUP BY b.status`,
    params
  );
  return rows;
}

module.exports = {
  findPage,
  countFiltered,
  countByStatus
};
