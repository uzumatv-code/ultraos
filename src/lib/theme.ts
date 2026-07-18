export type Theme = 'light' | 'dark';

const THEME_CHANGE_EVENT = 'ultraos:theme-change';

function normalizeTheme(value: string | null): Theme {
  // Migra automaticamente o antigo dark-tech para o único tema escuro suportado.
  return value === 'dark' || value === 'dark-tech' ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.remove('dark-tech');
  document.documentElement.dataset.theme = theme;
}

export function getTheme(): Theme {
  return normalizeTheme(localStorage.getItem('theme'));
}

export function initializeTheme(): Theme {
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme ? normalizeTheme(savedTheme) : (systemPrefersDark ? 'dark' : 'light');
  localStorage.setItem('theme', theme);
  applyTheme(theme);
  return theme;
}

export function setTheme(newTheme: Theme): Theme {
  localStorage.setItem('theme', newTheme);
  applyTheme(newTheme);
  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: newTheme }));
  return newTheme;
}

export function toggleTheme(): Theme {
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

export const themeChangeEvent = THEME_CHANGE_EVENT;
