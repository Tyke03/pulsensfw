import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function lum(hex: string): number {
  const c = hex.replace('#', '');
  const rgb = [0, 2, 4].map((index) => parseInt(c.slice(index, index + 2), 16) / 255);
  const linear = rgb.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: string, b: string): number {
  const left = lum(a);
  const right = lum(b);
  const [hi, lo] = left > right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}

test('core text and button pairs clear WCAG AA', () => {
  const css = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8');
  const value = (name: string) => {
    const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, `missing ${name}`);
    return match[1]!;
  };
  const pairs: Array<[string, string, number]> = [
    ['--text', '--bg-0', 4.5],
    ['--text', '--bg-1', 4.5],
    ['--text', '--bg-2', 4.5],
    ['--text', '--bg-3', 4.5],
    ['--text-soft', '--bg-0', 4.5],
    ['--text-soft', '--bg-1', 4.5],
    ['--text-soft', '--bg-2', 4.5],
    ['--magenta', '--bg-0', 4.5],
    ['--cyan', '--bg-0', 4.5],
    ['--text', '--magenta-strong', 4.5],
  ];
  for (const [fg, bg, min] of pairs) {
    const ratio = contrast(value(fg), value(bg));
    assert.ok(ratio >= min, `${fg} on ${bg} is ${ratio.toFixed(2)}`);
  }
});
