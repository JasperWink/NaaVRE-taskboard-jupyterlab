// Small helpers shared by the assignee UI.

import ColorHash from 'color-hash';

/**
 * A stable colour for a name, so the same assignee always gets the same avatar
 * chip everywhere on the board.
 *
 * Copied from the workflow extension (`src/utils/chart.ts`, where port
 * variables are coloured the same way) rather than imported: keeping this
 * package free of any build-time dependency on the workflow extension is the
 * point of the split. Both use the same hash, so a person's colour matches
 * across the two extensions.
 */
export function getVariableColor(name: string) {
  const colorHash = new ColorHash();
  return colorHash.hex(name);
}

/**
 * Up to two initials for an assignee name, used on avatar chips.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
