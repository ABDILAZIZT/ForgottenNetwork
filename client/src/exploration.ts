export interface Activity {
  id: string;
  text: string;
  x: number;
  y: number;
  at: number;
}
export interface Exploration {
  pixels: number;
  places: string[];
  badges: string[];
  activity: Activity[];
}
export function readExploration(): Exploration {
  try {
    const value = JSON.parse(localStorage.getItem('fn_exploration') || 'null');
    if (
      value &&
      Number.isSafeInteger(value.pixels) &&
      value.pixels >= 0 &&
      Array.isArray(value.places) &&
      Array.isArray(value.badges) &&
      Array.isArray(value.activity)
    )
      return {
        pixels: value.pixels,
        places: value.places.filter((s: unknown) => typeof s === 'string').slice(-100),
        badges: value.badges.filter((s: unknown) => typeof s === 'string'),
        activity: value.activity
          .filter(
            (a: Activity) =>
              a &&
              typeof a.id === 'string' &&
              typeof a.text === 'string' &&
              Number.isFinite(a.x) &&
              Number.isFinite(a.y) &&
              Number.isFinite(a.at),
          )
          .slice(-20),
      };
  } catch {
    /* Optional progress must never block drawing. */
  }
  return { pixels: 0, places: [], badges: [], activity: [] };
}
export function recordExploration(x: number, y: number, pixels = 0, text?: string, id?: string) {
  const state = readExploration();
  if (id && state.activity.some((entry) => entry.id === id)) return;
  const place = `${Math.floor(x / 512)},${Math.floor(y / 512)}`;
  if (!state.places.includes(place)) state.places = [...state.places, place].slice(-100);
  state.pixels += Math.max(0, Math.floor(pixels));
  const badges = new Set(state.badges);
  badges.add('First Steps');
  if (new Date().getHours() >= 22 || new Date().getHours() < 5) badges.add('Night Owl');
  if (state.pixels >= 100) badges.add('100 Pixels');
  if (state.places.length >= 5) badges.add('Explorer');
  if (state.places.length >= 20) badges.add('Cartographer');
  state.badges = [...badges];
  if (text)
    state.activity = [
      ...state.activity,
      { id: id || crypto.randomUUID(), text, x, y, at: Date.now() },
    ].slice(-20);
  try {
    localStorage.setItem('fn_exploration', JSON.stringify(state));
  } catch {
    return;
  }
  window.dispatchEvent(new Event('fn-exploration-change'));
}
