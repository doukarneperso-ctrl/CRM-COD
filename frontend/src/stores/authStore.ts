import { create } from 'zustand';
import api from '../api/client';

interface User {
    id: string;
    username: string;
    fullName: string;
    role: string;
    roleId: string;
    permissions: string[];
    isAvailable?: boolean;
}

interface AuthState {
    user: User | null;
    loading: boolean;
    error: string | null;

    login: (username: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
    hasPermission: (permission: string) => boolean;
    isAgent: () => boolean;
    toggleAvailability: () => Promise<void>;
    clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    loading: true,
    error: null,

    login: async (username: string, password: string) => {
        set({ error: null, loading: true });
        try {
            const res = await api.post('/auth/login', { username, password });
            set({ user: res.data.data, loading: false });
            return true;
        } catch (err: any) {
            const message = err.response?.data?.error?.message || 'Login failed';
            set({ error: message, loading: false });
            return false;
        }
    },

    logout: async () => {
        try {
            await api.post('/auth/logout');
        } catch { }
        set({ user: null });
    },

    checkAuth: async () => {
        try {
            const res = await api.get('/auth/me');
            set({ user: res.data.data, loading: false });
        } catch {
            set({ user: null, loading: false });
        }
    },

    hasPermission: (permission: string) => {
        const user = get().user;
        return user?.permissions?.includes(permission) || false;
    },

    isAgent: () => {
        const user = get().user;
        if (!user) return false;
        const role = user.role?.toLowerCase() || '';
        return role === 'agent' || role === 'call_centre_agent';
    },

    toggleAvailability: async () => {
        const user = get().user;
        if (!user) return;
        const newAvail = !(user.isAvailable !== false);
        try {
            await api.put('/users/me/availability', { isAvailable: newAvail });
            set({ user: { ...user, isAvailable: newAvail } });
        } catch { /* silent */ }
    },

    clearError: () => set({ error: null }),
}));
