import { useEffect, useState } from 'react';

// theme: 'system' | 'light' | 'dark'
export function resolveDark(theme, prefersDark) {
  return theme === 'dark' || (theme === 'system' && prefersDark);
}

// Applies the "dark" class to <html> and returns whether dark mode is active.
export function useTheme(theme) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (!theme) return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const isDark = resolveDark(theme, media.matches);
      document.documentElement.classList.toggle('dark', isDark);
      setDark(isDark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return dark;
}
