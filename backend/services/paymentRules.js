const { BOOKING_STATUS } = require('../config/bookingStatus');

const CUSTOMER_BOOKING_STATUS = Object.freeze({
  FOR_VERIFICATION: 'For Verification',
});

function requiredDownpaymentCents(totalCents) {
  return Math.ceil(totalCents / 2);
}

function describePayment(totalCents, paidCents) {
  if (paidCents <= 0) return 'Unpaid';
  if (paidCents >= totalCents) return 'Fully Paid';
  if (paidCents >= requiredDownpaymentCents(totalCents)) return 'Downpayment Paid';
  return 'Partially Paid';
}

function statusAfterPayment(currentStatus, paidCents, totalCents) {
  const downpaymentReached = paidCents >= requiredDownpaymentCents(totalCents);

  return currentStatus === BOOKING_STATUS.TO_PAY && downpaymentReached
    ? BOOKING_STATUS.CONFIRMED
    : currentStatus;
}

function customerFacingBookingStatus(bookingStatus, hasPendingPayment) {
  return [BOOKING_STATUS.TO_PAY, BOOKING_STATUS.CONFIRMED].includes(bookingStatus) && hasPendingPayment
    ? CUSTOMER_BOOKING_STATUS.FOR_VERIFICATION
    : bookingStatus;
}

module.exports = {
  requiredDownpaymentCents,
  describePayment,
  statusAfterPayment,
  CUSTOMER_BOOKING_STATUS,
  customerFacingBookingStatus,
};
