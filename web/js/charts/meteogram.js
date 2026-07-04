// Pure helpers for the wind meteogram. (The SVG builder is added in Task 3.)

// Top of the y-axis in knots. Baseline 35 keeps the 10/20/30 gridlines tidy;
// expand past 32kn gusts to the next multiple of 10 at/above max+3 for headroom.
export function computeYMax(gusts) {
  const max = gusts.length ? Math.max(...gusts) : 0;
  if (max > 32) return Math.ceil((max + 3) / 10) * 10;
  return 35;
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function degToCardinal(deg) {
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// One hour's values for the tap tooltip.
export function tooltipAt(data, i) {
  return {
    time: data.times[i],
    mean: data.speed[i],
    gust: data.gust[i],
    dir: data.dir[i],
    cardinal: degToCardinal(data.dir[i]),
  };
}
