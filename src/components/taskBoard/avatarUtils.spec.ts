import { getVariableColor, initials } from './avatarUtils';

describe('initials', () => {
  it('takes the first two letters of a single name', () => {
    expect(initials('Ada')).toBe('AD');
  });

  it('takes the first and last initials of a full name', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('Ada King Lovelace')).toBe('AL');
  });

  it('ignores surrounding and repeated whitespace', () => {
    expect(initials('  Ada   Lovelace  ')).toBe('AL');
  });

  it('returns an empty string for an empty or blank name', () => {
    // Avatar chips render this directly, so it must never be undefined.
    expect(initials('')).toBe('');
    expect(initials('   ')).toBe('');
  });

  it('handles a one-letter name without padding it', () => {
    expect(initials('A')).toBe('A');
  });

  it('is never longer than two characters', () => {
    for (const name of ['Ada', 'Ada Lovelace', 'A B C D E', 'x']) {
      expect(initials(name).length).toBeLessThanOrEqual(2);
    }
  });
});

describe('getVariableColor', () => {
  it('is stable for the same name', () => {
    // The same assignee must get the same avatar colour on every card, on
    // every client, across reloads.
    expect(getVariableColor('Ada')).toBe(getVariableColor('Ada'));
  });

  it('returns a CSS hex colour', () => {
    expect(getVariableColor('Ada')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('distinguishes different names', () => {
    expect(getVariableColor('Ada')).not.toBe(getVariableColor('Grace'));
  });
});
