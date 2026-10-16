export function readLocation(search: string, defaultZoom = 1.5) {
  const params = new URLSearchParams(search);
  const number = (name: string, fallback: number, min: number, max: number) => {
    const value = params.get(name);
    const parsed = value === null ? fallback : Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  };
  return {
    x: number('x', 0, -1000000, 1000000),
    y: number('y', 0, -1000000, 1000000),
    zoom: number('zoom', defaultZoom, 0.15, 6),
  };
}
export function locationUrl(
  origin: string,
  pathname: string,
  x: number,
  y: number,
  zoom: number,
  entityId?: string,
  mode: string | null = 'classic',
) {
  const url = new URL(pathname, origin);
  // null preserves the current mode (including the default Permanent canvas).
  if (mode !== null) url.searchParams.set('mode', mode);
  url.searchParams.set('x', String(Math.round(x)));
  url.searchParams.set('y', String(Math.round(y)));
  url.searchParams.set('zoom', zoom.toFixed(2));
  url.searchParams.delete('entity');
  if (entityId) url.searchParams.set('entity', entityId);
  return url.toString();
}
