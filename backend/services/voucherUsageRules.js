function getSafeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

function getRemainingUses(usageLimit, usedCount) {
  return Math.max(0, getSafeCount(usageLimit) - getSafeCount(usedCount));
}

function canSetUsageLimit(usageLimit, usedCount) {
  return Number(usageLimit) >= getSafeCount(usedCount);
}

module.exports = { getSafeCount, getRemainingUses, canSetUsageLimit };