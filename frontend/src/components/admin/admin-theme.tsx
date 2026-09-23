'use client';
import { createContext, useContext, useLayoutEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export const ADMIN_THEME_KEY = 'nexustaff-admin-theme';
type Theme = 'light' | 'dark';
export function readAdminTheme(storage: Pick<Storage, 'getItem'>): Theme {
    try { return storage.getItem(ADMIN_THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });
export function AdminTheme({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>('light');
    useLayoutEffect(() => { try { setTheme(readAdminTheme(window.localStorage)); } catch { setTheme('light'); } }, []);
    function toggle() {
        const next = theme === 'light' ? 'dark' : 'light';
        setTheme(next);
        try { window.localStorage.setItem(ADMIN_THEME_KEY, next); } catch { /* Theme still works for this session. */ }
    }
    return <ThemeContext.Provider value={{ theme, toggle }}><div className="admin-theme" data-theme={theme}>{children}</div></ThemeContext.Provider>;
}
export function AdminThemeToggle() {
    const { theme, toggle } = useContext(ThemeContext);
    const label = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    return <button type="button" aria-label={label} title={label} aria-pressed={theme === 'dark'} onClick={toggle} className="admin-theme-toggle inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 transition-colors">
        {theme === 'light' ? <Moon aria-hidden="true" size={18}/> : <Sun aria-hidden="true" size={18}/>}
    </button>;
}
