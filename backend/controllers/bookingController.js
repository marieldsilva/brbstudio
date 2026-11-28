const bookingService = require('../services/bookingManagementService');
const sendError = require('./errorResponse');

async function list(req, res, next) {
  try {
    res.json(await bookingService.listBookings(req.query));
  } catch (error) {
    sendError(error, res, next);
  }
}

module.exports = { list };