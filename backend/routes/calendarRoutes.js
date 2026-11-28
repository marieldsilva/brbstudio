const express = require('express');
const calendarController = require('../controllers/calendarController');

const router = express.Router();

router.get('/month', calendarController.getMonthOverview);
router.get('/blocked-dates', calendarController.getBlockedDatesInMonth);
router.get('/day', calendarController.getPublicDayAvailability);
router.get('/hours', calendarController.getBookingHours);
router.get('/availability', calendarController.getAvailability);

module.exports = router;
