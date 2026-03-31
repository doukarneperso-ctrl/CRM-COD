import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'dark' | 'light';

interface ThemeState {
    mode: ThemeMode;
    toggle: () => void;
    setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set) => ({
            mode: 'light',
            toggle: () => set((s) => ({ mode: s.mode === 'dark' ? 'light' : 'dark' })),
            setMode: (mode) => set({ mode }),
        }),
        { name: 'crm-theme' }
    )
);
