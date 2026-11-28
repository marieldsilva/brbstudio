const express = require('express');
const calendarController = require('../controllers/calendarController');

const router = express.Router();

router.get('/month', calendarController.getMonthOverview);
router.get('/day', calendarController.getDayDetails);
router.get('/blocked-dates', calendarController.listBlockedDates);
router.post('/blocked-dates', calendarController.blockDate);
router.delete('/blocked-dates/:date', calendarController.unblockDate);
router.post('/blocked-times', calendarController.blockTime);
router.delete('/blocked-times/:id', calendarController.unblockTime);

module.exports = router;
