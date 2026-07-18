import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getTheme, themeChangeEvent, toggleTheme, type Theme } from '../lib/theme';

export function ThemeToggle() {
  const [theme, setCurrentTheme] = useState<Theme>(() => getTheme());

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      setCurrentTheme((event as CustomEvent<Theme>).detail || getTheme());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'theme') setCurrentTheme(getTheme());
    };

    window.addEventListener(themeChangeEvent, handleThemeChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(themeChangeEvent, handleThemeChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setCurrentTheme(toggleTheme())}
      className="app-icon-button border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
