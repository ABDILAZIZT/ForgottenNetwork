import { setLocale, translate, useLocale } from './locale';

export default function LocaleControl({ className = '' }: { className?: string }) {
  const locale = useLocale();
  const next = locale === 'en' ? 'ar' : 'en';
  return (
    <button
      type="button"
      className={`fn-locale-switch ${className}`.trim()}
      lang={next}
      dir="auto"
      aria-label={translate('language.switchLabel', locale)}
      title={translate('language.switchLabel', locale)}
      aria-pressed={locale === 'ar'}
      onClick={() => setLocale(next)}
    >
      {translate('language.switch', locale)}
    </button>
  );
}
