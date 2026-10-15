import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getLocale,
  initializeLocale,
  isLocale,
  LOCALE_STORAGE_KEY,
  setLocale,
  translate,
} from './locale';

afterEach(() => {
  setLocale('en');
  vi.unstubAllGlobals();
});

describe('interface locale', () => {
  it('accepts only the supported language codes', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it('provides English and Arabic messages with value interpolation', () => {
    expect(translate('welcome.start', 'en')).toBe('START DRAWING NOW');
    expect(translate('welcome.start', 'ar')).toBe('ابدأ الرسم الآن');
    expect(translate('footer.retry', 'ar', { count: 3 })).toBe(
      'إعادة إرسال العناصر غير المرسلة: 3',
    );
  });

  it('keeps an English interface even with a saved Arabic preference', () => {
    const values = new Map<string, string>();
    const attributes = new Map<string, string>();
    const updatedMeta = new Map<string, string>();
    const root = {
      dataset: {} as Record<string, string>,
      set lang(value: string) {
        attributes.set('lang', value);
      },
      set dir(value: string) {
        attributes.set('dir', value);
      },
    };
    const documentStub = {
      documentElement: root,
      title: '',
      querySelector: (selector: string) => ({
        setAttribute: (_name: string, value: string) => updatedMeta.set(selector, value),
      }),
    };
    const storageStub = {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('localStorage', storageStub);

    values.set(LOCALE_STORAGE_KEY, 'ar');
    initializeLocale();
    setLocale('ar');

    expect(getLocale()).toBe('en');
    expect(values.get(LOCALE_STORAGE_KEY)).toBe('en');
    expect(attributes.get('lang')).toBe('en');
    expect(attributes.get('dir')).toBe('ltr');
    expect(root.dataset.locale).toBe('en');
    expect(documentStub.title).toContain('Forgotten Network');
    expect(updatedMeta.get('meta[name="description"]')).toContain('Leave a mark');
  });
});
