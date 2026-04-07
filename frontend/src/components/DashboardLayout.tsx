import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Typography, Switch, Tooltip, Badge, Empty } from 'antd';
import type { MenuProps } from 'antd';
import {
    DashboardOutlined,
    ShoppingCartOutlined,
    AppstoreOutlined,
    TeamOutlined,
    TruckOutlined,
    DollarOutlined,
    BarChartOutlined,
    PhoneOutlined,
    SettingOutlined,
    LogoutOutlined,
    UserOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    BellOutlined,
    SwapOutlined,
    RollbackOutlined,
    WalletOutlined,
    PercentageOutlined,
    SolutionOutlined,
    NodeIndexOutlined,
    SunOutlined,
    MoonOutlined,
    CheckOutlined,
    SafetyCertificateOutlined,
    SoundOutlined,
    FileTextOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import api from '../api/client';
import { useSocket } from '../hooks/useSocket';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

type MenuItem = Required<MenuProps>['items'][number];

// Notification type icon/color mapping
const NOTIF_ICONS: Record<string, { icon: string; color: string }> = {
    order_assigned: { icon: '📋', color: '#1890ff' },
    order_status_changed: { icon: '🔄', color: '#faad14' },
    order_youcan_imported: { icon: '🛒', color: '#52c41a' },
    stock_low: { icon: '📦', color: '#ff7a45' },
    stock_out: { icon: '🚫', color: '#ff4d4f' },
    callback_reminder: { icon: '📞', color: '#722ed1' },
    commission_calculated: { icon: '💰', color: '#13c2c2' },
    commission_approved_paid: { icon: '✅', color: '#52c41a' },
    delivery_export_failed: { icon: '❌', color: '#ff4d4f' },
    merge_candidate_detected: { icon: '🔗', color: '#eb2f96' },
    return_received: { icon: '↩️', color: '#fa8c16' },
    recurring_expense_due: { icon: '💳', color: '#8B5A2B' },
    system_alert: { icon: '⚡', color: '#1890ff' },
};

export default function DashboardLayout() {
    const [collapsed, setCollapsed] = useState(false);
    const [openKeys, setOpenKeys] = useState<string[]>([]);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout, hasPermission, isAgent, toggleAvailability } = useAuthStore();
    const { mode, toggle } = useThemeStore();
    const isDark = mode === 'dark';
    const isAdmin = ['admin', 'superadmin'].includes(user?.role?.toLowerCase() || '');

    // Detect mobile viewport
    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth <= 768;
            setIsMobile(mobile);
            if (mobile) setCollapsed(true);
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Close mobile menu on route change
    useEffect(() => {
        if (isMobile) setMobileMenuOpen(false);
    }, [location.pathname, isMobile]);


    // ─── Agent Activity Tracking ──────────────────────
    const [onlineAgents, setOnlineAgents] = useState<any[]>([]);
    const lastActivityRef = { current: Date.now() };

    // Track real user activity (mouse/keyboard)
    useEffect(() => {
        const updateActivity = () => { lastActivityRef.current = Date.now(); };
        window.addEventListener('mousemove', updateActivity);
        window.addEventListener('keydown', updateActivity);
        window.addEventListener('click', updateActivity);
        window.addEventListener('scroll', updateActivity);
        return () => {
            window.removeEventListener('mousemove', updateActivity);
            window.removeEventListener('keydown', updateActivity);
            window.removeEventListener('click', updateActivity);
            window.removeEventListener('scroll', updateActivity);
        };
    }, []);

    // Send heartbeat every 30s only if user was active in last 60s
    useEffect(() => {
        const sendHeartbeat = async () => {
            if (Date.now() - lastActivityRef.current < 60000) {
                try { await api.post('/auth/heartbeat'); } catch { }
            }
        };
        sendHeartbeat();
        const hbInterval = setInterval(sendHeartbeat, 30000);
        return () => clearInterval(hbInterval);
    }, []);

    // Fetch online agents every 30s
    useEffect(() => {
        if (!isAdmin) return;
        const fetchOnline = async () => {
            try {
                const res = await api.get('/auth/online-agents');
                setOnlineAgents(res.data.data || []);
            } catch { }
        };
        fetchOnline();
        const oaInterval = setInterval(fetchOnline, 30000);
        return () => clearInterval(oaInterval);
    }, [isAdmin]);

    // ─── Notification State ───────────────────────────
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifLoading, setNotifLoading] = useState(false);

    const fetchUnreadCount = useCallback(async () => {
        try {
            const res = await api.get('/notifications/unread-count');
            setUnreadCount(res.data.count || 0);
        } catch { /* silent */ }
    }, []);

    const fetchNotifications = useCallback(async () => {
        setNotifLoading(true);
        try {
            const res = await api.get('/notifications', { params: { limit: 20 } });
            setNotifications(res.data.data || []);
        } catch { /* silent */ }
        setNotifLoading(false);
    }, []);

    const markAsRead = async (id: string) => {
        try {
            await api.put(`/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch { /* silent */ }
    };

    const markAllRead = async () => {
        try {
            await api.put('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch { /* silent */ }
    };

    // Poll unread count every 30s
    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, [fetchUnreadCount]);

    // Fetch notifications when dropdown opens
    useEffect(() => {
        if (notifOpen) fetchNotifications();
    }, [notifOpen, fetchNotifications]);

    // Real-time Socket.IO notification listener
    useSocket({
        'notification': (data: any) => {
            setUnreadCount(prev => prev + 1);
            setNotifications(prev => [data, ...prev].slice(0, 20));
        },
    });

    // Time-ago formatter
    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    };

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    // Build menu items following spec Section 3 hierarchy
    const menuItems: MenuItem[] = [
        // 📊 Dashboard (admin) or My KPIs (agent)
        hasPermission('view_dashboard') ? {
            key: '/',
            icon: <DashboardOutlined />,
            label: 'Dashboard',
        } : {
            key: '/',
            icon: <DashboardOutlined />,
            label: 'My KPIs',
        },
        // 📋 All Orders
        hasPermission('view_orders') ? {
            key: '/orders',
            icon: <ShoppingCartOutlined />,
            label: 'All Orders',
        } : null,
        // 📞 Call Centre
        hasPermission('view_call_centre') ? {
            key: '/call-centre',
            icon: <PhoneOutlined />,
            label: 'Call Centre',
        } : null,
        // 📦 Inventory (parent) → Products, Stock
        (hasPermission('view_products') || hasPermission('manage_stock')) ? {
            key: 'inventory',
            icon: <AppstoreOutlined />,
            label: 'Inventory',
            children: [
                hasPermission('view_products') ? {
                    key: '/products',
                    label: 'Products',
                } : null,
                (hasPermission('manage_stock') || hasPermission('view_products')) ? {
                    key: '/stock',
                    label: 'Stock',
                } : null,
            ].filter(Boolean) as MenuItem[],
        } : null,
        // 👥 Customers
        hasPermission('view_customers') ? {
            key: '/customers',
            icon: <TeamOutlined />,
            label: 'Customers',
        } : null,
        // 🚚 Delivery (parent) → Companies, Returns
        hasPermission('view_delivery') ? {
            key: 'delivery',
            icon: <TruckOutlined />,
            label: 'Delivery',
            children: [
                {
                    key: '/delivery/companies',
                    icon: <SwapOutlined />,
                    label: 'Companies',
                },
                {
                    key: '/delivery/returns',
                    icon: <RollbackOutlined />,
                    label: 'Returns',
                },
            ],
        } : null,
        // 💰 Cash (parent) → Expenses, Commissions, Ads, Courier Invoices
        (hasPermission('view_commissions') || hasPermission('view_assigned_commissions') || hasPermission('view_expenses') || hasPermission('create_expenses') || hasPermission('approve_expenses')) ? {
            key: 'cash',
            icon: <DollarOutlined />,
            label: 'Cash',
            children: [
                (hasPermission('view_expenses') || hasPermission('create_expenses') || hasPermission('approve_expenses')) ? {
                    key: '/cash/expenses',
                    icon: <WalletOutlined />,
                    label: 'Expenses',
                } : null,
                (hasPermission('view_commissions') || hasPermission('view_assigned_commissions')) ? {
                    key: '/cash/commissions',
                    icon: <PercentageOutlined />,
                    label: 'Commissions',
                } : null,
                hasPermission('approve_expenses') ? {
                    key: '/cash/ads',
                    icon: <SoundOutlined />,
                    label: 'Ads',
                } : null,
                hasPermission('approve_expenses') ? {
                    key: '/cash/courier-invoices',
                    icon: <FileTextOutlined />,
                    label: 'Courier Invoices',
                } : null,
            ].filter(Boolean) as MenuItem[],
        } : null,
        // 📈 Analytics
        hasPermission('view_analytics') ? {
            key: '/analytics',
            icon: <BarChartOutlined />,
            label: 'Analytics',
        } : null,
        // 👨‍💼 Team (parent) → Agents, Assignment Rules
        hasPermission('view_users') ? {
            key: 'team',
            icon: <SolutionOutlined />,
            label: 'Team',
            children: [
                {
                    key: '/team/agents',
                    icon: <UserOutlined />,
                    label: 'Agents',
                },
                {
                    key: '/team/assignment-rules',
                    icon: <NodeIndexOutlined />,
                    label: 'Assignment Rules',
                },
                hasPermission('manage_roles') ? {
                    key: '/team/roles',
                    icon: <SafetyCertificateOutlined />,
                    label: 'Roles & Permissions',
                } : null,
            ].filter(Boolean) as MenuItem[],
        } : null,
        // ⚙️ Settings
        hasPermission('manage_settings') ? {
            key: '/settings',
            icon: <SettingOutlined />,
            label: 'Settings',
        } : null,
        // 👷 Employers + Production (HR & Atelier)
        hasPermission('manage_employers') ? {
            key: 'employers-group',
            icon: <TeamOutlined style={{ color: '#0d9488' }} />,
            label: <span style={{ color: '#0d9488', fontWeight: 600 }}>Atelier</span>,
            children: [
                {
                    key: '/employers',
                    label: <span style={{ color: '#0d9488' }}>Employers</span>,
                },
                {
                    key: '/production',
                    icon: <AppstoreOutlined style={{ color: '#0d9488' }} />,
                    label: <span style={{ color: '#0d9488' }}>Production</span>,
                },
                {
                    key: '/stock-atelier',
                    icon: <AppstoreOutlined style={{ color: '#0d9488' }} />,
                    label: <span style={{ color: '#0d9488' }}>Stock Atelier</span>,
                },
            ],
        } : null,
    ].filter(Boolean) as MenuItem[];

    // Determine which keys are open based on current path
    const getOpenKeys = (): string[] => {
        const path = location.pathname;
        if (path.startsWith('/products') || path.startsWith('/stock')) return ['inventory'];
        if (path.startsWith('/delivery')) return ['delivery'];
        if (path.startsWith('/cash') || path.startsWith('/commissions')) return ['cash'];
        if (path.startsWith('/team') || path.startsWith('/users')) return ['team'];
        if (path.startsWith('/employers') || path.startsWith('/production') || path.startsWith('/stock-atelier')) return ['employers-group'];
        return [];
    };

    // Init openKeys from current route on first render
    useEffect(() => {
        setOpenKeys(getOpenKeys());
    }, []);

    // Accordion: only keep the last-opened submenu key
    const submenuRootKeys = ['inventory', 'delivery', 'cash', 'team', 'employers-group'];
    const handleOpenChange = (keys: string[]) => {
        const latestOpen = keys.find(k => !openKeys.includes(k));
        if (latestOpen && submenuRootKeys.includes(latestOpen)) {
            setOpenKeys([latestOpen]);
        } else {
            setOpenKeys(keys);
        }
    };

    const userMenuItems = [
        { key: 'profile', label: 'Profile', icon: <UserOutlined /> },
        { type: 'divider' as const },
        { key: 'logout', label: 'Logout', icon: <LogoutOutlined />, danger: true },
    ];

    const siderWidth = isMobile ? 0 : (collapsed ? 72 : 220);

    return (
        <Layout style={{ minHeight: '100vh' }}>
            {/* Mobile overlay */}
            {isMobile && mobileMenuOpen && (
                <div
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 999,
                        background: 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(2px)',
                        transition: 'opacity 0.3s',
                    }}
                />
            )}

            {/* Sidebar */}
            <Sider
                trigger={null}
                collapsible
                collapsed={isMobile ? false : collapsed}
                width={220}
                collapsedWidth={isMobile ? 0 : 72}
                style={{
                    background: 'var(--bg-sidebar)',
                    borderRight: '1px solid var(--border-sidebar)',
                    overflow: 'auto',
                    height: '100vh',
                    position: 'fixed',
                    left: isMobile ? (mobileMenuOpen ? 0 : -260) : 0,
                    top: 0,
                    bottom: 0,
                    zIndex: isMobile ? 1001 : 100,
                    transition: 'left 0.3s ease, width 0.2s ease',
                }}
            >
                {/* Logo */}
                <div style={{
                    height: 56,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    padding: collapsed ? '0' : '0 16px',
                    borderBottom: `1px solid var(--border-sidebar)`,
                    gap: 10,
                }}>
                    <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #8B5A2B, #C18E53)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                        color: '#fff',
                        fontWeight: 700,
                        flexShrink: 0,
                    }}>
                        A
                    </div>
                    {!collapsed && (
                        <Text style={{
                            color: isDark ? '#e8d5c0' : '#2c1e10',
                            fontSize: 14,
                            fontWeight: 700,
                            letterSpacing: '0.5px',
                        }}>
                            ANAQATOKI
                        </Text>
                    )}
                </div>

                {/* Menu */}
                <Menu
                    className="sidebar-menu"
                    mode="inline"
                    selectedKeys={[location.pathname]}
                    openKeys={collapsed ? [] : openKeys}
                    onOpenChange={handleOpenChange}
                    onClick={({ key }) => {
                        // Don't navigate for parent group keys
                        if (['inventory', 'delivery', 'cash', 'team', 'employers-group'].includes(key)) return;
                        navigate(key);
                        if (isMobile) setMobileMenuOpen(false);
                    }}
                    items={menuItems}
                    style={{
                        background: 'transparent',
                        borderRight: 'none',
                        marginTop: 4,
                        fontSize: 13,
                    }}
                />

                {/* User card at bottom */}
                {!collapsed && (
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: '12px 14px',
                        borderTop: `1px solid var(--border-sidebar)`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                    }}>
                        <Avatar
                            style={{
                                background: 'linear-gradient(135deg, #8B5A2B, #C18E53)',
                                flexShrink: 0,
                            }}
                            size={30}
                        >
                            {user?.fullName?.[0] || 'U'}
                        </Avatar>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <Text style={{
                                color: isDark ? '#e8d5c0' : '#2c1e10',
                                fontSize: 12,
                                fontWeight: 500,
                                display: 'block',
                            }} ellipsis>
                                {user?.fullName}
                            </Text>
                            <Text style={{
                                color: isDark ? 'rgba(193,142,83,0.5)' : 'rgba(60,40,20,0.5)',
                                fontSize: 10,
                            }}>
                                {user?.role}
                            </Text>
                        </div>
                    </div>
                )}
            </Sider>

            {/* Main content */}
            <Layout style={{
                marginLeft: siderWidth,
                transition: 'margin-left 0.3s ease',
                background: 'var(--bg-primary)',
            }}>
                {/* Top bar */}
                <Header style={{
                    background: 'var(--bg-header)',
                    backdropFilter: 'blur(10px)',
                    padding: '0 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid var(--border-secondary)`,
                    height: 48,
                    position: 'sticky',
                    top: 0,
                    zIndex: 99,
                    lineHeight: '48px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                            onClick={() => {
                                if (isMobile) {
                                    setMobileMenuOpen(!mobileMenuOpen);
                                } else {
                                    setCollapsed(!collapsed);
                                }
                            }}
                            style={{
                                cursor: 'pointer',
                                color: 'var(--accent-light)',
                                fontSize: 16,
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            {(isMobile ? !mobileMenuOpen : collapsed) ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        </div>

                        {/* Online agents indicators */}
                        {isAdmin && onlineAgents.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                                {onlineAgents.map(agent => (
                                    <Tooltip key={agent.id} title={`${agent.full_name} — ${agent.is_online ? 'Online' : 'Offline'}`}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, background: agent.is_online ? 'rgba(82,196,26,0.08)' : 'rgba(140,140,140,0.06)', border: `1px solid ${agent.is_online ? 'rgba(82,196,26,0.2)' : 'rgba(140,140,140,0.15)'}`, cursor: 'default', transition: 'all 0.3s' }}>
                                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: agent.is_online ? '#52c41a' : '#d9d9d9', display: 'inline-block', boxShadow: agent.is_online ? '0 0 4px rgba(82,196,26,0.5)' : 'none', transition: 'all 0.3s' }} />
                                            <Text style={{ fontSize: 11, fontWeight: 500, color: agent.is_online ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                                {agent.full_name?.split(' ')[0]}
                                            </Text>
                                        </div>
                                    </Tooltip>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Theme toggle */}
                        <Tooltip title={isDark ? 'Light Mode' : 'Dark Mode'}>
                            <Switch
                                checked={!isDark}
                                onChange={toggle}
                                checkedChildren={<SunOutlined />}
                                unCheckedChildren={<MoonOutlined />}
                                style={{
                                    background: isDark ? 'rgba(139,90,43,0.3)' : '#8B5A2B',
                                }}
                                size="small"
                            />
                        </Tooltip>

                        {/* Agent break toggle */}
                        {isAgent() && (
                            <Tooltip title={user?.isAvailable !== false ? 'Go On Break' : 'Go Available'}>
                                <div
                                    onClick={toggleAvailability}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        cursor: 'pointer',
                                        padding: '3px 10px',
                                        borderRadius: 12,
                                        fontSize: 11,
                                        fontWeight: 600,
                                        background: user?.isAvailable !== false
                                            ? 'rgba(82,196,26,0.12)'
                                            : 'rgba(140,140,140,0.12)',
                                        color: user?.isAvailable !== false
                                            ? '#52c41a'
                                            : '#8c8c8c',
                                        transition: 'all 0.2s',
                                        userSelect: 'none',
                                    }}
                                >
                                    <span style={{ fontSize: 10 }}>
                                        {user?.isAvailable !== false ? '🟢' : '⚫'}
                                    </span>
                                    {user?.isAvailable !== false ? 'Available' : 'On Break'}
                                </div>
                            </Tooltip>
                        )}

                        {/* Notifications bell */}
                        <div style={{ position: 'relative' }}>
                            <Badge count={unreadCount} size="small" offset={[-2, 2]}>
                                <div
                                    onClick={() => setNotifOpen(!notifOpen)}
                                    style={{
                                        cursor: 'pointer',
                                        color: unreadCount > 0 ? 'var(--accent)' : 'var(--text-secondary)',
                                        fontSize: 17,
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: 4,
                                        borderRadius: 6,
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <BellOutlined />
                                </div>
                            </Badge>

                            {/* Notification Dropdown */}
                            {notifOpen && (
                                <>
                                    {/* Backdrop */}
                                    <div
                                        onClick={() => setNotifOpen(false)}
                                        style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                                    />
                                    <div style={{
                                        position: 'absolute',
                                        top: 38,
                                        right: 0,
                                        width: 360,
                                        maxHeight: 480,
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--border-secondary)',
                                        borderRadius: 12,
                                        boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                                        zIndex: 999,
                                        overflow: 'hidden',
                                        display: 'flex',
                                        flexDirection: 'column',
                                    }}>
                                        {/* Header */}
                                        <div style={{
                                            padding: '12px 16px',
                                            borderBottom: '1px solid var(--border-secondary)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}>
                                            <Text strong style={{ fontSize: 14 }}>Notifications</Text>
                                            {unreadCount > 0 && (
                                                <div
                                                    onClick={markAllRead}
                                                    style={{
                                                        fontSize: 11,
                                                        color: '#1890ff',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                    }}
                                                >
                                                    <CheckOutlined style={{ fontSize: 10 }} />
                                                    Mark all read
                                                </div>
                                            )}
                                        </div>

                                        {/* Notification List */}
                                        <div style={{ overflow: 'auto', flex: 1 }}>
                                            {notifLoading ? (
                                                <div style={{ textAlign: 'center', padding: 32, opacity: 0.5 }}>Loading...</div>
                                            ) : notifications.length === 0 ? (
                                                <Empty
                                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                                    description="No notifications"
                                                    style={{ padding: '32px 0' }}
                                                />
                                            ) : (
                                                notifications.map((n: any) => {
                                                    const meta = NOTIF_ICONS[n.type] || NOTIF_ICONS.system_alert;
                                                    return (
                                                        <div
                                                            key={n.id}
                                                            onClick={() => {
                                                                if (!n.is_read) markAsRead(n.id);
                                                                // Navigate based on data
                                                                if (n.data?.orderId) {
                                                                    navigate('/orders');
                                                                    setNotifOpen(false);
                                                                }
                                                            }}
                                                            style={{
                                                                padding: '10px 16px',
                                                                cursor: 'pointer',
                                                                borderBottom: '1px solid var(--border-secondary)',
                                                                background: n.is_read ? 'transparent' : (isDark ? 'rgba(24,144,255,0.05)' : 'rgba(24,144,255,0.03)'),
                                                                display: 'flex',
                                                                gap: 10,
                                                                alignItems: 'flex-start',
                                                                transition: 'background 0.15s',
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}
                                                            onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : (isDark ? 'rgba(24,144,255,0.05)' : 'rgba(24,144,255,0.03)')}
                                                        >
                                                            {/* Icon */}
                                                            <div style={{
                                                                width: 32,
                                                                height: 32,
                                                                borderRadius: 8,
                                                                background: `${meta.color}15`,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: 14,
                                                                flexShrink: 0,
                                                            }}>
                                                                {meta.icon}
                                                            </div>
                                                            {/* Content */}
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{
                                                                    fontSize: 12,
                                                                    fontWeight: n.is_read ? 400 : 600,
                                                                    color: 'var(--text-primary)',
                                                                    lineHeight: 1.3,
                                                                }}>
                                                                    {n.title}
                                                                </div>
                                                                {n.message && (
                                                                    <div style={{
                                                                        fontSize: 11,
                                                                        color: 'var(--text-secondary)',
                                                                        marginTop: 2,
                                                                        lineHeight: 1.3,
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        whiteSpace: 'nowrap',
                                                                    }}>
                                                                        {n.message}
                                                                    </div>
                                                                )}
                                                                <div style={{
                                                                    fontSize: 10,
                                                                    color: 'var(--text-secondary)',
                                                                    opacity: 0.6,
                                                                    marginTop: 2,
                                                                }}>
                                                                    {timeAgo(n.created_at)}
                                                                </div>
                                                            </div>
                                                            {/* Unread dot */}
                                                            {!n.is_read && (
                                                                <div style={{
                                                                    width: 8,
                                                                    height: 8,
                                                                    borderRadius: '50%',
                                                                    background: '#1890ff',
                                                                    flexShrink: 0,
                                                                    marginTop: 4,
                                                                }} />
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* User dropdown */}
                        <Dropdown
                            menu={{
                                items: userMenuItems,
                                onClick: ({ key }) => {
                                    if (key === 'logout') handleLogout();
                                },
                            }}
                            placement="bottomRight"
                        >
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                cursor: 'pointer',
                                padding: '3px 6px',
                                borderRadius: 6,
                            }}>
                                <Avatar
                                    size={28}
                                    style={{ background: 'linear-gradient(135deg, #8B5A2B, #C18E53)' }}
                                >
                                    {user?.fullName?.[0] || 'U'}
                                </Avatar>
                                <Text style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 500 }}>
                                    {user?.fullName}
                                </Text>
                            </div>
                        </Dropdown>
                    </div>
                </Header>

                {/* Page content */}
                <Content style={{
                    padding: isMobile ? 8 : 20,
                    minHeight: 'calc(100vh - 48px)',
                    background: 'var(--bg-primary)',
                }}>
                    <Outlet />
                </Content>
            </Layout>

            {/* ── Sidebar Menu Styles ── */}
            <style>{`
                .sidebar-menu.ant-menu {
                    color: ${isDark ? '#c8b8a4' : '#5a4030'};
                }
                .sidebar-menu .ant-menu-item {
                    margin: 2px 8px !important;
                    padding-left: 14px !important;
                    border-radius: 8px !important;
                    height: 38px !important;
                    line-height: 38px !important;
                    transition: all 0.2s ease !important;
                    color: ${isDark ? '#b8a894' : '#6b5540'} !important;
                }
                .sidebar-menu .ant-menu-item:hover {
                    background: ${isDark ? 'rgba(193,142,83,0.1)' : 'rgba(139,90,43,0.06)'} !important;
                    color: ${isDark ? '#e0cbb0' : '#8B5A2B'} !important;
                }
                .sidebar-menu .ant-menu-item-selected {
                    background: ${isDark ? 'rgba(193,142,83,0.18)' : 'rgba(139,90,43,0.1)'} !important;
                    color: ${isDark ? '#e0cbb0' : '#8B5A2B'} !important;
                    font-weight: 600 !important;
                }
                .sidebar-menu .ant-menu-item-selected::after {
                    border-right: none !important;
                }
                .sidebar-menu .ant-menu-submenu-title {
                    margin: 2px 8px !important;
                    padding-left: 14px !important;
                    border-radius: 8px !important;
                    height: 38px !important;
                    line-height: 38px !important;
                    transition: all 0.2s ease !important;
                    color: ${isDark ? '#b8a894' : '#6b5540'} !important;
                }
                .sidebar-menu .ant-menu-submenu-title:hover {
                    background: ${isDark ? 'rgba(193,142,83,0.1)' : 'rgba(139,90,43,0.06)'} !important;
                    color: ${isDark ? '#e0cbb0' : '#8B5A2B'} !important;
                }
                .sidebar-menu .ant-menu-submenu-selected > .ant-menu-submenu-title {
                    color: ${isDark ? '#e0cbb0' : '#8B5A2B'} !important;
                    font-weight: 600 !important;
                }
                .sidebar-menu .ant-menu-sub.ant-menu-inline {
                    background: transparent !important;
                }
                .sidebar-menu .ant-menu-sub .ant-menu-item {
                    padding-left: 42px !important;
                    height: 34px !important;
                    line-height: 34px !important;
                    font-size: 12px !important;
                    margin: 1px 8px !important;
                }
                .sidebar-menu .ant-menu-item .ant-menu-item-icon,
                .sidebar-menu .ant-menu-submenu-title .ant-menu-item-icon {
                    color: ${isDark ? '#b8a894' : '#8B5A2B'} !important;
                    font-size: 15px !important;
                }
                .sidebar-menu .ant-menu-item-selected .ant-menu-item-icon {
                    color: ${isDark ? '#e0cbb0' : '#8B5A2B'} !important;
                }
                .sidebar-menu .ant-menu-submenu-arrow {
                    color: ${isDark ? '#8a7a66' : '#b39670'} !important;
                }
                .sidebar-menu .ant-menu-submenu-open > .ant-menu-submenu-title .ant-menu-submenu-arrow {
                    color: ${isDark ? '#e0cbb0' : '#8B5A2B'} !important;
                }
            `}</style>
        </Layout>
    );
}
