import { tideHeightAt } from "../charts/tidecurve.js";

// Water level (m above chart datum) at or above which the boat clears the rock:
// the rock's drying height plus the boat's draught.
export function rockThreshold(rock) {
  return rock.height + rock.draft;
}

// The first time (fractional hours) after `fromTh` at which the tide curve crosses
// `threshold`, scanning in 1-minute steps. null if it never crosses within the
// model's covered window.
export function nextCrossing(extremes, threshold, fromTh) {
  const end = extremes[extremes.length - 1].th;
  const step = 1 / 60;
  let prev = tideHeightAt(extremes, fromTh) - threshold;
  for (let th = fromTh + step; th <= end + 1e-9; th += step) {
    const cur = tideHeightAt(extremes, th) - threshold;
    if ((prev <= 0 && cur > 0) || (prev > 0 && cur <= 0)) return th;
    prev = cur;
  }
  return null;
}

// Live safety for a rock at time `nowTh`. safe === water level strictly above the
// threshold. crossingTh is when that status next flips (or null).
export function rockStatusAt(extremes, rock, nowTh) {
  const threshold = rockThreshold(rock);
  const level = tideHeightAt(extremes, nowTh);
  const safe = level > threshold;
  const crossingTh = nextCrossing(extremes, threshold, nowTh);
  return { safe, level, threshold, crossingTh };
}

// Fractional hours-from-midnight -> "14h24" clock label (wraps past 24 h).
export function thToClock(th) {
  const total = Math.round((((th % 24) + 24) % 24) * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${hh}h${String(mm).padStart(2, "0")}`;
}
