import { useSyncExternalStore } from 'react';

export const LOCALE_STORAGE_KEY = 'fn_interface_locale';
export type Locale = 'en' | 'ar';

const messages = {
  'language.switch': { en: 'العربية', ar: 'English' },
  'language.switchLabel': { en: 'Switch interface to Arabic', ar: 'حوّل الواجهة إلى الإنجليزية' },
  'policy.back': { en: '← Back to canvas', ar: '← العودة إلى اللوحة' },
  'policy.note': {
    en: 'Policy content remains in English.',
    ar: 'محتوى السياسات أدناه متاح باللغة الإنجليزية.',
  },
  'policy.community': { en: 'Community Rules', ar: 'قواعد المجتمع' },
  'policy.privacy': { en: 'Privacy Policy', ar: 'سياسة الخصوصية' },
  'policy.terms': { en: 'Terms of Service', ar: 'شروط الخدمة' },
  'policy.cookies': { en: 'Cookies & device storage', ar: 'ملفات تعريف الارتباط وتخزين الجهاز' },
  'policy.refunds': { en: 'Payments & refunds', ar: 'المدفوعات والمبالغ المستردة' },
  'policy.safety': { en: 'Safety & privacy requests', ar: 'السلامة وطلبات الخصوصية' },
  'policy.thirdParty': { en: 'Third-party licenses', ar: 'تراخيص الجهات الخارجية' },
  'brand.home': { en: 'Forgotten Network home', ar: 'العودة إلى الصفحة الرئيسية لشبكة النسيان' },
  'brand.subtitle': { en: 'THE PERMANENT CANVAS', ar: 'اللوحة الدائمة' },
  'header.hereNow': { en: 'here now', ar: 'هنا الآن' },
  'header.drawing': { en: 'drawing', ar: 'يرسمون' },
  'header.tools': { en: 'Tools', ar: 'الأدوات' },
  'header.toolsLabel': { en: 'Tools & saved worlds', ar: 'الأدوات والعوالم المحفوظة' },
  'header.studio': { en: 'Studio', ar: 'الاستوديو' },
  'header.publish': { en: 'Publish', ar: 'نشر' },
  'header.theme': { en: 'Toggle color theme', ar: 'تبديل سمة الألوان' },
  'header.leaderboard': { en: 'Leaderboard', ar: 'لوحة المتصدرين' },
  'header.notifications': { en: 'Notifications', ar: 'الإشعارات' },
  'header.join': { en: 'Join the canvas', ar: 'انضم إلى اللوحة' },
  'canvas.label': {
    en: 'Shared artwork canvas. Arrow keys pan; plus and minus zoom. Use Profile for a keyboard-accessible list of your artwork.',
    ar: 'لوحة فنية مشتركة. استخدم الأسهم للتحريك وعلامتي الجمع والطرح للتكبير والتصغير. افتح الملف الشخصي للوصول إلى قائمة أعمالك بلوحة المفاتيح.',
  },
  'settings.switchTheme': { en: 'Switch to {theme} mode', ar: 'التبديل إلى الوضع {theme}' },
  'settings.light': { en: 'light', ar: 'الفاتح' },
  'settings.dark': { en: 'dark', ar: 'الداكن' },
  'settings.grid': { en: 'Show grid', ar: 'إظهار الشبكة' },
  'settings.snap': { en: 'Snap to 8px grid', ar: 'محاذاة إلى شبكة ٨ بكسل' },
  'settings.rulers': { en: 'Coordinate rulers', ar: 'مساطر الإحداثيات' },
  'settings.reducedMotion': { en: 'Reduced motion', ar: 'تقليل الحركة' },
  'settings.sound': { en: 'Ambient audio and drawing sounds', ar: 'الأصوات المحيطة وأصوات الرسم' },
  'settings.export': { en: 'Export visible canvas', ar: 'تصدير الجزء الظاهر من اللوحة' },
  'footer.draft': { en: 'Draft mode', ar: 'وضع المسودة' },
  'footer.publish': { en: 'Publish mode', ar: 'وضع النشر' },
  'footer.retry': { en: 'Retry {count} unsent', ar: 'إعادة إرسال العناصر غير المرسلة: {count}' },
  'welcome.dialog': { en: 'Join Forgotten Network', ar: 'انضم إلى شبكة النسيان' },
  'welcome.typewriter': { en: "You've found something hidden...", ar: 'لقد عثرت على شيء مخفي...' },
  'welcome.eyebrow': { en: 'A WORLD BUILT BY PEOPLE LIKE YOU', ar: 'عالم يصنعه أشخاص مثلك' },
  'welcome.title': { en: 'YOUR MARK.', ar: 'اترك أثرك.' },
  'welcome.titleLine2': { en: 'YOUR WORLD.', ar: 'عالمك.' },
  'welcome.promise1': { en: 'Some things deserve to stay.', ar: 'بعض الأشياء تستحق أن تبقى.' },
  'welcome.promise2': { en: 'Draw your story. Own your pixels.', ar: 'ارسم قصتك وامتلك وحداتك.' },
  'welcome.promise3': {
    en: 'Leave a little piece of yourself behind.',
    ar: 'اترك هنا جزءًا صغيرًا منك.',
  },
  'welcome.safety': {
    en: 'Use a nickname. Do not share personal information. Images are not automatically checked for safety.',
    ar: 'استخدم اسمًا مستعارًا ولا تشارك معلوماتك الشخصية. لا تُفحص الصور تلقائيًا للتأكد من سلامتها.',
  },
  'welcome.communityRules': { en: 'Community Rules', ar: 'قواعد المجتمع' },
  'welcome.privacy': { en: 'Privacy', ar: 'الخصوصية' },
  'welcome.safetyLink': { en: 'Safety & privacy requests', ar: 'السلامة وطلبات الخصوصية' },
  'welcome.artistName': { en: 'Your artist name', ar: 'اسمك الفني' },
  'welcome.namePlaceholder': {
    en: 'What should the world call you?',
    ar: 'بأي اسم سيناديك العالم؟',
  },
  'welcome.signature': { en: 'Your signature', ar: 'توقيعك' },
  'welcome.avatarReady': { en: 'Avatar ready', ar: 'الصورة الرمزية جاهزة' },
  'welcome.addAvatar': { en: 'Add avatar', ar: 'أضف صورة رمزية' },
  'welcome.optionalAvatar': { en: 'Optional avatar', ar: 'صورة رمزية اختيارية' },
  'welcome.start': { en: 'START DRAWING NOW', ar: 'ابدأ الرسم الآن' },
  'welcome.mute': { en: 'Mute ambience', ar: 'كتم الأصوات المحيطة' },
  'welcome.enableSound': { en: 'Enable ambience', ar: 'تشغيل الأصوات المحيطة' },
  'welcome.explore': { en: 'Just exploring', ar: 'أريد الاستكشاف فقط' },
  'welcome.returning': { en: 'Returning artist?', ar: 'هل عدت إلى عالمك؟' },
  'welcome.recoveryPlaceholder': {
    en: 'Paste your private identity key',
    ar: 'ألصق مفتاح هويتك الخاص',
  },
  'welcome.publicArt': {
    en: 'Published artwork is public. You can remove your own work. Your identity stays on this device.',
    ar: 'الأعمال المنشورة عامة. يمكنك إزالة أعمالك، وتبقى هويتك على هذا الجهاز.',
  },
  'welcome.existing': { en: 'ALREADY PART OF THE WORLD', ar: 'أنت جزء من العالم بالفعل' },
  'welcome.stories': {
    en: 'Little marks. Limitless stories.',
    ar: 'آثار صغيرة، وحكايات بلا حدود.',
  },
  'welcome.artworks': { en: 'artworks', ar: 'الأعمال الفنية' },
  'welcome.artists': { en: 'artists', ar: 'الفنانون' },
  'welcome.pixels': { en: 'pixels claimed', ar: 'وحدة مرسومة' },
  'welcome.back': { en: 'Make your mark', ar: 'اترك أثرك' },
  'ads.label': { en: 'Optional advertising choices', ar: 'خيارات الإعلانات الاختيارية' },
  'ads.body': {
    en: 'Optional ads may use cookies or similar device storage. Ads stay off until you allow them and the site has a Google-certified consent tool configured. The canvas works either way.',
    ar: 'قد تستخدم الإعلانات الاختيارية ملفات تعريف الارتباط أو تخزينًا مشابهًا على الجهاز. تظل الإعلانات متوقفة حتى تسمح بها ويُضبط الموقع على أداة موافقة معتمدة من Google. تعمل اللوحة في كلتا الحالتين.',
  },
  'ads.allow': { en: 'Allow optional ads', ar: 'السماح بالإعلانات الاختيارية' },
  'ads.decline': { en: 'Decline optional ads', ar: 'رفض الإعلانات الاختيارية' },
  'expedition.launch': { en: 'Expedition', ar: 'رحلة استكشافية' },
  'expedition.offline': {
    en: 'Offline · live canvas unavailable. Unsent marks stay on this device.',
    ar: 'غير متصل · اللوحة المباشرة غير متاحة. تبقى العلامات غير المرسلة على هذا الجهاز.',
  },
  'expedition.shareLocation': { en: 'Share location', ar: 'مشاركة الموقع' },
} as const;

export type LocaleMessage = keyof typeof messages;

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ar';
}

function readLocale(): Locale {
  // This release uses English, including devices with an older Arabic preference.
  return 'en';
}

let currentLocale = readLocale();
const listeners = new Set<() => void>();
let storageListenerInstalled = false;

function notify() {
  listeners.forEach((listener) => listener());
}

function applyDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dataset.locale = locale;
  document.title =
    locale === 'ar'
      ? 'شبكة النسيان — عالم إبداعي مشترك'
      : 'Forgotten Network — A shared creative world';
  document
    .querySelector<HTMLMetaElement>('meta[property="og:title"]')
    ?.setAttribute('content', locale === 'ar' ? 'شبكة النسيان' : 'Forgotten Network');
  document
    .querySelector<HTMLMetaElement>('meta[name="twitter:title"]')
    ?.setAttribute(
      'content',
      locale === 'ar'
        ? 'شبكة النسيان — عالم إبداعي مشترك'
        : 'Forgotten Network — A shared creative world',
    );
  const description =
    locale === 'ar'
      ? 'اترك أثرًا في عالم فني مشترك ودائم. ارسم واكتشف واستكشف قصص المجتمع.'
      : 'Leave a mark in a permanent shared creative world. Draw, discover, and explore community stories.';
  document
    .querySelector<HTMLMetaElement>('meta[name="description"]')
    ?.setAttribute('content', description);
  document
    .querySelector<HTMLMetaElement>('meta[property="og:description"]')
    ?.setAttribute('content', description);
  document
    .querySelector<HTMLMetaElement>('meta[name="twitter:description"]')
    ?.setAttribute('content', description);
}

export function initializeLocale() {
  setLocale('en');
  if (typeof window !== 'undefined' && !storageListenerInstalled) {
    storageListenerInstalled = true;
    window.addEventListener('storage', (event) => {
      if (event.key !== LOCALE_STORAGE_KEY) return;
      currentLocale = 'en';
      applyDocumentLocale(currentLocale);
      notify();
    });
  }
}

export function setLocale(_locale: Locale) {
  const locale: Locale = 'en';
  currentLocale = locale;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* The current session still switches language. */
  }
  applyDocumentLocale(locale);
  notify();
}

export function getLocale(): Locale {
  return currentLocale;
}

export function translate(
  key: LocaleMessage,
  locale: Locale = currentLocale,
  values: Record<string, string | number> = {},
): string {
  const value = messages[key][locale] as string;
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

export function useLocale(): Locale {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLocale,
    () => 'en',
  );
}
