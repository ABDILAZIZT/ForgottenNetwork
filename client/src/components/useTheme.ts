import { useEffect, useState } from 'react';
export function useTheme() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'dark');
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setTheme(document.documentElement.dataset.theme || 'dark'),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}
