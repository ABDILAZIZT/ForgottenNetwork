export function readLocation(search: string) {
  const params = new URLSearchParams(search);
  const number = (name: string, fallback: number, min: number, max: number) => {
    const value = params.get(name);
    const parsed = value === null ? fallback : Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  };
  return {
    x: number('x', 0, -1000000, 1000000),
    y: number('y', 0, -1000000, 1000000),
    zoom: number('zoom', 1.5, 0.15, 6),
  };
}
export function locationUrl(
  origin: string,
  pathname: string,
  x: number,
  y: number,
  zoom: number,
  entityId?: string,
) {
  const url = new URL(pathname, origin);
  // This helper is used by Classic Studio; preserve the canvas mode in shared links.
  url.searchParams.set('mode', 'classic');
  url.searchParams.set('x', String(Math.round(x)));
  url.searchParams.set('y', String(Math.round(y)));
  url.searchParams.set('zoom', zoom.toFixed(2));
  if (entityId) url.searchParams.set('entity', entityId);
  return url.toString();
}
