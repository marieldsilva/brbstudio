const AppError = require('./appError');
const { pool, withTransaction } = require('../config/db');
const { BOOKING_HOURS, SCHEDULE_CONFLICT_STATUSES } = require('../config/bookingRules');
const bookingModel = require('../models/bookingModel');
const blockedDateModel = require('../models/blockedDateModel');
const blockedTimeModel = require('../models/blockedTimeModel');
const bookingManagementModel = require('../models/bookingManagementModel');
const { CALENDAR_STATUSES, UPCOMING_STATUSES } = require('../config/bookingStatus');
const {
  businessTimeMinutes,
  formatMinutes,
  isValidIsoDate,
  timeTextToMinutes,
  todayIso,
} = require('./timeHelper');

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MYSQL_DUPLICATE_ENTRY = 'ER_DUP_ENTRY';
const HOUR_PATTERN = /^(?:[01]\d|2[0-3]):00$/;

function requireDate(value) {
  if (!isValidIsoDate(value)) {
    const message = 'Date must be a valid YYYY-MM-DD value.';
    throw new AppError(message, 400, { date: message });
  }

  return value;
}

function monthRange(month) {
  if (!MONTH_PATTERN.test(month ?? '')) {
    throw new AppError('Month must be in YYYY-MM format.', 400, { month: 'Month must be in YYYY-MM format.' });
  }

  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0');

  return { start: `${month}-01`, end: `${month}-${lastDay}` };
}

function toBookingSummary(row) {
  return {
    id: row.id,
    clientName: row.clientName,
    services: row.serviceNames,
    status: row.status,
    startMinutes: Number(row.startMinutes),
    endMinutes: Number(row.endMinutes),
    timeLabel: `${formatMinutes(row.startMinutes)} - ${formatMinutes(row.endMinutes)}`,
  };
}

function parseHourlyBlock(startTime) {
  const message = 'Choose a whole-hour interval within studio operating hours.';
  if (!HOUR_PATTERN.test(startTime ?? '')) {
    throw new AppError(message, 400, { startTime: message });
  }

  const start = timeTextToMinutes(startTime);
  const end = start + 60;
  const opens = timeTextToMinutes(BOOKING_HOURS.open);
  const closes = timeTextToMinutes(BOOKING_HOURS.close);

  if (start < opens || end > closes) {
    throw new AppError(message, 400, { startTime: message });
  }

  return {
    startTime,
    endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
    start,
    end,
  };
}

function intervalsOverlap(first, second) {
  return first.start < second.end && first.end > second.start;
}

function currentMinutes() {
  return businessTimeMinutes(new Date());
}

async function getMonthOverview(month) {
  const { start, end } = monthRange(month);

  const [bookedDates, blockedDates] = await Promise.all([
    bookingModel.findBookedDates(start, end, CALENDAR_STATUSES),
    blockedDateModel.findBetween(start, end),
  ]);

  return { month, bookedDates, blockedDates };
}

async function getBlockedDatesInMonth(month) {
  const { start, end } = monthRange(month);

  return { month, blockedDates: await blockedDateModel.findBetween(start, end) };
}

async function getDayDetails(date) {
  requireDate(date);

  const [bookings, blocked, blockedTimes, busyIntervals] = await Promise.all([
    bookingModel.findOnDate(date, CALENDAR_STATUSES),
    blockedDateModel.exists(date),
    blockedTimeModel.findOnDate(pool, date),
    bookingManagementModel.findBusyIntervals(pool, { date, statuses: SCHEDULE_CONFLICT_STATUSES }),
  ]);

  return {
    date,
    blocked,
    bookings: bookings.map(toBookingSummary),
    busyIntervals: busyIntervals.map(({ start, end }) => ({ startMinutes: start, endMinutes: end })),
    blockedTimes: blockedTimes.map((block) => ({
      id: block.id,
      startTime: block.startTime,
      endTime: block.endTime,
      startMinutes: Number(block.startMinute),
      endMinutes: Number(block.endMinute),
    })),
  };
}

async function getPublicDayAvailability(date) {
  requireDate(date);

  const [bookedServices, blocked] = await Promise.all([
    bookingModel.findBookedServices(date, UPCOMING_STATUSES),
    blockedDateModel.exists(date),
  ]);

  return {
    date,
    blocked,
    booked: bookedServices.map((row) => ({
      serviceName: row.serviceName,
      startMinutes: row.startMinutes,
      endMinutes: row.endMinutes,
      timeLabel: `${formatMinutes(row.startMinutes)} - ${formatMinutes(row.endMinutes)}`,
    })),
  };
}

function listUpcomingBlockedDates() {
  return blockedDateModel.findFrom(todayIso());
}

async function blockDate(date) {
  requireDate(date);

  if (date < todayIso()) {
    const message = "A date that has already passed can't be blocked.";
    throw new AppError(message, 400, { date: message });
  }

  await withTransaction(async (connection) => {
    await bookingManagementModel.lockScheduleDate(connection, date);
    try {
      await blockedDateModel.create(date, connection);
    } catch (error) {
      if (error.code === MYSQL_DUPLICATE_ENTRY) {
        const message = 'This date is already blocked.';
        throw new AppError(message, 409, { date: message });
      }
      throw error;
    }
  });

  return { date };
}

async function unblockDate(date) {
  requireDate(date);

  const removed = await withTransaction(async (connection) => {
    await bookingManagementModel.lockScheduleDate(connection, date);
    return blockedDateModel.remove(date, connection);
  });

  if (!removed) throw new AppError('This date is not blocked.', 404);
}

async function blockTime(date, startTime) {
  requireDate(date);
  const today = todayIso();
  if (date < today) {
    throw new AppError("A time on a date that has passed can't be blocked.", 400, {
      date: 'Choose today or a future date.',
    });
  }

  const interval = parseHourlyBlock(startTime);
  if (date === today && interval.start <= currentMinutes()) {
    throw new AppError('This hour has already started and cannot be blocked.', 400, {
      startTime: 'Choose a future hour.',
    });
  }

  return withTransaction(async (connection) => {
    await bookingManagementModel.lockScheduleDate(connection, date);

    if (await blockedDateModel.exists(date, connection)) {
      throw new AppError('This date is already blocked.', 409, { date: 'This date is already blocked.' });
    }

    const [bookingIntervals, blockedIntervals] = await Promise.all([
      bookingManagementModel.findBusyIntervals(connection, {
        date,
        statuses: SCHEDULE_CONFLICT_STATUSES,
        forUpdate: true,
      }),
      blockedTimeModel.findOnDate(connection, date, { forUpdate: true }),
    ]);

    if (bookingIntervals.some((busy) => intervalsOverlap(interval, busy))) {
      throw new AppError('This hour overlaps an existing booking.', 409, {
        startTime: 'This hour overlaps an existing booking.',
      });
    }

    if (blockedIntervals.some((busy) => intervalsOverlap(interval, {
      start: Number(busy.startMinute),
      end: Number(busy.endMinute),
    }))) {
      throw new AppError('This hour is already blocked.', 409, { startTime: 'This hour is already blocked.' });
    }

    const id = await blockedTimeModel.create(connection, {
      date,
      startTime: interval.startTime,
      endTime: interval.endTime,
    });
    return { id, date, startTime: interval.startTime, endTime: interval.endTime };
  });
}

async function unblockTime(rawId) {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) throw new AppError('Blocked time not found.', 404);

  const block = await blockedTimeModel.findById(pool, id);
  if (!block) throw new AppError('Blocked time not found.', 404);

  const removed = await withTransaction(async (connection) => {
    await bookingManagementModel.lockScheduleDate(connection, block.date);
    return blockedTimeModel.remove(connection, id);
  });

  if (!removed) throw new AppError('Blocked time not found.', 404);
}

module.exports = {
  getMonthOverview,
  getBlockedDatesInMonth,
  getDayDetails,
  getPublicDayAvailability,
  listUpcomingBlockedDates,
  blockDate,
  unblockDate,
  blockTime,
  unblockTime,
  parseHourlyBlock,
};
