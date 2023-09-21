function calculateWma(scores, wmaPeriod) {
  // if not enough scores to calculate Period, return null
  if (scores.length < wmaPeriod) return null;
  const wmaNumerator = scores.slice(0, wmaPeriod).reduce((accum, curr, idx) => {
    return accum + curr.score * (wmaPeriod - idx);
  }, 0);
  const wmaDenominator = (wmaPeriod * (wmaPeriod + 1)) / 2;
  const wmaCalculation = wmaNumerator / wmaDenominator;
  const wmaCalculationRounded = Math.round(wmaCalculation * 100) / 100;

  return wmaCalculationRounded;
}

module.exports = { calculateWma }