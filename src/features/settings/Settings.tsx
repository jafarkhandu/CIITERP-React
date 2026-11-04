import { useEffect, useState } from 'react';
import './Settings.css';

type Theme = 'light' | 'dark';

export default function Settings() {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('ciit-theme') || localStorage.getItem('theme')) === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  function changeTheme(value: Theme) {
    setTheme(value);
    localStorage.setItem('ciit-theme', value);
    localStorage.setItem('theme', value);
    document.documentElement.setAttribute('data-theme', value);
    window.dispatchEvent(new CustomEvent('ciit-theme-change', { detail: value }));
  }

  return <section className="settings-page">
    <header className="settings-page-header"><div><span>WORKSPACE / SETTINGS</span><h1>Settings</h1><p>Manage your application preferences and workspace experience.</p></div>
      <span className="settings-saved"><i /> Preferences saved</span>
    </header>
    <div className="settings-card">
      <div className="settings-card-heading"><div><h2>Appearance</h2><p>Customize how the CIIT Training Institute platform looks.</p></div></div>
      <div className="settings-theme-options">
        <button type="button" className={`settings-theme-card ${theme === 'light' ? 'selected' : ''}`} aria-pressed={theme === 'light'} onClick={() => changeTheme('light')}>
          <div className="settings-theme-preview light"><span /><span /><span /></div><strong>Light</strong><small>Clean and bright</small>
        </button>
        <button type="button" className={`settings-theme-card ${theme === 'dark' ? 'selected' : ''}`} aria-pressed={theme === 'dark'} onClick={() => changeTheme('dark')}>
          <div className="settings-theme-preview dark"><span /><span /><span /></div><strong>Dark</strong><small>Comfortable and focused</small>
        </button>
      </div>
    </div>
    <div className="settings-card settings-info"><h2>Preference persistence</h2><p>Your selected theme is saved in this browser and applied automatically when you return.</p></div>
  </section>;
}
