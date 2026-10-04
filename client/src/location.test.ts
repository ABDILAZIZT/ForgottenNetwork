import { expect, it } from 'vitest';
import { readLocation, locationUrl } from './location';
it('location links preserve position, zoom and entity identity', () => {
  const url = new URL(locationUrl('https://world.example', '/', 25, -90, 2.5, 'sample'));
  expect(readLocation(url.search)).toEqual({ x: 25, y: -90, zoom: 2.5 });
  expect(url.searchParams.get('entity')).toBe('sample');
  expect(url.searchParams.get('mode')).toBe('classic');
});
it('invalid location parameters remain safe', () => {
  expect(readLocation('?x=Infinity&y=-9999999&zoom=50')).toEqual({ x: 0, y: -1000000, zoom: 6 });
  expect(readLocation('')).toEqual({ x: 0, y: 0, zoom: 1.5 });
});
