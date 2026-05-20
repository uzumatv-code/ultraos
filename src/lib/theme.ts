export type Theme = 'light' | 'dark' | 'dark-tech';

export function initializeTheme(): Theme {
  // Check if theme exists in localStorage
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // If no theme is saved, check system preference
  if (!savedTheme) {
    const defaultTheme = systemPrefersDark ? 'dark' : 'light';
    localStorage.setItem('theme', defaultTheme);
    if (systemPrefersDark) {
      document.documentElement.classList.add('dark');
    }
    return defaultTheme as Theme;
  }

  // Apply saved theme
  if (savedTheme === 'dark' || savedTheme === 'dark-tech') {
    document.documentElement.classList.add('dark');
    if (savedTheme === 'dark-tech') {
      document.documentElement.classList.add('dark-tech');
    }
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.remove('dark-tech');
  }

  return savedTheme as Theme;
}

export function setTheme(newTheme: Theme) {
  localStorage.setItem('theme', newTheme);
  
  if (newTheme === 'dark' || newTheme === 'dark-tech') {
    document.documentElement.classList.add('dark');
    if (newTheme === 'dark-tech') {
      document.documentElement.classList.add('dark-tech');
    } else {
      document.documentElement.classList.remove('dark-tech');
    }
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.remove('dark-tech');
  }
  
  return newTheme;
}