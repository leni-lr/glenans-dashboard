// Pure card-ordering helpers. No DOM, no imports — safe to unit-test directly.

// The full ordered list of every known card key (visible AND hidden): the stored
// order first (known keys only, de-duplicated), then any registered card missing
// from the stored order, in registry order. Forward-compatible: a card added to
// the registry later still appears even if the user's saved order predates it.
export function orderedKeys(order, registryKeys) {
  const known = new Set(registryKeys);
  const seen = new Set();
  const out = [];
  for (const k of order || []) {
    if (known.has(k) && !seen.has(k)) { out.push(k); seen.add(k); }
  }
  for (const k of registryKeys) {
    if (!seen.has(k)) { out.push(k); seen.add(k); }
  }
  return out;
}

// The visible cards: orderedKeys minus the hidden set.
export function visibleKeys(order, hidden, registryKeys) {
  const hiddenSet = new Set(hidden || []);
  return orderedKeys(order, registryKeys).filter((k) => !hiddenSet.has(k));
}

// Immutably move list[from] to index `to`.
export function reorder(list, from, to) {
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}
