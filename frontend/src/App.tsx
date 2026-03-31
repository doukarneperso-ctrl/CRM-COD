import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme, Spin } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './components/DashboardLayout';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ProductsPage from './pages/ProductsPage';
import CustomersPage from './pages/CustomersPage';
import OrdersPage from './pages/OrdersPage';
import StockPage from './pages/StockPage';
import CallCentrePage from './pages/CallCentrePage';
import DeliveryCompaniesPage from './pages/DeliveryCompaniesPage';
import ReturnsPage from './pages/ReturnsPage';
import ExpensesPage from './pages/ExpensesPage';
import CommissionsPage from './pages/CommissionsPage';
import SettingsPage from './pages/SettingsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import RolesPage from './pages/RolesPage';
import AdsPage from './pages/AdsPage';
import CourierInvoicesPage from './pages/CourierInvoicesPage';
import AgentDashboardPage from './pages/AgentDashboardPage';
import AssignmentRulesPage from './pages/AssignmentRulesPage';
import EmployersPage from './pages/EmployersPage';
import ProductionPage from './pages/ProductionPage';
import StockAtelierPage from './pages/StockAtelierPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

// ─── Dark Theme ───
const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#8B5A2B',
    colorBgContainer: 'rgba(30,22,12,0.9)',
    colorBgElevated: '#1e160c',
    colorBgLayout: '#0f0a05',
    colorBorder: 'rgba(139,90,43,0.2)',
    colorBorderSecondary: 'rgba(139,90,43,0.12)',
    colorText: '#e8d5c0',
    colorTextSecondary: 'rgba(193,142,83,0.6)',
    colorTextTertiary: 'rgba(193,142,83,0.4)',
    borderRadius: 8,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    colorLink: '#C18E53',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(193,142,83,0.65)',
      darkItemHoverBg: 'rgba(139,90,43,0.15)',
      darkItemHoverColor: '#C18E53',
      darkItemSelectedBg: 'rgba(139,90,43,0.2)',
      darkItemSelectedColor: '#C18E53',
    },
    Table: {
      headerBg: 'rgba(30,22,12,0.8)',
      headerColor: 'rgba(193,142,83,0.7)',
      rowHoverBg: 'rgba(139,90,43,0.08)',
      borderColor: 'rgba(139,90,43,0.12)',
    },
    Card: {
      colorBgContainer: 'rgba(30,22,12,0.8)',
    },
    Button: {
      primaryShadow: '0 2px 8px rgba(139,90,43,0.3)',
    },
    Input: {
      colorBgContainer: 'rgba(139,90,43,0.08)',
      activeBorderColor: '#8B5A2B',
      hoverBorderColor: 'rgba(139,90,43,0.4)',
    },
    Modal: {
      contentBg: '#1e160c',
      headerBg: '#1e160c',
    },
  },
};

// ─── Light Theme ───
const lightTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#8B5A2B',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f5f0eb',
    colorBorder: 'rgba(139,90,43,0.18)',
    colorBorderSecondary: 'rgba(139,90,43,0.1)',
    colorText: '#2c1e10',
    colorTextSecondary: 'rgba(60,40,20,0.6)',
    colorTextTertiary: 'rgba(60,40,20,0.4)',
    borderRadius: 8,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    colorLink: '#8B5A2B',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: 'rgba(193,142,83,0.65)',
      darkItemHoverBg: 'rgba(139,90,43,0.15)',
      darkItemHoverColor: '#C18E53',
      darkItemSelectedBg: 'rgba(139,90,43,0.25)',
      darkItemSelectedColor: '#C18E53',
    },
    Table: {
      headerBg: '#faf6f1',
      headerColor: '#6b4c2a',
      rowHoverBg: 'rgba(139,90,43,0.04)',
      borderColor: 'rgba(139,90,43,0.1)',
    },
    Card: {
      colorBgContainer: '#ffffff',
    },
    Button: {
      primaryShadow: '0 2px 8px rgba(139,90,43,0.15)',
    },
    Input: {
      colorBgContainer: '#fff',
      activeBorderColor: '#8B5A2B',
      hoverBorderColor: 'rgba(139,90,43,0.4)',
    },
    Modal: {
      contentBg: '#ffffff',
      headerBg: '#ffffff',
    },
  },
};

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  const isDark = useThemeStore((s) => s.mode === 'dark');

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark ? '#0f0a05' : '#f5f0eb',
      }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Permission-gated route wrapper — shows "Access Denied" if user lacks required permission
function PermGate({ perm, children }: { perm: string | string[]; children: React.ReactNode }) {
  const { hasPermission } = useAuthStore();
  const perms = Array.isArray(perm) ? perm : [perm];
  const allowed = perms.some(p => hasPermission(p));
  if (!allowed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#999' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Access Denied</div>
        <div style={{ fontSize: 14, marginTop: 4 }}>You don't have permission to view this page</div>
      </div>
    );
  }
  return <>{children}</>;
}

// Shows admin dashboard or agent dashboard based on permissions
function SmartDashboard() {
  const { hasPermission } = useAuthStore();
  if (hasPermission('view_dashboard')) {
    return <DashboardPage />;
  }
  return <AgentDashboardPage />;
}

function AppContent() {
  const { checkAuth, user, loading } = useAuthStore();
  const isDark = useThemeStore((s) => s.mode === 'dark');

  useEffect(() => {
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark ? '#0f0a05' : '#f5f0eb',
      }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<SmartDashboard />} />
        {/* Core pages */}
        <Route path="orders" element={<PermGate perm="view_orders"><OrdersPage /></PermGate>} />
        <Route path="call-centre" element={<PermGate perm="view_call_centre"><CallCentrePage /></PermGate>} />
        {/* Inventory */}
        <Route path="products" element={<PermGate perm="view_products"><ProductsPage /></PermGate>} />
        <Route path="stock" element={<PermGate perm={['manage_stock', 'view_products']}><StockPage /></PermGate>} />
        {/* Customers */}
        <Route path="customers" element={<PermGate perm="view_customers"><CustomersPage /></PermGate>} />
        {/* Delivery */}
        <Route path="delivery/companies" element={<PermGate perm="view_delivery"><DeliveryCompaniesPage /></PermGate>} />
        <Route path="delivery/returns" element={<PermGate perm="view_delivery"><ReturnsPage /></PermGate>} />
        {/* Cash */}
        <Route path="cash/expenses" element={<PermGate perm={['view_expenses', 'create_expenses', 'approve_expenses']}><ExpensesPage /></PermGate>} />
        <Route path="cash/commissions" element={<PermGate perm={['view_commissions', 'view_assigned_commissions']}><CommissionsPage /></PermGate>} />
        <Route path="cash/ads" element={<PermGate perm="approve_expenses"><AdsPage /></PermGate>} />
        <Route path="cash/courier-invoices" element={<PermGate perm="approve_expenses"><CourierInvoicesPage /></PermGate>} />
        {/* Analytics */}
        <Route path="analytics" element={<PermGate perm="view_analytics"><AnalyticsPage /></PermGate>} />
        {/* Team */}
        <Route path="team/agents" element={<PermGate perm="view_users"><UsersPage /></PermGate>} />
        <Route path="team/roles" element={<PermGate perm="manage_roles"><RolesPage /></PermGate>} />
        <Route path="team/assignment-rules" element={<PermGate perm={['view_users', 'manage_assignment_rules']}><AssignmentRulesPage /></PermGate>} />
        {/* Settings (includes YouCan integration) */}
        <Route path="settings" element={<PermGate perm="manage_settings"><SettingsPage /></PermGate>} />
        {/* Employers (HR / Salary) */}
        <Route path="employers" element={<PermGate perm="manage_employers"><EmployersPage /></PermGate>} />
        <Route path="production" element={<PermGate perm="manage_employers"><ProductionPage /></PermGate>} />
        <Route path="stock-atelier" element={<PermGate perm="manage_employers"><StockAtelierPage /></PermGate>} />
      </Route>
    </Routes>
  );
}

// Simple placeholder for pages not yet built
function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      color: 'var(--text-tertiary)',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-heading)', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 14 }}>{subtitle}</div>
    </div>
  );
}

export default function App() {
  const mode = useThemeStore((s) => s.mode);

  // Sync data-theme attribute to <html> for CSS variables
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  return (
    <ConfigProvider theme={mode === 'dark' ? darkTheme : lightTheme}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
