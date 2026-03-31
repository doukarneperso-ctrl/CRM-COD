import { useState, useEffect, useMemo } from 'react';
import {
    Card, Button, Typography, Tabs, Form, Input, Switch, Space,
    message, Tag, Table, Popconfirm, Divider, Checkbox, Image, Pagination,
    Select, Modal,
} from 'antd';
import {
    ReloadOutlined, SaveOutlined, SyncOutlined, DeleteOutlined,
    LinkOutlined, ClockCircleOutlined, DownloadOutlined, ShoppingOutlined,
    SearchOutlined, SettingOutlined,
} from '@ant-design/icons';
import api from '../api/client';

const { Title, Text } = Typography;

// CRM fields — only the 4 we actually need
const CRM_FIELDS = [
    { value: 'full_name', label: 'Full Name' },
    { value: 'phone', label: 'Phone Number' },
    { value: 'city', label: 'City' },
    { value: 'address', label: 'Address' },
];

export default function SettingsPage() {
    // System settings
    const [settingsForm] = Form.useForm();
    const [savingSettings, setSavingSettings] = useState(false);

    // Stores / integrations
    const [stores, setStores] = useState<any[]>([]);
    const [storeLoading, setStoreLoading] = useState(false);
    const [syncing, setSyncing] = useState<Record<string, boolean>>({});
    const [storeLogs, setStoreLogs] = useState<any[]>([]);
    const [logStore, setLogStore] = useState<any>(null);
    const [logsLoading, setLogsLoading] = useState(false);

    // Order sync
    const [syncingOrders, setSyncingOrders] = useState<Record<string, boolean>>({});

    // Product import modal
    const [importStore, setImportStore] = useState<any>(null);
    const [ycProducts, setYcProducts] = useState<any[]>([]);
    const [ycPagination, setYcPagination] = useState<any>({ total: 0, current_page: 1, total_pages: 1 });
    const [ycLoading, setYcLoading] = useState(false);
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
    const [importing, setImporting] = useState(false);
    const [productSearch, setProductSearch] = useState('');

    // Field mapping modal
    const [mappingStore, setMappingStore] = useState<any>(null);
    const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
    const [savingMapping, setSavingMapping] = useState(false);
    const [checkoutFields, setCheckoutFields] = useState<any[]>([]);
    const [checkoutFieldsLoading, setCheckoutFieldsLoading] = useState(false);

    // Onboarding wizard (post-connection flow)
    const [wizardStore, setWizardStore] = useState<any>(null);
    const [wizardStep, setWizardStep] = useState(0); // 0=mapping, 1=products, 2=orders
    const [wizardMapping, setWizardMapping] = useState<Record<string, string>>({});
    const [wizardCheckoutFields, setWizardCheckoutFields] = useState<any[]>([]);
    const [wizardFieldsLoading, setWizardFieldsLoading] = useState(false);
    const [wizardSavingMapping, setWizardSavingMapping] = useState(false);
    const [wizardProducts, setWizardProducts] = useState<any[]>([]);
    const [wizardProductsLoading, setWizardProductsLoading] = useState(false);
    const [wizardSelectedProducts, setWizardSelectedProducts] = useState<string[]>([]);
    const [wizardImporting, setWizardImporting] = useState(false);
    const [wizardSyncingOrders, setWizardSyncingOrders] = useState(false);
    const [wizardSyncResult, setWizardSyncResult] = useState<any>(null);
    const [wizardProductSearch, setWizardProductSearch] = useState('');

    const fetchSettings = async () => {
        try {
            const res = await api.get('/settings');
            const raw: { key: string; value: any }[] = res.data.raw || [];
            const obj: Record<string, any> = {};
            for (const r of raw) {
                try { obj[r.key] = JSON.parse(r.value); } catch { obj[r.key] = r.value; }
            }
            settingsForm.setFieldsValue(obj);
        } catch { message.error('Failed to load settings'); }
    };

    const fetchStores = async () => {
        setStoreLoading(true);
        try {
            const res = await api.get('/settings/stores');
            setStores(res.data.data || []);
        } catch { message.error('Failed to load stores'); }
        setStoreLoading(false);
    };

    const fetchLogs = async (storeId: string) => {
        setLogsLoading(true);
        try {
            const res = await api.get(`/settings/stores/${storeId}/logs`);
            setStoreLogs(res.data.data || []);
        } catch { }
        setLogsLoading(false);
    };

    useEffect(() => { fetchSettings(); fetchStores(); }, []);

    // Listen for OAuth popup result (postMessage from the callback page)
    useEffect(() => {
        const handleOAuthMessage = async (event: MessageEvent) => {
            if (event.data?.type === 'youcan-oauth-result') {
                if (event.data.success) {
                    message.success('YouCan store connected!');
                    // Refresh stores and open onboarding wizard for the newly connected store
                    try {
                        const res = await api.get('/settings/stores');
                        const allStores = res.data.data || [];
                        setStores(allStores);
                        // The newest store is the one just connected
                        if (allStores.length > 0) {
                            const newest = allStores[0]; // sorted by created_at DESC
                            openWizard(newest);
                        }
                    } catch {
                        fetchStores();
                    }
                } else {
                    message.error('Failed to connect YouCan store');
                }
            }
        };
        window.addEventListener('message', handleOAuthMessage);
        return () => window.removeEventListener('message', handleOAuthMessage);
    }, []);

    // ── Onboarding Wizard helpers
    const openWizard = async (store: any) => {
        setWizardStore(store);
        setWizardStep(0);
        setWizardMapping(store.field_mapping || {});
        setWizardCheckoutFields([]);
        setWizardFieldsLoading(true);
        setWizardProducts([]);
        setWizardSelectedProducts([]);
        setWizardSyncResult(null);
        setWizardProductSearch('');
        try {
            const res = await api.get(`/stores/${store.id}/checkout-fields`);
            setWizardCheckoutFields(res.data.data || []);
        } catch { /* will show empty state */ }
        setWizardFieldsLoading(false);
    };

    const wizardSaveMapping = async () => {
        if (!wizardStore) return;
        setWizardSavingMapping(true);
        try {
            await api.put(`/settings/stores/${wizardStore.id}`, { fieldMapping: wizardMapping });
            message.success('Field mapping saved!');
            setWizardStep(1);
        } catch { message.error('Failed to save mapping'); }
        setWizardSavingMapping(false);
    };

    const wizardLoadProducts = async () => {
        if (!wizardStore) return;
        setWizardProductsLoading(true);
        try {
            const res = await api.get(`/stores/${wizardStore.id}/youcan-products`, { params: { page: 1 } });
            setWizardProducts(res.data.data.products || []);
        } catch { message.error('Failed to load products'); }
        setWizardProductsLoading(false);
    };

    const wizardImportProducts = async () => {
        if (!wizardStore || wizardSelectedProducts.length === 0) return;
        setWizardImporting(true);
        try {
            const res = await api.post(`/stores/${wizardStore.id}/import-products`, { productIds: wizardSelectedProducts });
            const { imported, skipped } = res.data.data;
            message.success(`Imported ${imported} products (${skipped} already existed)`);
        } catch { message.error('Failed to import products'); }
        setWizardImporting(false);
    };

    const wizardSyncOrders = async () => {
        if (!wizardStore) return;
        setWizardSyncingOrders(true);
        setWizardSyncResult(null);
        try {
            const res = await api.post(`/stores/${wizardStore.id}/sync-orders`, { limit: 50 });
            setWizardSyncResult(res.data.data);
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Failed to sync orders');
        }
        setWizardSyncingOrders(false);
    };

    const closeWizard = () => {
        setWizardStore(null);
        fetchStores();
    };

    const filteredWizardProducts = useMemo(() => {
        if (!wizardProductSearch) return wizardProducts;
        const q = wizardProductSearch.toLowerCase();
        return wizardProducts.filter((p: any) =>
            p.name?.toLowerCase().includes(q) || p.slug?.toLowerCase().includes(q)
        );
    }, [wizardProducts, wizardProductSearch]);

    const handleSaveSettings = async (values: any) => {
        setSavingSettings(true);
        try {
            const settings = Object.entries(values).map(([key, value]) => ({ key, value }));
            await api.put('/settings', { settings });
            message.success('Settings saved');
        } catch { message.error('Save failed'); }
        setSavingSettings(false);
    };

    const handleSync = async (storeId: string, storeName: string) => {
        setSyncing(p => ({ ...p, [storeId]: true }));
        try {
            await api.post(`/settings/stores/${storeId}/sync`);
            message.success(`Sync queued for ${storeName}`);
        } catch (err: any) { message.error(err.response?.data?.error?.message || 'Sync failed'); }
        setSyncing(p => ({ ...p, [storeId]: false }));
    };

    const handleDeleteStore = async (id: string) => {
        try { await api.delete(`/settings/stores/${id}`); message.success('Store removed'); fetchStores(); }
        catch { message.error('Remove failed'); }
    };

    // ── Sync last 50 orders
    const handleSyncOrders = async (storeId: string) => {
        setSyncingOrders(p => ({ ...p, [storeId]: true }));
        try {
            const res = await api.post(`/stores/${storeId}/sync-orders`, { limit: 50 });
            const { imported, skipped, errors } = res.data.data;
            if (errors > 0) {
                message.warning(`Imported ${imported} orders, ${skipped} duplicates, ${errors} failed`);
            } else {
                message.success(`Imported ${imported} orders (${skipped} duplicates)`);
            }
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Failed to sync orders');
        }
        setSyncingOrders(p => ({ ...p, [storeId]: false }));
    };

    // ── Field Mapping
    const openMappingModal = async (store: any) => {
        setMappingStore(store);
        setFieldMapping(store.field_mapping || {});
        setCheckoutFields([]);
        setCheckoutFieldsLoading(true);
        try {
            const res = await api.get(`/stores/${store.id}/checkout-fields`);
            setCheckoutFields(res.data.data || []);
        } catch {
            message.error('Failed to load checkout fields from YouCan');
        }
        setCheckoutFieldsLoading(false);
    };

    const handleSaveMapping = async () => {
        if (!mappingStore) return;
        setSavingMapping(true);
        try {
            await api.put(`/settings/stores/${mappingStore.id}`, { fieldMapping });
            message.success('Field mapping saved');
            setMappingStore(null);
            fetchStores();
        } catch { message.error('Failed to save mapping'); }
        setSavingMapping(false);
    };

    // ── Fetch YouCan products for import modal
    const openImportModal = async (store: any) => {
        setImportStore(store);
        setSelectedProductIds([]);
        setYcProducts([]);
        setProductSearch('');
        await loadYcProducts(store.id, 1);
    };

    const loadYcProducts = async (storeId: string, page: number) => {
        setYcLoading(true);
        try {
            const res = await api.get(`/stores/${storeId}/youcan-products`, { params: { page } });
            setYcProducts(res.data.data.products || []);
            setYcPagination(res.data.data.pagination || { total: 0, current_page: 1, total_pages: 1 });
        } catch { message.error('Failed to load products from YouCan'); }
        setYcLoading(false);
    };

    // ── Import selected products
    const handleImportProducts = async () => {
        if (!importStore || selectedProductIds.length === 0) return;
        setImporting(true);
        try {
            const res = await api.post(`/stores/${importStore.id}/import-products`, { productIds: selectedProductIds });
            const { imported, skipped } = res.data.data;
            message.success(`Imported ${imported} products (${skipped} already existed)`);
            setImportStore(null);
            setSelectedProductIds([]);
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Failed to import products');
        }
        setImporting(false);
    };

    const toggleProductSelection = (productId: string) => {
        setSelectedProductIds(prev =>
            prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
        );
    };

    // Filter products by search
    const filteredProducts = useMemo(() => {
        if (!productSearch.trim()) return ycProducts;
        const q = productSearch.toLowerCase();
        return ycProducts.filter((p: any) =>
            p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
        );
    }, [ycProducts, productSearch]);

    const handleSelectAll = () => {
        const allIds = filteredProducts.map((p: any) => p.id);
        const allSelected = allIds.every(id => selectedProductIds.includes(id));
        if (allSelected) {
            setSelectedProductIds(prev => prev.filter(id => !allIds.includes(id)));
        } else {
            setSelectedProductIds(prev => [...new Set([...prev, ...allIds])]);
        }
    };

    const formatDate = (d: string) => {
        if (!d) return '—';
        const dt = new Date(d);
        return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    };

    const storeColumns = [
        {
            title: 'STORE', dataIndex: 'name', key: 'name',
            render: (v: string, r: any) => (
                <div>
                    <Text strong>{v}</Text>
                    <Tag style={{ marginLeft: 8, borderRadius: 4, border: 'none', fontSize: 10 }} color={r.platform === 'youcan' ? 'green' : 'blue'}>
                        {r.platform}
                    </Tag>
                    {!r.is_active && <Tag style={{ marginLeft: 4 }} color="default">Inactive</Tag>}
                    {r.is_connected && <Tag style={{ marginLeft: 4, fontSize: 10 }} color="cyan">Connected</Tag>}
                </div>
            ),
        },
        {
            title: 'PRODUCTS', dataIndex: 'product_count', key: 'products', width: 90, align: 'center' as const,
            render: (v: number) => <Text>{v || 0}</Text>,
        },
        {
            title: 'ORDERS', dataIndex: 'order_count', key: 'orders', width: 90, align: 'center' as const,
            render: (v: number) => <Text>{v || 0}</Text>,
        },
        {
            title: 'LAST SYNC', key: 'sync', width: 150,
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontSize: 12 }}>{r.last_sync_at ? formatDate(r.last_sync_at) : '—'}</div>
                    <div style={{ fontSize: 10, opacity: 0.5 }}>Every {r.sync_interval || 30} min</div>
                </div>
            ),
        },
        {
            title: 'ACTIONS', key: 'actions', width: 400,
            render: (_: any, r: any) => (
                <Space wrap>
                    <Button size="small" icon={<DownloadOutlined />}
                        onClick={() => handleSyncOrders(r.id)} loading={syncingOrders[r.id]}
                        disabled={!r.is_connected}>
                        Sync Orders
                    </Button>
                    <Button size="small" icon={<ShoppingOutlined />}
                        onClick={() => openImportModal(r)}
                        disabled={!r.is_connected}>
                        Import Products
                    </Button>
                    <Button size="small" icon={<SettingOutlined />}
                        onClick={() => openMappingModal(r)}
                        disabled={!r.is_connected}>
                        Mapping
                    </Button>
                    <Button size="small" icon={<SyncOutlined spin={syncing[r.id]} />}
                        onClick={() => handleSync(r.id, r.name)} loading={syncing[r.id]}>
                        Sync
                    </Button>
                    <Button size="small" icon={<ClockCircleOutlined />}
                        onClick={() => { setLogStore(r); fetchLogs(r.id); }}>
                        Logs
                    </Button>
                    <Popconfirm title="Remove this store integration?" description="Orders and products already imported will remain." onConfirm={() => handleDeleteStore(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const logColumns = [
        { title: 'DATE', key: 'date', width: 140, render: (_: any, r: any) => <Text style={{ fontSize: 11 }}>{formatDate(r.created_at)}</Text> },
        {
            title: 'STATUS', dataIndex: 'status', key: 'status', width: 90,
            render: (v: string) => <Tag color={v === 'success' ? 'green' : 'red'}>{v}</Tag>,
        },
        { title: 'DETAILS', dataIndex: 'details', key: 'details', render: (v: string) => <Text style={{ fontSize: 11 }}>{v}</Text> },
    ];

    const tabItems = [
        {
            key: 'general',
            label: '⚙️ General',
            children: (
                <Form form={settingsForm} layout="vertical" onFinish={handleSaveSettings}
                    style={{ maxWidth: 600 }}>
                    <Card size="small" title="Order Settings" style={{ marginBottom: 16 }}>
                        <Form.Item name="order_return_window_days" label="Return Window (days)">
                            <Input type="number" min={1} max={30} style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name="duplicate_detection_enabled" label="Duplicate Order Detection" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                        <Form.Item name="duplicate_window_hours" label="Duplicate Check Window (hours)">
                            <Input type="number" min={1} max={72} style={{ width: 120 }} />
                        </Form.Item>
                    </Card>
                    <Card size="small" title="Notification Settings" style={{ marginBottom: 16 }}>
                        <Form.Item name="whatsapp_notifications_enabled" label="WhatsApp Notifications" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                        <Form.Item name="whatsapp_api_key" label="WhatsApp API Key">
                            <Input.Password placeholder="Leave blank to keep existing" />
                        </Form.Item>
                        <Form.Item name="email_notifications_enabled" label="Email Notifications" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                        <Form.Item name="smtp_host" label="SMTP Host">
                            <Input placeholder="smtp.yourdomain.com" />
                        </Form.Item>
                    </Card>
                    <Card size="small" title="Business Settings" style={{ marginBottom: 16 }}>
                        <Form.Item name="business_name" label="Business Name">
                            <Input />
                        </Form.Item>
                        <Form.Item name="default_currency" label="Currency">
                            <Input style={{ width: 100 }} placeholder="MAD" />
                        </Form.Item>
                        <Form.Item name="default_timezone" label="Timezone">
                            <Input placeholder="Africa/Casablanca" />
                        </Form.Item>
                    </Card>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={savingSettings}>
                        Save Settings
                    </Button>
                </Form>
            ),
        },
        {
            key: 'integrations',
            label: '🔗 Integrations',
            children: (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text strong>Connected Stores</Text>
                        <Button icon={<ReloadOutlined />} size="small" onClick={fetchStores}>Refresh</Button>
                    </div>
                    <Table
                        columns={storeColumns} dataSource={stores} rowKey="id"
                        loading={storeLoading} size="small" pagination={false}
                    />

                    <Divider />
                    <Card size="small" title="Add YouCan Store" style={{ maxWidth: 520 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Connect your YouCan store to automatically import products and orders.
                        </Text>
                        <div style={{ marginTop: 12 }}>
                            <Button type="primary" icon={<LinkOutlined />}
                                onClick={async () => {
                                    try {
                                        const res = await api.get('/stores/connect');
                                        if (res.data.authUrl) {
                                            window.open(res.data.authUrl, '_blank', 'width=600,height=700');
                                        } else {
                                            message.info('YouCan OAuth not configured. Set YOUCAN_CLIENT_ID and YOUCAN_CLIENT_SECRET.');
                                        }
                                    } catch { message.error('Failed to initiate connection'); }
                                }}>
                                Connect YouCan Store
                            </Button>
                        </div>
                    </Card>
                </div>
            ),
        },
        {
            key: 'notifications',
            label: '🔔 Notifications',
            children: (
                <div style={{ maxWidth: 650 }}>
                    <Card size="small" title="In-App Notification Preferences" style={{ marginBottom: 16 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
                            Choose which notifications you want to receive. These apply to the bell icon in the header.
                        </Text>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { key: 'order_assigned', label: 'New order assigned', desc: 'When an order is assigned to you', icon: '📋' },
                                { key: 'order_status_changed', label: 'Order status changed', desc: 'When an order is confirmed, cancelled, or shipped', icon: '🔄' },
                                { key: 'callback_reminder', label: 'Callback reminders', desc: '15 minutes before a scheduled callback', icon: '📞' },
                                { key: 'stock_low', label: 'Low stock alerts', desc: 'When product stock drops below threshold', icon: '📦' },
                                { key: 'delivery_export_failed', label: 'Delivery export failures', desc: 'When an order fails to export to courier', icon: '❌' },
                                { key: 'commission_calculated', label: 'Commission updates', desc: 'When a commission is calculated or paid', icon: '💰' },
                                { key: 'return_received', label: 'Return received', desc: 'When a returned order arrives', icon: '↩️' },
                                { key: 'merge_candidate_detected', label: 'Duplicate order detected', desc: 'When a potential duplicate is found', icon: '🔗' },
                                { key: 'recurring_expense_due', label: 'Recurring expense due', desc: 'When a recurring expense is due today', icon: '💳' },
                            ].map(item => (
                                <div key={item.key} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '8px 12px', borderRadius: 8,
                                    border: '1px solid var(--border-secondary)',
                                    background: 'var(--bg-secondary)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 16 }}>{item.icon}</span>
                                        <div>
                                            <Text strong style={{ fontSize: 13, display: 'block' }}>{item.label}</Text>
                                            <Text type="secondary" style={{ fontSize: 11 }}>{item.desc}</Text>
                                        </div>
                                    </div>
                                    <Switch defaultChecked size="small" />
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            ),
        },
        {
            key: 'security',
            label: '🔒 Security',
            children: (
                <div style={{ maxWidth: 500 }}>
                    <Card size="small" title="Change Password" style={{ marginBottom: 16 }}>
                        <Form layout="vertical" onFinish={async (values: any) => {
                            try {
                                await api.put('/auth/change-password', values);
                                message.success('Password changed successfully');
                            } catch (err: any) {
                                message.error(err.response?.data?.error?.message || 'Failed to change password');
                            }
                        }}>
                            <Form.Item name="currentPassword" label="Current Password" rules={[{ required: true }]}>
                                <Input.Password placeholder="Current password" />
                            </Form.Item>
                            <Form.Item name="newPassword" label="New Password" rules={[{ required: true, min: 6 }]}>
                                <Input.Password placeholder="New password (min 6 chars)" />
                            </Form.Item>
                            <Form.Item name="confirmPassword" label="Confirm New Password" rules={[
                                { required: true },
                                ({ getFieldValue }: any) => ({
                                    validator(_: any, value: string) {
                                        if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                                        return Promise.reject(new Error('Passwords do not match'));
                                    }
                                })
                            ]}>
                                <Input.Password placeholder="Confirm new password" />
                            </Form.Item>
                            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>Change Password</Button>
                        </Form>
                    </Card>
                    <Card size="small" title="Session Information">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>Session expires after</Text>
                                <Text style={{ fontSize: 12 }}>24 hours</Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>Max concurrent sessions</Text>
                                <Text style={{ fontSize: 12 }}>Unlimited</Text>
                            </div>
                        </div>
                    </Card>
                </div>
            ),
        },
        {
            key: 'statuses',
            label: '📋 Status Definitions',
            children: (
                <div style={{ maxWidth: 700 }}>
                    <Card size="small" title="Confirmation Statuses" style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {[
                                { key: 'pending', color: '#faad14', desc: 'Awaiting agent confirmation' },
                                { key: 'confirmed', color: '#52c41a', desc: 'Agent confirmed with customer' },
                                { key: 'cancelled', color: '#ff4d4f', desc: 'Order cancelled' },
                                { key: 'unreachable', color: '#d9d9d9', desc: 'Customer cannot be reached' },
                                { key: 'callback', color: '#1890ff', desc: 'Scheduled for callback' },
                                { key: 'fake', color: '#ff4d4f', desc: 'Detected as fake order' },
                                { key: 'out_of_stock', color: '#ff7a45', desc: 'Product out of stock' },
                                { key: 'reported', color: '#722ed1', desc: 'Issue reported' },
                            ].map(s => (
                                <div key={s.key} style={{
                                    padding: '8px 14px', borderRadius: 8,
                                    border: `1px solid ${s.color}30`,
                                    background: `${s.color}08`,
                                    minWidth: 200, flex: '1 1 45%',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />
                                        <Text strong style={{ fontSize: 13, textTransform: 'capitalize' }}>{s.key.replace('_', ' ')}</Text>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 11 }}>{s.desc}</Text>
                                </div>
                            ))}
                        </div>
                    </Card>
                    <Card size="small" title="Shipping Statuses">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {[
                                { key: 'not_shipped', color: '#d9d9d9', desc: 'Not yet shipped' },
                                { key: 'shipped', color: '#1890ff', desc: 'Shipped to courier' },
                                { key: 'in_transit', color: '#faad14', desc: 'In transit to customer' },
                                { key: 'delivered', color: '#52c41a', desc: 'Delivered to customer' },
                                { key: 'returned', color: '#ff4d4f', desc: 'Returned by customer' },
                            ].map(s => (
                                <div key={s.key} style={{
                                    padding: '8px 14px', borderRadius: 8,
                                    border: `1px solid ${s.color}30`,
                                    background: `${s.color}08`,
                                    minWidth: 200, flex: '1 1 45%',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />
                                        <Text strong style={{ fontSize: 13, textTransform: 'capitalize' }}>{s.key.replace(/_/g, ' ')}</Text>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 11 }}>{s.desc}</Text>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            ),
        },
    ];

    // Check if all filtered products are selected
    const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every((p: any) => selectedProductIds.includes(p.id));

    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>⚙️ Settings</Title>
            </div>

            <Tabs items={tabItems} />

            {/* Sync Logs Modal */}
            {logStore && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }}
                    onClick={() => { setLogStore(null); setStoreLogs([]); }}>
                    <Card
                        title={`Sync Logs — ${logStore.name}`}
                        style={{ width: 640, maxHeight: '70vh', overflow: 'auto' }}
                        onClick={(e) => e.stopPropagation()}
                        extra={<Button size="small" onClick={() => { setLogStore(null); setStoreLogs([]); }}>Close</Button>}
                    >
                        <Table
                            columns={logColumns} dataSource={storeLogs} rowKey="id"
                            loading={logsLoading} size="small" pagination={{ pageSize: 20 }}
                        />
                    </Card>
                </div>
            )}

            {/* Field Mapping Modal */}
            <Modal
                title={<span><SettingOutlined style={{ marginRight: 8 }} />Field Mapping — {mappingStore?.name}</span>}
                open={!!mappingStore}
                onCancel={() => setMappingStore(null)}
                onOk={handleSaveMapping}
                okText="Save Mapping"
                confirmLoading={savingMapping}
                width={680}
            >
                <div style={{ marginBottom: 16 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                        Map each CRM field to the corresponding YouCan checkout field. This controls how customer data from YouCan orders is imported into your CRM.
                    </Text>
                </div>
                {checkoutFieldsLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <SyncOutlined spin style={{ fontSize: 24, color: '#52c41a' }} />
                        <div style={{ marginTop: 8, color: '#888' }}>Loading checkout fields from YouCan...</div>
                    </div>
                ) : checkoutFields.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 32, color: '#999' }}>
                        No active checkout fields found. Make sure your YouCan store has checkout fields enabled.
                    </div>
                ) : (
                    <>
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: '10px 12px',
                            alignItems: 'center',
                        }}>
                            <Text strong style={{ fontSize: 12, color: '#1890ff' }}>CRM Field</Text>
                            <div />
                            <Text strong style={{ fontSize: 12, color: '#52c41a' }}>YouCan Checkout Field</Text>

                            {CRM_FIELDS.map(crmField => (
                                <div key={crmField.value} style={{ display: 'contents' }}>
                                    <div style={{
                                        padding: '6px 12px', background: '#f0f5ff', borderRadius: 6,
                                        fontSize: 13, fontWeight: 500, border: '1px solid #d6e4ff',
                                    }}>
                                        {crmField.label}
                                    </div>
                                    <div style={{ textAlign: 'center', color: '#999', fontSize: 16 }}>←</div>
                                    <Select
                                        allowClear
                                        placeholder="Select YouCan field..."
                                        style={{ width: '100%' }}
                                        value={fieldMapping[crmField.value] || undefined}
                                        onChange={(val) => setFieldMapping(prev => ({
                                            ...prev,
                                            [crmField.value]: val || '',
                                        }))}
                                        options={checkoutFields.map(f => ({
                                            value: f.name,
                                            label: `${f.display_name}${f.custom ? ' (custom)' : ''}`,
                                        }))}
                                        size="small"
                                    />
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: 16, padding: '10px 12px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
                            <Text style={{ fontSize: 12, color: '#52c41a' }}>
                                💡 <strong>Tip:</strong> These are the active checkout fields from your YouCan store.
                                Map each one to the corresponding CRM field so orders sync correctly.
                            </Text>
                        </div>
                    </>
                )}
            </Modal>

            {/* Product Import Modal */}
            {importStore && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }}
                    onClick={() => { setImportStore(null); setSelectedProductIds([]); }}>
                    <Card
                        title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <ShoppingOutlined style={{ color: '#7c3aed' }} />
                                <span>Import Products — {importStore.name}</span>
                                {selectedProductIds.length > 0 && (
                                    <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>
                                        {selectedProductIds.length} selected
                                    </Tag>
                                )}
                            </div>
                        }
                        style={{ width: 840, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
                        bodyStyle={{ overflow: 'auto', flex: 1 }}
                        onClick={(e) => e.stopPropagation()}
                        extra={
                            <Space>
                                <Button size="small" onClick={() => { setImportStore(null); setSelectedProductIds([]); }}>Cancel</Button>
                                <Button type="primary" size="small" icon={<DownloadOutlined />}
                                    disabled={selectedProductIds.length === 0} loading={importing}
                                    onClick={handleImportProducts}
                                    style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>
                                    Import {selectedProductIds.length > 0 ? `(${selectedProductIds.length})` : ''}
                                </Button>
                            </Space>
                        }
                    >
                        {ycLoading ? (
                            <div style={{ textAlign: 'center', padding: 40 }}>
                                <SyncOutlined spin style={{ fontSize: 24, color: '#7c3aed' }} />
                                <div style={{ marginTop: 8, color: '#666' }}>Loading products from YouCan...</div>
                            </div>
                        ) : ycProducts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>No products found</div>
                        ) : (
                            <>
                                {/* Search bar + Select All */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    marginBottom: 12, padding: '8px 0',
                                    borderBottom: '1px solid #f0f0f0',
                                }}>
                                    <Input
                                        prefix={<SearchOutlined style={{ color: '#bbb' }} />}
                                        placeholder="Search products by name or SKU..."
                                        allowClear
                                        value={productSearch}
                                        onChange={e => setProductSearch(e.target.value)}
                                        style={{ flex: 1 }}
                                        size="small"
                                    />
                                    <Button
                                        size="small"
                                        type={allFilteredSelected ? 'primary' : 'default'}
                                        onClick={handleSelectAll}
                                        style={allFilteredSelected ? { background: '#7c3aed', borderColor: '#7c3aed' } : {}}
                                    >
                                        {allFilteredSelected ? 'Deselect All' : 'Select All'}
                                    </Button>
                                    <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                                        {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
                                    </Text>
                                </div>

                                {/* Product List */}
                                {filteredProducts.map((p: any) => {
                                    const isSelected = selectedProductIds.includes(p.id);
                                    return (
                                        <div key={p.id}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '10px 14px', marginBottom: 6,
                                                border: isSelected ? '1.5px solid #7c3aed' : '1px solid #eee',
                                                borderRadius: 10, cursor: 'pointer',
                                                background: isSelected ? '#faf5ff' : '#fafafa',
                                                transition: 'all 0.2s ease',
                                            }}
                                            onClick={() => toggleProductSelection(p.id)}
                                            onMouseEnter={e => { if (!isSelected) (e.currentTarget.style.background = '#f5f3ff'); }}
                                            onMouseLeave={e => { if (!isSelected) (e.currentTarget.style.background = '#fafafa'); }}
                                        >
                                            <Checkbox checked={isSelected} style={{ transform: 'scale(1.1)' }} />
                                            <Image
                                                src={p.thumbnail || 'https://via.placeholder.com/48'}
                                                width={52} height={52}
                                                style={{ borderRadius: 8, objectFit: 'cover', border: '1px solid #eee' }}
                                                preview={false}
                                                fallback="https://via.placeholder.com/48?text=No+Image"
                                            />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <Text strong style={{ display: 'block', fontSize: 13.5 }}>{p.name}</Text>
                                                <Space size={10} style={{ fontSize: 12 }}>
                                                    <span style={{ color: '#7c3aed', fontWeight: 600 }}>{p.price} MAD</span>
                                                    {p.has_variants && (
                                                        <Tag color="geekblue" style={{ fontSize: 10, borderRadius: 4 }}>
                                                            {p.variants_count} variant{p.variants_count > 1 ? 's' : ''}
                                                        </Tag>
                                                    )}
                                                    <span style={{ color: '#888' }}>Stock: {p.inventory ?? '—'}</span>
                                                </Space>
                                            </div>
                                            {p.track_inventory && <Tag color="success" style={{ fontSize: 10, borderRadius: 4 }}>Tracked</Tag>}
                                        </div>
                                    );
                                })}

                                {/* Empty search result */}
                                {productSearch && filteredProducts.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                                        No products matching "{productSearch}"
                                    </div>
                                )}

                                {/* Pagination */}
                                {ycPagination.total_pages > 1 && (
                                    <div style={{ textAlign: 'center', marginTop: 14 }}>
                                        <Pagination
                                            current={ycPagination.current_page}
                                            total={ycPagination.total}
                                            pageSize={25}
                                            onChange={(page) => loadYcProducts(importStore.id, page)}
                                            size="small"
                                            showSizeChanger={false}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </Card>
                </div>
            )}

            {/* ═══════ Onboarding Wizard Modal ═══════ */}
            <Modal
                title={<span>🚀 Store Setup — {wizardStore?.name}</span>}
                open={!!wizardStore}
                onCancel={closeWizard}
                footer={null}
                width={760}
                maskClosable={false}
            >
                {/* Stepper */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, padding: '12px 0' }}>
                    {['Field Mapping', 'Import Products', 'Import Orders'].map((label, i) => (
                        <div key={label} style={{
                            flex: 1, textAlign: 'center', padding: '8px 4px',
                            background: wizardStep === i ? '#7c3aed' : wizardStep > i ? '#f0fdf4' : '#f5f5f5',
                            color: wizardStep === i ? '#fff' : wizardStep > i ? '#22c55e' : '#999',
                            borderRadius: 8, fontSize: 13, fontWeight: wizardStep === i ? 600 : 400,
                            border: wizardStep === i ? '2px solid #7c3aed' : wizardStep > i ? '2px solid #22c55e' : '2px solid #e5e7eb',
                            transition: 'all 0.2s',
                        }}>
                            {wizardStep > i ? '✓ ' : `${i + 1}. `}{label}
                        </div>
                    ))}
                </div>

                {/* Step 0: Field Mapping */}
                {wizardStep === 0 && (
                    <div>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            Configure how YouCan checkout fields map to your CRM fields. This ensures customer data imports correctly.
                        </Text>
                        <div style={{ marginTop: 16 }}>
                            {wizardFieldsLoading ? (
                                <div style={{ textAlign: 'center', padding: 32 }}>
                                    <SyncOutlined spin style={{ fontSize: 24, color: '#7c3aed' }} />
                                    <div style={{ marginTop: 8, color: '#888' }}>Loading checkout fields...</div>
                                </div>
                            ) : wizardCheckoutFields.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                                    No active checkout fields found.
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: '10px 12px', alignItems: 'center' }}>
                                    <Text strong style={{ fontSize: 12, color: '#7c3aed' }}>CRM Field</Text>
                                    <div />
                                    <Text strong style={{ fontSize: 12, color: '#22c55e' }}>YouCan Checkout Field</Text>
                                    {CRM_FIELDS.map(f => (
                                        <div key={f.value} style={{ display: 'contents' }}>
                                            <div style={{ padding: '6px 12px', background: '#f5f3ff', borderRadius: 6, fontSize: 13, fontWeight: 500, border: '1px solid #ddd6fe' }}>{f.label}</div>
                                            <div style={{ textAlign: 'center', color: '#999' }}>←</div>
                                            <Select allowClear placeholder="Select..." style={{ width: '100%' }}
                                                value={wizardMapping[f.value] || undefined}
                                                onChange={(val) => setWizardMapping(prev => ({ ...prev, [f.value]: val || '' }))}
                                                options={wizardCheckoutFields.map((cf: any) => ({ value: cf.name, label: `${cf.display_name}${cf.custom ? ' (custom)' : ''}` }))}
                                                size="small"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                            <Button onClick={() => setWizardStep(1)}>Skip</Button>
                            <Button type="primary" style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
                                loading={wizardSavingMapping} onClick={wizardSaveMapping}
                                disabled={wizardCheckoutFields.length === 0}>
                                Save & Continue
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step 1: Import Products */}
                {wizardStep === 1 && (
                    <div>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            Browse and import products from your YouCan store into the CRM stock system.
                        </Text>
                        {wizardProducts.length === 0 && !wizardProductsLoading && (
                            <div style={{ textAlign: 'center', padding: 32 }}>
                                <Button type="primary" icon={<DownloadOutlined />} onClick={wizardLoadProducts}
                                    style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>
                                    Load Products from YouCan
                                </Button>
                            </div>
                        )}
                        {wizardProductsLoading && (
                            <div style={{ textAlign: 'center', padding: 32 }}>
                                <SyncOutlined spin style={{ fontSize: 24, color: '#7c3aed' }} />
                                <div style={{ marginTop: 8, color: '#888' }}>Loading products...</div>
                            </div>
                        )}
                        {wizardProducts.length > 0 && (
                            <>
                                <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
                                    <Input prefix={<SearchOutlined />} placeholder="Search products..."
                                        value={wizardProductSearch} onChange={e => setWizardProductSearch(e.target.value)}
                                        style={{ flex: 1 }} size="small" />
                                    <Button size="small" onClick={() => setWizardSelectedProducts(filteredWizardProducts.map((p: any) => p.id))}>
                                        Select All
                                    </Button>
                                    <Button size="small" onClick={() => setWizardSelectedProducts([])}>Clear</Button>
                                </div>
                                <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 8 }}>
                                    {filteredWizardProducts.map((p: any) => (
                                        <div key={p.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
                                            borderRadius: 6, cursor: 'pointer',
                                            background: wizardSelectedProducts.includes(p.id) ? '#f5f3ff' : 'transparent',
                                            border: wizardSelectedProducts.includes(p.id) ? '1px solid #ddd6fe' : '1px solid transparent',
                                            marginBottom: 4,
                                        }} onClick={() => setWizardSelectedProducts(prev =>
                                            prev.includes(p.id) ? prev.filter((id: string) => id !== p.id) : [...prev, p.id]
                                        )}>
                                            <Checkbox checked={wizardSelectedProducts.includes(p.id)} />
                                            <Image src={p.images?.[0]?.url || p.thumbnail} width={36} height={36}
                                                style={{ borderRadius: 4, objectFit: 'cover' }} preview={false}
                                                fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzYiIGhlaWdodD0iMzYiIHZpZXdCb3g9IjAgMCAzNiAzNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzYiIGhlaWdodD0iMzYiIGZpbGw9IiNmNWY1ZjUiLz48L3N2Zz4=" />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                                                <div style={{ fontSize: 11, color: '#999' }}>{p.variants?.length || 0} variants • {p.price || 0} MAD</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                                    {wizardSelectedProducts.length} product(s) selected
                                </div>
                            </>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
                            <Button onClick={() => setWizardStep(0)}>← Back</Button>
                            <Space>
                                <Button onClick={() => setWizardStep(2)}>Skip</Button>
                                {wizardSelectedProducts.length > 0 && (
                                    <Button type="primary" icon={<DownloadOutlined />} loading={wizardImporting}
                                        style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
                                        onClick={async () => { await wizardImportProducts(); setWizardStep(2); }}>
                                        Import {wizardSelectedProducts.length} Products & Continue
                                    </Button>
                                )}
                            </Space>
                        </div>
                    </div>
                )}

                {/* Step 2: Import Orders */}
                {wizardStep === 2 && (
                    <div>
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            Import the last 50 orders from your YouCan store. Customer data will be mapped using the field mapping you configured.
                        </Text>
                        <div style={{ textAlign: 'center', padding: 32 }}>
                            {!wizardSyncResult && !wizardSyncingOrders && (
                                <Button type="primary" icon={<SyncOutlined />} size="large"
                                    style={{ background: '#7c3aed', borderColor: '#7c3aed', height: 48, fontSize: 16, padding: '0 32px' }}
                                    onClick={wizardSyncOrders}>
                                    Import Last 50 Orders
                                </Button>
                            )}
                            {wizardSyncingOrders && (
                                <div>
                                    <SyncOutlined spin style={{ fontSize: 36, color: '#7c3aed' }} />
                                    <div style={{ marginTop: 12, color: '#888', fontSize: 14 }}>Importing orders from YouCan...</div>
                                </div>
                            )}
                            {wizardSyncResult && (
                                <div style={{ padding: '16px 24px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0', display: 'inline-block' }}>
                                    <div style={{ fontSize: 36 }}>✅</div>
                                    <div style={{ fontSize: 18, fontWeight: 600, color: '#15803d', marginTop: 4 }}>Import Complete!</div>
                                    <div style={{ fontSize: 14, color: '#555', marginTop: 8 }}>
                                        <strong>{wizardSyncResult.imported}</strong> orders imported
                                        {wizardSyncResult.skipped > 0 && <> • <strong>{wizardSyncResult.skipped}</strong> duplicates skipped</>}
                                        {wizardSyncResult.errors > 0 && <> • <span style={{ color: '#ef4444' }}><strong>{wizardSyncResult.errors}</strong> failed</span></>}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                            <Button onClick={() => setWizardStep(1)}>← Back</Button>
                            <Button type="primary" style={{ background: '#7c3aed', borderColor: '#7c3aed' }} onClick={closeWizard}>
                                {wizardSyncResult ? 'Finish Setup' : 'Skip & Close'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
