import { useState, useEffect } from 'react';
import {
    Table, Button, Card, Row, Col, Typography, Tag, Input, InputNumber,
    Select, DatePicker, Space, Tabs, Badge, Tooltip, message,
    Modal, Divider, Alert, Collapse, Form,
} from 'antd';
import {
    PhoneOutlined, ClockCircleOutlined, CheckCircleOutlined, TruckOutlined,
    RollbackOutlined, CloseCircleOutlined, CopyOutlined, DollarOutlined,
    ShoppingCartOutlined, ReloadOutlined, ExclamationCircleOutlined,
    StopOutlined, WarningOutlined, CalendarOutlined, MergeCellsOutlined,
    DeleteOutlined, PlusOutlined, HistoryOutlined, SendOutlined, MinusCircleOutlined, UserOutlined,
} from '@ant-design/icons';
import { QRCodeSVG } from 'qrcode.react';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';
import { useRealtimeRefresh } from '../hooks/useSocket';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const confirmationColors: Record<string, string> = {
    pending: 'gold', confirmed: 'green', cancelled: 'red',
    unreachable: 'default', fake: 'magenta', reported: 'blue',
    out_of_stock: 'orange', merged_into: 'purple',
};

// Convert phone to Moroccan local format: +212612345678 → 0612345678
const formatPhone = (phone: string): string => {
    if (!phone) return '';
    let p = phone.replace(/\s+/g, '').replace(/-/g, '');
    // 00212 → 0 (check first, most specific)
    if (p.startsWith('00212')) p = '0' + p.slice(5);
    // +212 → 0
    else if (p.startsWith('+212')) p = '0' + p.slice(4);
    // 212 (without +) → 0
    else if (p.startsWith('212') && p.length >= 12) p = '0' + p.slice(3);
    // Fix double 0 (e.g. +2120612... → 00612... → 0612...)
    while (p.startsWith('00')) p = p.slice(1);
    return p;
};

// Check if phone is a valid Moroccan mobile number (starts with 05, 06, or 07)
const isValidMoroccanPhone = (phone: string): boolean => {
    const p = formatPhone(phone);
    return /^0[567]\d{8}$/.test(p);
};

// Get WhatsApp link (needs international format without +)
const getWhatsAppLink = (phone: string): string => {
    if (!phone) return '';
    let p = phone.replace(/\s+/g, '').replace(/-/g, '').replace('+', '');
    // If starts with 0, convert to 212
    if (p.startsWith('0')) p = '212' + p.slice(1);
    // If starts with 00212, remove 00
    if (p.startsWith('00212')) p = p.slice(2);
    return `https://wa.me/${p}`;
};

const CONFIRMATION_STATUSES = [
    { key: 'pending', label: '📋 Pending', color: '#faad14', icon: <ClockCircleOutlined /> },
    { key: 'confirmed', label: '✅ Confirmed', color: '#52c41a', icon: <CheckCircleOutlined /> },
    { key: 'rescheduled', label: '🔁 Rescheduled', color: '#1890ff', icon: <ClockCircleOutlined /> },
    { key: 'out_of_stock', label: '📦 Out of Stock', color: '#fa8c16', icon: <StopOutlined /> },
    { key: 'failed', label: '❌ Failed', color: '#ff4d4f', icon: <CloseCircleOutlined /> },
    { key: 'cancelled', label: '🚫 Cancelled', color: '#8c8c8c', icon: <CloseCircleOutlined /> },
];



// Theme constants using CSS variables
const THEME = {
    bg: 'var(--bg-elevated)',
    bgLight: 'var(--bg-input)',
    bgCard: 'var(--bg-hover)',
    border: 'var(--border-light)',
    accent: '#8B5A2B',
    accentLight: '#C18E53',
    text: 'var(--text-primary)',
    textSec: 'var(--text-secondary)',
    success: '#52c41a',
    danger: '#ff4d4f',
    warning: '#faad14',
    blue: '#1890ff',
};

export default function CallCentrePage() {
    const [queue, setQueue] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<any>({});
    const [commissions, setCommissions] = useState<any>({});
    const [activeTab, setActiveTab] = useState('pending');
    const [activeSection, setActiveSection] = useState<string | string[]>('confirmation');
    const [tabCounts, setTabCounts] = useState<any>({});
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState<[string, string]>(['', '']);
    const [failedDeliveryBreakdown, setFailedDeliveryBreakdown] = useState<any[]>([]);
    const [failedDeliveryCourierFilter, setFailedDeliveryCourierFilter] = useState<string | null>(null);

    // Confirmation popup state
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [callNotes, setCallNotes] = useState('');
    const [deliveryNotes, setDeliveryNotes] = useState('');
    const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
    const [discountValue, setDiscountValue] = useState(0);
    const [callbackDate, setCallbackDate] = useState<any>(null);
    const [statusLoading, setStatusLoading] = useState('');
    const [editableItems, setEditableItems] = useState<any[]>([]);

    // Editable customer info state
    const [custName, setCustName] = useState('');
    const [custPhone, setCustPhone] = useState('');
    const [custCity, setCustCity] = useState('');
    const [custAddress, setCustAddress] = useState('');

    // Products list for dropdowns
    const [products, setProducts] = useState<any[]>([]);
    const [itemSelections, setItemSelections] = useState<Record<number, { productId?: string; size?: string; color?: string }>>({});

    // Duplicate/merge state
    const [duplicates, setDuplicates] = useState<any[]>([]);
    const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
    const [mergeModalOpen, setMergeModalOpen] = useState(false);
    const [mergeItems, setMergeItems] = useState<any[]>([]);
    const [mergePrimary, setMergePrimary] = useState<any>(null);
    const [mergeSecondary, setMergeSecondary] = useState<any[]>([]);
    const [mergeLoading, setMergeLoading] = useState(false);

    // Delivery company + city validation
    const [couriers, setCouriers] = useState<any[]>([]);
    const [selectedCourier, setSelectedCourier] = useState<string | undefined>(undefined);
    const [courierCityOptions, setCourierCityOptions] = useState<{value: string; label: string}[]>([]);
    const [cityWarning, setCityWarning] = useState('');

    // Customer history
    const [customerHistory, setCustomerHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    
    const { hasPermission } = useAuthStore();
    const [createOpen, setCreateOpen] = useState(false);
    const [form] = Form.useForm();
    const [createItemSelections, setCreateItemSelections] = useState<Record<number, { productId?: string; size?: string; color?: string }>>({});

    // Helpers for create
    const productHasSizes = (productId: string) => getSizesForProduct(productId).length > 0;
    const productHasColors = (productId: string) => {
        const variants = getVariantsForProduct(productId);
        return variants.some((v: any) => v.colorName);
    };
    const watchedDiscountType = Form.useWatch('discountType', form);
    const watchedDiscountValue = Form.useWatch('discountValue', form);
    const watchedItems = Form.useWatch('items', form);
    const getDiscountedPrice = (unitPrice: number) => {
        if (!watchedDiscountValue || watchedDiscountValue <= 0 || !unitPrice) return null;
        if (watchedDiscountType === 'percentage') {
            return Math.max(0, unitPrice * (1 - watchedDiscountValue / 100));
        }
        const allItems = watchedItems || [];
        const subtotal = allItems.reduce((s: number, i: any) => s + ((i?.unitPrice || 0) * (i?.quantity || 1)), 0);
        if (subtotal <= 0) return null;
        const proportion = unitPrice / subtotal;
        const itemDiscount = watchedDiscountValue * proportion;
        return Math.max(0, unitPrice - itemDiscount);
    };

    const handleCreate = async (values: any) => {
        try {
            const items = (values.items || []).map((item: any, idx: number) => {
                const sel = createItemSelections[idx];
                let variantId = item.variantId;
                if (!variantId && sel?.productId) {
                    const match = findMatchingVariant(sel.productId, sel.size, sel.color);
                    if (match) variantId = match.value;
                }
                return {
                    variantId,
                    quantity: item.quantity || 1,
                    unitPrice: parseFloat(item.unitPrice) || 0,
                };
            });
            if (items.length === 0 || !items[0].variantId) {
                message.error('Add at least one item with a selected variant');
                return;
            }

            let discount = 0;
            if (values.discountValue && values.discountValue > 0) {
                const subtotal = items.reduce((s: number, i: any) => s + i.unitPrice * i.quantity, 0);
                discount = values.discountType === 'percentage'
                    ? subtotal * values.discountValue / 100
                    : values.discountValue;
            }

            await api.post('/orders', {
                customerName: values.customerName,
                customerPhone: values.customerPhone,
                customerCity: values.customerCity || undefined,
                customerAddress: values.customerAddress || undefined,
                items,
                shippingCost: parseFloat(values.shippingCost) || 0,
                discount,
                note: values.note || undefined,
                deliveryNotes: values.deliveryNotes || undefined,
                source: values.source || 'manual',
            });
            message.success('Order created!');
            setCreateOpen(false);
            setCreateItemSelections({});
            form.resetFields();
            fetchQueue();
            fetchStats();
        } catch (err: any) {
            message.error(err?.response?.data?.error?.message || 'Create failed');
        }
    };

    const fetchQueue = async () => {
        setLoading(true);
        try {
            const params: any = { status: activeTab, pageSize: 50 };
            if (search) params.search = search;
            if (dateRange[0]) params.from = dateRange[0];
            if (dateRange[1]) params.to = dateRange[1];
            const res = await api.get('/call-centre/queue', { params });
            setQueue(res.data.data || []);
            setTabCounts(res.data.tabCounts || {});
            if (res.data.failedDeliveryBreakdown) {
                setFailedDeliveryBreakdown(res.data.failedDeliveryBreakdown);
            }
        } catch { message.error('Failed to load queue'); }
        setLoading(false);
    };

    const fetchStats = async () => {
        try {
            const res = await api.get('/call-centre/stats');
            setStats(res.data.data || {});
        } catch { }
    };

    const fetchCommissions = async () => {
        try {
            const res = await api.get('/call-centre/commissions');
            setCommissions(res.data.data || {});
        } catch { }
    };

    const fetchProducts = async () => {
        try { const res = await api.get('/products', { params: { pageSize: 200 } }); setProducts(res.data.data || []); } catch { }
    };

    const fetchCouriers = async () => {
        try {
            const res = await api.get('/delivery/companies');
            const companies = res.data.data || [];
            // For each company, also fetch its city list
            const withCities = await Promise.all(companies.map(async (c: any) => {
                try {
                    const cityRes = await api.get(`/delivery/cities/${c.id}`);
                    return { ...c, city_list: cityRes.data.data || [] };
                } catch { return { ...c, city_list: [] }; }
            }));
            setCouriers(withCities);
        } catch { }
    };

    useEffect(() => { fetchStats(); fetchCommissions(); fetchProducts(); fetchCouriers(); }, []);
    useEffect(() => { fetchQueue(); }, [activeTab, search, dateRange]);

    // Real-time auto-refresh via Socket.IO
    useRealtimeRefresh(() => { fetchQueue(); fetchStats(); });

    // Product dropdown helpers
    const productOptions = products.map((p: any) => ({ value: p.id, label: p.name }));
    const getVariantsForProduct = (productId: string) => {
        const product = products.find((p: any) => p.id === productId);
        if (!product) return [];
        return (product.variants || []).map((v: any) => ({
            value: v.id, sizeName: v.size || null, colorName: v.color || null,
            price: parseFloat(v.price) || 0, stock: v.stock ?? 0,
        }));
    };
    const getSizesForProduct = (productId: string) => {
        const variants = getVariantsForProduct(productId);
        return [...new Set(variants.map((v: any) => v.sizeName).filter(Boolean))];
    };
    const getColorsForProduct = (productId: string, size?: string) => {
        const variants = getVariantsForProduct(productId);
        const filtered = size ? variants.filter((v: any) => v.sizeName === size) : variants;
        return [...new Set(filtered.map((v: any) => v.colorName).filter(Boolean))];
    };
    const findMatchingVariant = (productId: string, size?: string, color?: string) => {
        const variants = getVariantsForProduct(productId);
        return variants.find((v: any) => {
            const sizeMatch = !size ? !v.sizeName : v.sizeName === size;
            const colorMatch = !color ? !v.colorName : v.colorName === color;
            return sizeMatch && colorMatch;
        });
    };

    const formatAmount = (v: any) => {
        const n = parseFloat(String(v || 0));
        return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
    };



    // ── Handle Call button click ──
    const handleCallClick = async (order: any) => {
        setSelectedOrder(order);
        setCallNotes('');
        setDeliveryNotes(order.delivery_notes || '');
        setDiscountType(order.discount_type || 'fixed');
        setDiscountValue(order.discount || 0);
        setCallbackDate(null);
        setItemSelections({});

        // Initialize editable customer info
        setCustName(order.customer_name || '');
        setCustPhone(formatPhone(order.customer_phone || ''));
        setCustCity(order.customer_city || '');
        setCustAddress(order.customer_address || '');

        // Auto-select first courier (Coliix) and load its cities
        if (couriers.length > 0) {
            const defaultCourier = couriers[0];
            setSelectedCourier(defaultCourier.id);
            if (defaultCourier.city_list && defaultCourier.city_list.length > 0) {
                const options = defaultCourier.city_list
                    .filter((c: any) => c.city_name)
                    .map((c: any) => ({
                        value: c.city_name,
                        label: `${c.city_name}${c.shipping_fee ? ` (${parseFloat(c.shipping_fee)} MAD)` : ''}`,
                    }));
                setCourierCityOptions(options);
                // Validate current city against courier list
                const cityNames = options.map((o: any) => o.value.toLowerCase());
                const city = order.customer_city || '';
                if (city && !cityNames.includes(city.toLowerCase())) {
                    setCityWarning(`"${city}" is not in ${defaultCourier.name}'s city list`);
                } else {
                    setCityWarning('');
                }
            }
        }

        // Initialize editable items from order
        setEditableItems((order.items || []).map((item: any) => ({
            ...item,
            _key: Math.random().toString(36).slice(2),
        })));

        // Pre-populate product selections from existing variants
        initItemSelections(order.items || []);
        // Auto-relink orphan items (variant_id is null) to matching products
        const hasOrphans = (order.items || []).some((item: any) => !item.variantId);
        if (hasOrphans) {
            try {
                const relinkRes = await api.post('/call-centre/relink-items', { orderId: order.id });
                if (relinkRes.data.linked > 0) {
                    message.info(`🔗 ${relinkRes.data.linked} item(s) auto-linked to products`);
                    setEditableItems((relinkRes.data.items || []).map((item: any) => ({
                        ...item,
                        _key: Math.random().toString(36).slice(2),
                    })));
                }
            } catch { }
        }

        // Check for duplicates
        if (order.customer_phone) {
            try {
                const res = await api.get('/call-centre/duplicates', {
                    params: { phone: order.customer_phone, excludeOrderId: order.id }
                });
                const dups = res.data.data || [];
                if (dups.length > 0) {
                    setDuplicates(dups);
                    setDuplicateModalOpen(true);
                    return;
                }
            } catch { }
        }

        setConfirmModalOpen(true);

        // Fetch customer history in background
        if (order.customer_phone) {
            setHistoryLoading(true);
            try {
                const hRes = await api.get('/call-centre/customer-history', {
                    params: { phone: order.customer_phone, excludeOrderId: order.id }
                });
                setCustomerHistory(hRes.data.data || []);
            } catch { setCustomerHistory([]); }
            setHistoryLoading(false);
        }
    };

    // ── Continue without merging ──
    const handleContinueWithoutMerge = async () => {
        setDuplicateModalOpen(false);
        setConfirmModalOpen(true);

        // Fetch customer history
        if (selectedOrder?.customer_phone) {
            setHistoryLoading(true);
            try {
                const hRes = await api.get('/call-centre/customer-history', {
                    params: { phone: selectedOrder.customer_phone, excludeOrderId: selectedOrder.id }
                });
                setCustomerHistory(hRes.data.data || []);
            } catch { setCustomerHistory([]); }
            setHistoryLoading(false);
        }
    };

    // ── Open merge preview ──
    const handleOpenMerge = () => {
        setDuplicateModalOpen(false);
        const primary = selectedOrder;
        setMergePrimary(primary);
        setMergeSecondary(duplicates);

        const allItems: any[] = [];
        (primary.items || []).forEach((item: any) => {
            allItems.push({ ...item, sourceOrder: primary.order_number });
        });
        for (const dup of duplicates) {
            (dup.items || []).forEach((item: any) => {
                allItems.push({ ...item, sourceOrder: dup.order_number });
            });
        }
        setMergeItems(allItems);
        setMergeModalOpen(true);
    };

    // ── Execute merge ──
    const handleMerge = async () => {
        setMergeLoading(true);
        try {
            await api.post('/orders/merge', {
                primaryOrderId: mergePrimary.id,
                secondaryOrderIds: mergeSecondary.map((d: any) => d.id),
            });
            message.success('Orders merged successfully!');
            setMergeModalOpen(false);
            fetchQueue();
            fetchStats();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Failed to merge');
        }
        setMergeLoading(false);
    };

    // ── Save order changes before status change ──
    const saveOrderChanges = async () => {
        if (!selectedOrder) return;
        try {
            await api.put(`/orders/${selectedOrder.id}`, {
                customerName: custName || undefined,
                customerPhone: custPhone || undefined,
                customerCity: custCity || undefined,
                customerAddress: custAddress || undefined,
                deliveryNotes: deliveryNotes || undefined,
                discount: discountValue || 0,
                note: callNotes || undefined,
                items: editableItems.map(item => ({
                    variantId: item.variantId || null,
                    productName: item.productName || '',
                    variantInfo: item.variantInfo || '',
                    quantity: item.quantity || 1,
                    unitPrice: item.unitPrice || 0,
                })),
            });
        } catch { }
    };

    // ── Change confirmation status ──
    const handleStatusChange = async (status: string) => {
        if (!selectedOrder) return;

        if (status === 'reported' && !callbackDate) {
            message.warning('Please select a callback date/time');
            return;
        }
        if (status === 'cancelled' && !callNotes.trim()) {
            message.warning('Please enter a reason in call notes');
            return;
        }

        setStatusLoading(status);
        try {
            // Save item/note/discount changes first
            await saveOrderChanges();

            // Schedule callback if reporting
            if (status === 'reported' && callbackDate) {
                try {
                    await api.post(`/orders/${selectedOrder.id}/schedule-callback`, {
                        scheduledAt: callbackDate.toISOString(),
                        notes: callNotes || undefined,
                    });
                } catch { /* callback scheduling is best-effort */ }
            }

            await api.put(`/orders/${selectedOrder.id}/confirmation-status`, {
                status,
                note: callNotes || undefined,
            });
            message.success(`Order ${status === 'confirmed' ? 'confirmed' : status === 'cancelled' ? 'cancelled' : `marked as ${status}`}`);
            setConfirmModalOpen(false);
            setCallbackDate(null);
            fetchQueue();
            fetchStats();
        } catch (err: any) {
            const errData = err.response?.data;
            if (errData?.error?.code === 'OUT_OF_STOCK') {
                message.error('Out of stock — marked as out_of_stock');
                setConfirmModalOpen(false);
                fetchQueue();
            } else {
                message.error(errData?.error?.message || 'Failed to update status');
            }
        }
        setStatusLoading('');
    };

    // ── Item editing helpers ──
    const updateItem = (idx: number, field: string, value: any) => {
        setEditableItems(prev => {
            const items = [...prev];
            items[idx] = { ...items[idx], [field]: value };
            return items;
        });
    };

    const removeItem = (idx: number) => {
        setEditableItems(prev => prev.filter((_, i) => i !== idx));
        setItemSelections(prev => { const n = { ...prev }; delete n[idx]; return n; });
    };

    const addEmptyItem = () => {
        setEditableItems(prev => [...prev, {
            _key: Math.random().toString(36).slice(2),
            productName: '', variantInfo: '', quantity: 1, unitPrice: 0,
            variantId: null, stock: null,
        }]);
    };

    const handleProductSelect = (idx: number, productId: string) => {
        setItemSelections(prev => ({ ...prev, [idx]: { productId } }));
        const product = products.find((p: any) => p.id === productId);
        const variants = getVariantsForProduct(productId);
        // Auto-select if single variant
        if (variants.length === 1) {
            const v = variants[0];
            updateItem(idx, 'variantId', v.value);
            updateItem(idx, 'unitPrice', v.price);
            updateItem(idx, 'stock', v.stock);
            updateItem(idx, 'productName', product?.name || '');
            updateItem(idx, 'variantInfo', [v.sizeName, v.colorName].filter(Boolean).join(' / '));
        } else {
            updateItem(idx, 'variantId', null);
            updateItem(idx, 'productName', product?.name || '');
            updateItem(idx, 'variantInfo', '');
        }
    };

    const handleSizeSelect = (idx: number, size: string) => {
        const sel = itemSelections[idx] || {};
        const newSel = { ...sel, size, color: undefined };
        setItemSelections(prev => ({ ...prev, [idx]: newSel }));
        const hasColors = getColorsForProduct(sel.productId!, size).length > 0;
        if (!hasColors) {
            const match = findMatchingVariant(sel.productId!, size);
            if (match) {
                updateItem(idx, 'variantId', match.value);
                updateItem(idx, 'unitPrice', match.price);
                updateItem(idx, 'stock', match.stock);
                updateItem(idx, 'variantInfo', [match.sizeName, match.colorName].filter(Boolean).join(' / '));
            }
        }
    };

    const handleColorSelect = (idx: number, color: string) => {
        const sel = itemSelections[idx] || {};
        setItemSelections(prev => ({ ...prev, [idx]: { ...sel, color } }));
        const match = findMatchingVariant(sel.productId!, sel.size, color);
        if (match) {
            updateItem(idx, 'variantId', match.value);
            updateItem(idx, 'unitPrice', match.price);
            updateItem(idx, 'stock', match.stock);
            updateItem(idx, 'variantInfo', [match.sizeName, match.colorName].filter(Boolean).join(' / '));
        }
    };

    // Initialize itemSelections when popup opens (try to match existing variants back to products)
    const initItemSelections = (items: any[]) => {
        const sels: Record<number, { productId?: string; size?: string; color?: string }> = {};
        items.forEach((item, idx) => {
            if (item.variantId) {
                for (const p of products) {
                    const v = (p.variants || []).find((pv: any) => pv.id === item.variantId);
                    if (v) {
                        sels[idx] = { productId: p.id, size: v.size || undefined, color: v.color || undefined };
                        break;
                    }
                }
            }
        });
        setItemSelections(sels);
    };
    // ── Calculate totals ──
    const getSubtotal = () => editableItems.reduce((sum, item) => sum + (item.unitPrice || 0) * (item.quantity || 1), 0);
    const getTotal = () => {
        const sub = getSubtotal();
        const disc = discountType === 'percentage' ? sub * (discountValue / 100) : discountValue;
        return Math.max(0, sub - disc);
    };

    // ── Stock badge ──
    const stockBadge = (stock: any, variantId: any) => {
        if (!variantId) return <Tag color="warning" style={{ fontSize: 10 }}>⚠️ Unlinked</Tag>;
        const s = parseInt(stock);
        if (isNaN(s)) return <Tag color="default" style={{ fontSize: 10 }}>N/A</Tag>;
        if (s <= 0) return <Tag color="error" style={{ fontSize: 10 }}>🔴 0</Tag>;
        if (s <= 10) return <Tag color="warning" style={{ fontSize: 10 }}>🟡 {s}</Tag>;
        return <Tag color="success" style={{ fontSize: 10 }}>✅ {s}</Tag>;
    };

    // ── Section style helper ──
    const sectionStyle = {
        background: THEME.bgCard,
        border: `1px solid ${THEME.border}`,
        borderRadius: 8,
        padding: '8px 10px',
        marginBottom: 8,
    };

    const sectionTitle = (icon: string, label: string) => (
        <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: THEME.accentLight, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
            {icon} {label}
        </div>
    );

    const KPI_CARDS = [
        { label: 'Total Assigned', value: stats.total_assigned || 0, icon: <ShoppingCartOutlined />, color: '#8B5A2B' },
        { label: 'Pending Calls', value: stats.pending_calls || 0, icon: <PhoneOutlined />, color: '#faad14' },
        { label: 'Confirmed', value: stats.confirmed || 0, icon: <CheckCircleOutlined />, color: '#52c41a' },
        { label: 'Fake', value: stats.fake || 0, icon: <WarningOutlined />, color: '#fa541c' },
        ...(stats.courier_counts || []).map((c: any) => ({
            label: c.status || c.courier_status || 'Unknown', value: c.count, icon: <SendOutlined />, color: '#1890ff'
        })).slice(0, 3)
    ];

    const COMM_CARDS = [
        { label: 'Commission Paid', value: formatAmount(commissions.commission_paid), color: '#52c41a' },
        { label: 'Commission Owed', value: formatAmount(commissions.commission_owed), color: '#8B5A2B' },
        { label: 'Pending Deductions', value: formatAmount(commissions.pending_deductions), color: '#ff4d4f' },
    ];

    const columns = [
        {
            title: 'ORDER', dataIndex: 'order_number', key: 'order_number', width: 100,
            render: (v: string) => <Text strong style={{ fontSize: 12 }}>{v}</Text>,
        },
        {
            title: 'CUSTOMER', key: 'customer', width: 170,
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>
                        {r.customer_name}
                        {r.customer_order_count > 1 && (
                            <Tag color="blue" style={{ marginLeft: 4, fontSize: 10, padding: '0 4px', borderRadius: 4 }}>
                                📦{r.customer_order_count}
                            </Tag>
                        )}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{r.customer_city}</div>
                </div>
            ),
        },
        {
            title: 'PHONE', key: 'phone', width: 140,
            render: (_: any, r: any) => {
                const formatted = formatPhone(r.customer_phone);
                return (
                    <Space size={4}>
                        <Text style={{ fontSize: 12 }}>{formatted}</Text>
                        <Tooltip title="WhatsApp">
                            <Button
                                type="text" size="small"
                                onClick={(e) => { e.stopPropagation(); window.open(getWhatsAppLink(r.customer_phone), '_blank'); }}
                                style={{ padding: '0 2px', height: 18, color: '#25D366' }}
                            >
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                            </Button>
                        </Tooltip>
                        <Tooltip title="Copy phone">
                            <Button
                                type="text" size="small" icon={<CopyOutlined />}
                                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(formatted); message.success('Copied!'); }}
                                style={{ padding: '0 2px', height: 18 }}
                            />
                        </Tooltip>
                    </Space>
                );
            },
        },
        {
            title: 'PRODUCT', key: 'product', width: 180,
            render: (_: any, r: any) => (
                <Text style={{ fontSize: 12 }}>
                    {(r.items || []).map((i: any) => {
                        const name = i.productName || 'Unknown';
                        const variant = i.variantInfo || [i.size, i.color].filter(Boolean).join(' / ');
                        return variant ? `${name} (${variant})` : name;
                    }).join(', ') || '—'}
                </Text>
            ),
        },
        {
            title: 'AMOUNT', key: 'amount', width: 100,
            render: (_: any, r: any) => <Text strong style={{ fontSize: 12, color: '#8B5A2B' }}>{formatAmount(r.final_amount)}</Text>,
        },
        {
            title: 'STATUS', key: 'status', width: 110,
            render: (_: any, r: any) => {
                if (r.courier_status) {
                    return <Tag color="#1890ff" style={{ borderRadius: 4, border: 'none', fontSize: 11 }}>🚚 {r.courier_status}</Tag>;
                }

                const isReportedDueToday = r.confirmation_status === 'reported' && r.callback_scheduled_at &&
                    dayjs(r.callback_scheduled_at).format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD');
                return (
                    <Tag
                        color={confirmationColors[r.confirmation_status] || 'default'}
                        style={{
                            borderRadius: 4, border: 'none', fontSize: 11,
                            ...(isReportedDueToday ? {
                                animation: 'reportedGlow 1.5s ease-in-out infinite',
                                boxShadow: '0 0 8px rgba(24,144,255,0.6)',
                            } : {}),
                        }}
                    >
                        {r.confirmation_status?.replace(/_/g, ' ')}
                        {isReportedDueToday && ' 🔔'}
                    </Tag>
                );
            },
        },
        {
            title: 'ACTIONS', key: 'actions', width: 100, align: 'center' as const,
            render: (_: any, r: any) => (
                <Button
                    type="primary" size="small"
                    icon={<PhoneOutlined />}
                    onClick={(e) => { e.stopPropagation(); handleCallClick(r); }}
                    style={{ background: '#52c41a', borderColor: '#52c41a', fontSize: 11 }}
                >
                    Call
                </Button>
            ),
        },
    ];

    const makeTabItems = (statuses: typeof CONFIRMATION_STATUSES) => statuses.map(tab => ({
        key: tab.key,
        label: (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {tab.label}
                {tabCounts[tab.key] > 0 && (
                    <Badge count={tabCounts[tab.key]} size="small" color={tab.color} />
                )}
            </span>
        ),
    }));

    const confirmationTabItems = makeTabItems(CONFIRMATION_STATUSES);
    
    const dynamicShippingStatuses = (tabCounts.courierCounts || []).map((c: any) => {
        const statusName = c.status || c.courier_status || 'Unknown';
        return {
            key: `coliix_${statusName}`,
            label: `🚚 ${statusName}`,
            color: '#1890ff',
            count: parseInt(c.count)
        };
    });

    const shippingTabItems = dynamicShippingStatuses.map((tab: any) => ({
        key: tab.key,
        label: (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {tab.label}
                {tab.count > 0 && (
                    <Badge count={tab.count} size="small" color={tab.color} />
                )}
            </span>
        ),
    }));

    const confirmationTotalCount = CONFIRMATION_STATUSES.reduce((sum, s) => sum + (tabCounts[s.key] || 0), 0);
    const shippingTotalCount = dynamicShippingStatuses.reduce((sum: number, s: any) => sum + s.count, 0);

    const handleSectionChange = (key: string | string[]) => {
        setActiveSection(key);
        // Auto-switch to first tab of newly opened section
        if (key === 'shipping' || (Array.isArray(key) && key.includes('shipping'))) {
            if (!dynamicShippingStatuses.some((s: any) => s.key === activeTab)) {
                setActiveTab(dynamicShippingStatuses[0]?.key || 'coliix_Nouveau Colis');
            }
        } else if (key === 'confirmation' || (Array.isArray(key) && key.includes('confirmation'))) {
            if (!CONFIRMATION_STATUSES.some(s => s.key === activeTab)) {
                setActiveTab('pending');
            }
        }
    };

    return (
        <div style={{ padding: '16px 20px' }}>
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>📞 Call Centre</Title>
                <Button icon={<ReloadOutlined />} onClick={() => { fetchQueue(); fetchStats(); fetchCommissions(); }}>Refresh</Button>
            </div>

            {/* KPI Cards — 5 in one line */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {KPI_CARDS.slice(0, 5).map((c, i) => (
                    <div key={i} style={{
                        flex: 1, padding: '10px 12px', borderRadius: 8,
                        background: 'var(--bg-elevated)', border: `1px solid ${THEME.border}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ color: c.color, fontSize: 14 }}>{c.icon}</span>
                            <span style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</span>
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.3 }}>{c.label}</div>
                    </div>
                ))}
            </div>

            {/* Commission Cards — separate row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {KPI_CARDS.slice(5).map((c, i) => (
                    <div key={`k${i}`} style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        background: 'var(--bg-elevated)', border: `1px solid ${THEME.border}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ color: c.color, fontSize: 14 }}>{c.icon}</span>
                            <span style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</span>
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase' }}>{c.label}</div>
                    </div>
                ))}
                <div style={{ borderLeft: `1px solid ${THEME.border}`, margin: '4px 0' }} />
                {COMM_CARDS.map((c, i) => (
                    <div key={`c${i}`} style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(139, 90, 43, 0.08)', border: `1px solid rgba(139,90,43,0.15)`,
                        borderLeft: `3px solid ${c.color}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                            <DollarOutlined style={{ color: c.color, fontSize: 12 }} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: c.color }}>{c.value}</span>
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase' }}>{c.label}</div>
                    </div>
                ))}
            </div>

            {/* Queue Card */}
            <Card styles={{ body: { padding: 0 } }}>
                {/* Filter bar */}
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
                    <Row gutter={[8, 8]} align="middle">
                        <Col xs={24} sm={10} md={8}>
                            <Input.Search placeholder="Search order, customer, phone..." allowClear size="small"
                                onSearch={(v) => setSearch(v)} />
                        </Col>
                        <Col xs={24} sm={14} md={10}>
                            <RangePicker size="small" style={{ width: '100%' }}
                                onChange={(dates) => setDateRange([
                                    dates?.[0]?.format('YYYY-MM-DD') || '',
                                    dates?.[1]?.format('YYYY-MM-DD') || '',
                                ])} />
                        </Col>
                    </Row>
                </div>

                {/* Section Toggle — Confirmation / Shipping side by side */}
                <div style={{ display: 'flex', gap: 0, padding: '10px 14px 0', borderBottom: `1px solid ${THEME.border}` }}>
                    <div
                        onClick={() => handleSectionChange('confirmation')}
                        style={{
                            padding: '8px 20px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: 13,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            color: activeSection === 'confirmation' ? THEME.accent : THEME.textSec,
                            borderBottom: activeSection === 'confirmation' ? `2px solid ${THEME.accent}` : '2px solid transparent',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <CheckCircleOutlined /> Confirmation
                        {confirmationTotalCount > 0 && (
                            <Badge count={confirmationTotalCount} size="small" style={{ backgroundColor: activeSection === 'confirmation' ? '#8B5A2B' : '#999' }} />
                        )}
                    </div>
                    <div
                        onClick={() => handleSectionChange('shipping')}
                        style={{
                            padding: '8px 20px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: 13,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            color: activeSection === 'shipping' ? '#1890ff' : THEME.textSec,
                            borderBottom: activeSection === 'shipping' ? '2px solid #1890ff' : '2px solid transparent',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <TruckOutlined /> Shipping
                        {shippingTotalCount > 0 && (
                            <Badge count={shippingTotalCount} size="small" style={{ backgroundColor: activeSection === 'shipping' ? '#1890ff' : '#999' }} />
                        )}
                    </div>
                </div>

                {/* Sub-tabs for active section */}
                <Tabs
                    activeKey={activeTab}
                    onChange={(k) => { setActiveTab(k); setFailedDeliveryCourierFilter(null); }}
                    items={activeSection === 'shipping' ? shippingTabItems : confirmationTabItems}
                    size="small"
                    style={{ padding: '0 14px' }}
                />

                {/* Failed Delivery — courier status breakdown chips */}
                {activeTab === 'failed_delivery' && failedDeliveryBreakdown.length > 0 && (
                    <div style={{ padding: '4px 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <Tag
                            color={!failedDeliveryCourierFilter ? '#fa541c' : 'default'}
                            style={{ cursor: 'pointer', borderRadius: 12, fontSize: 11, fontWeight: !failedDeliveryCourierFilter ? 600 : 400 }}
                            onClick={() => setFailedDeliveryCourierFilter(null)}
                        >
                            All ({tabCounts.failed_delivery || 0})
                        </Tag>
                        {failedDeliveryBreakdown.map((b: any) => (
                            <Tag
                                key={b.courier_status}
                                color={failedDeliveryCourierFilter === b.courier_status ? '#fa541c' : 'default'}
                                style={{ cursor: 'pointer', borderRadius: 12, fontSize: 11, fontWeight: failedDeliveryCourierFilter === b.courier_status ? 600 : 400 }}
                                onClick={() => setFailedDeliveryCourierFilter(
                                    failedDeliveryCourierFilter === b.courier_status ? null : b.courier_status
                                )}
                            >
                                {b.courier_status} ({b.count})
                            </Tag>
                        ))}
                    </div>
                )}

                <Table
                    columns={columns}
                    dataSource={activeTab === 'failed_delivery' && failedDeliveryCourierFilter
                        ? queue.filter((r: any) => r.courier_status === failedDeliveryCourierFilter)
                        : queue
                    }
                    rowKey="id"
                    loading={loading}
                    size="small"
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    style={{ padding: '0 0 8px' }}
                />
            </Card>

            {/* ═══ CONFIRMATION POPUP MODAL ═══ */}
            <Modal
                title={null}
                open={confirmModalOpen}
                onCancel={() => setConfirmModalOpen(false)}
                footer={null}
                width={560}
                destroyOnClose
                centered
                styles={{
                    content: { padding: 0, background: THEME.bg, border: `1px solid ${THEME.border}` },
                    header: { display: 'none' },
                }}
            >
                {selectedOrder && (
                    <div style={{ padding: '14px 16px' }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${THEME.border}`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <PhoneOutlined style={{ color: THEME.success, fontSize: 16 }} />
                                <span style={{ fontWeight: 700, fontSize: 14, color: THEME.text }}>
                                    {selectedOrder.order_number}
                                </span>
                                <Tag color="gold" style={{ fontSize: 10, marginLeft: 4 }}>
                                    {selectedOrder.confirmation_status}
                                </Tag>
                            </div>
                            <Text style={{ fontSize: 11, color: THEME.textSec }}>
                                {dayjs(selectedOrder.created_at).format('DD/MM/YYYY HH:mm')}
                            </Text>
                        </div>

                        {/* ── CUSTOMER + QR (Editable) ── */}
                        <div style={sectionStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    {sectionTitle('👤', 'Customer')}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', fontSize: 11 }}>
                                        <div>
                                            <div style={{ color: THEME.textSec, fontSize: 9, marginBottom: 1 }}>Name</div>
                                            <Input size="small" value={custName} onChange={(e) => setCustName(e.target.value)}
                                                style={{ fontSize: 11, background: 'transparent', border: `1px solid ${THEME.border}` }} />
                                        </div>
                                        <div>
                                            <div style={{ color: THEME.textSec, fontSize: 9, marginBottom: 1 }}>Phone</div>
                                            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                                <Input size="small" value={custPhone}
                                                    onChange={(e) => setCustPhone(formatPhone(e.target.value))}
                                                    status={custPhone && !isValidMoroccanPhone(custPhone) ? 'error' : undefined}
                                                    style={{
                                                        fontSize: 11, background: 'transparent', flex: 1,
                                                        border: `1px solid ${custPhone && !isValidMoroccanPhone(custPhone) ? '#ff4d4f' : THEME.border}`,
                                                        color: custPhone && !isValidMoroccanPhone(custPhone) ? '#ff4d4f' : undefined,
                                                    }} />
                                                <Tooltip title="WhatsApp">
                                                    <Button type="text" size="small"
                                                        onClick={() => window.open(getWhatsAppLink(custPhone), '_blank')}
                                                        style={{ padding: 0, height: 24, width: 24, color: '#25D366' }}>
                                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                                    </Button>
                                                </Tooltip>
                                                <Button type="text" size="small" icon={<CopyOutlined />}
                                                    onClick={() => { navigator.clipboard.writeText(custPhone); message.success('Copied!'); }}
                                                    style={{ padding: 0, height: 24, width: 24, color: THEME.accentLight }} />
                                            </div>
                                            {custPhone && !isValidMoroccanPhone(custPhone) && (
                                                <div style={{ fontSize: 9, color: '#ff4d4f', marginTop: 1 }}>
                                                    ⚠️ Invalid phone — must start with 05, 06, or 07
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div style={{ color: THEME.textSec, fontSize: 9, marginBottom: 1 }}>City</div>
                                            <Select
                                                size="small"
                                                showSearch
                                                value={custCity || undefined}
                                                placeholder="Select city"
                                                onChange={(v) => {
                                                    setCustCity(v);
                                                    setCityWarning('');
                                                }}
                                                filterOption={(input, option) =>
                                                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                                }
                                                notFoundContent={
                                                    courierCityOptions.length === 0
                                                        ? <Text type="secondary" style={{ fontSize: 11 }}>Select a courier first</Text>
                                                        : <Text type="danger" style={{ fontSize: 11 }}>⚠️ City not found in courier list</Text>
                                                }
                                                style={{
                                                    width: '100%', fontSize: 11,
                                                    ...(cityWarning ? { borderColor: '#ff4d4f' } : {}),
                                                }}
                                                status={cityWarning ? 'error' : undefined}
                                                options={courierCityOptions}
                                            />
                                            {cityWarning && (
                                                <div style={{ fontSize: 9, color: '#ff4d4f', marginTop: 1 }}>
                                                    ⚠️ {cityWarning}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div style={{ color: THEME.textSec, fontSize: 9, marginBottom: 1 }}>Address</div>
                                            <Input size="small" value={custAddress} onChange={(e) => setCustAddress(e.target.value)}
                                                placeholder="Address"
                                                style={{ fontSize: 11, background: 'transparent', border: `1px solid ${THEME.border}` }} />
                                        </div>
                                    </div>
                                    {selectedOrder.customer_order_count > 1 && (
                                        <Tag color="blue" style={{ marginTop: 4, fontSize: 10 }}>📦 Repeat × {selectedOrder.customer_order_count}</Tag>
                                    )}
                                </div>
                                {/* QR Code */}
                                {custPhone && (
                                    <div style={{
                                        background: '#fff', borderRadius: 6, padding: 4,
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: 10,
                                    }}>
                                        <QRCodeSVG value={`tel:${custPhone}`} size={64} />
                                        <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>Scan to call</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── EDITABLE ITEMS ── */}
                        <div style={sectionStyle}>
                            {sectionTitle('📦', 'Items')}
                            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                                {editableItems.map((item, idx) => {
                                    const sel = itemSelections[idx] || {};
                                    const productId = sel.productId;
                                    const sizes = productId ? getSizesForProduct(productId) : [];
                                    const hasSizes = sizes.length > 0;
                                    const colors = productId ? getColorsForProduct(productId, sel.size) : [];
                                    const hasColors = colors.length > 0;
                                    const matchedVariant = productId ? findMatchingVariant(productId, sel.size, sel.color) : undefined;
                                    return (
                                        <div key={item._key || idx} style={{
                                            padding: '6px 0', borderBottom: idx < editableItems.length - 1 ? `1px solid ${THEME.border}` : 'none',
                                        }}>
                                            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                                                {/* Product select */}
                                                <Select
                                                    size="small" showSearch optionFilterProp="label"
                                                    placeholder="Product"
                                                    style={{ flex: 1, fontSize: 11 }}
                                                    options={productOptions}
                                                    value={productId || undefined}
                                                    onChange={(val: string) => handleProductSelect(idx, val)}
                                                />
                                                {/* Size select */}
                                                {hasSizes && (
                                                    <Select
                                                        size="small" placeholder="Size"
                                                        style={{ width: 70, fontSize: 11 }}
                                                        value={sel.size || undefined}
                                                        options={sizes.map((s: any) => ({ value: s, label: s }))}
                                                        onChange={(val: string) => handleSizeSelect(idx, val)}
                                                    />
                                                )}
                                                {/* Color select */}
                                                {hasColors && (
                                                    <Select
                                                        size="small" placeholder={hasSizes && !sel.size ? 'Pick size' : 'Color'}
                                                        style={{ width: 70, fontSize: 11 }}
                                                        disabled={hasSizes && !sel.size}
                                                        value={sel.color || undefined}
                                                        options={colors.map((c: any) => ({ value: c, label: c }))}
                                                        onChange={(val: string) => handleColorSelect(idx, val)}
                                                    />
                                                )}
                                                {/* Delete */}
                                                <Button type="text" size="small" danger icon={<DeleteOutlined />}
                                                    onClick={() => removeItem(idx)}
                                                    style={{ padding: 0, height: 24, width: 24 }} />
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                {/* Qty */}
                                                <div>
                                                    <div style={{ fontSize: 9, color: THEME.textSec }}>Qty</div>
                                                    <InputNumber size="small" min={1} value={item.quantity}
                                                        onChange={(v) => updateItem(idx, 'quantity', v || 1)}
                                                        style={{ width: 50, fontSize: 11 }} />
                                                </div>
                                                {/* Price */}
                                                <div>
                                                    <div style={{ fontSize: 9, color: THEME.textSec }}>Price</div>
                                                    <InputNumber size="small" min={0} value={item.unitPrice}
                                                        onChange={(v) => updateItem(idx, 'unitPrice', v || 0)}
                                                        style={{ width: 70, fontSize: 11 }} />
                                                </div>
                                                {/* Stock badge */}
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: 9, color: THEME.textSec }}>Stock</div>
                                                    {stockBadge(item.stock, item.variantId)}
                                                </div>
                                                {/* Matched variant info */}
                                                {matchedVariant && (
                                                    <div style={{
                                                        fontSize: 10, padding: '2px 6px', borderRadius: 4, marginLeft: 'auto',
                                                        background: matchedVariant.stock > 0 ? 'rgba(82,196,26,0.1)' : 'rgba(255,77,79,0.1)',
                                                        color: matchedVariant.stock > 0 ? '#52c41a' : '#ff4d4f',
                                                    }}>
                                                        ✓ {matchedVariant.price} MAD · {matchedVariant.stock} pcs
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Add item + Subtotal row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 4, borderTop: `1px solid ${THEME.border}` }}>
                                <Button type="text" size="small" icon={<PlusOutlined />}
                                    onClick={addEmptyItem}
                                    style={{ fontSize: 10, color: THEME.accentLight, padding: '0 4px', height: 20 }}>
                                    Add Item
                                </Button>
                                <Text strong style={{ fontSize: 12, color: THEME.accentLight }}>
                                    Subtotal: {formatAmount(getSubtotal())}
                                </Text>
                            </div>
                        </div>

                        {/* ── DISCOUNT + DELIVERY NOTE (side by side) ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <div style={sectionStyle}>
                                {sectionTitle('💸', 'Discount')}
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <Select value={discountType} onChange={setDiscountType} size="small" style={{ width: 80, fontSize: 10 }}>
                                        <Select.Option value="fixed">MAD</Select.Option>
                                        <Select.Option value="percentage">%</Select.Option>
                                    </Select>
                                    <InputNumber
                                        size="small" min={0}
                                        max={discountType === 'percentage' ? 100 : getSubtotal()}
                                        value={discountValue}
                                        onChange={(v) => setDiscountValue(v || 0)}
                                        style={{ width: 60, fontSize: 11 }}
                                    />
                                </div>
                                <div style={{ marginTop: 4, fontWeight: 700, fontSize: 13, color: THEME.accentLight }}>
                                    Total: {formatAmount(getTotal())}
                                </div>
                            </div>

                            <div style={sectionStyle}>
                                {sectionTitle('🚚', 'Delivery')}
                                <Select
                                    size="small" allowClear showSearch
                                    placeholder="Select delivery company"
                                    value={selectedCourier}
                                    onChange={(v) => {
                                        setSelectedCourier(v);
                                        // Build city options for dropdown
                                        const courier = couriers.find((c: any) => c.id === v);
                                        if (courier?.city_list && courier.city_list.length > 0) {
                                            const options = courier.city_list
                                                .filter((c: any) => c.city_name)
                                                .map((c: any) => ({
                                                    value: c.city_name,
                                                    label: `${c.city_name}${c.shipping_fee ? ` (${parseFloat(c.shipping_fee)} MAD)` : ''}`,
                                                }));
                                            setCourierCityOptions(options);
                                            // Validate current city
                                            const cityNames = options.map((o: any) => o.value.toLowerCase());
                                            if (custCity && !cityNames.includes(custCity.toLowerCase())) {
                                                setCityWarning(`"${custCity}" is not in ${courier.name}'s city list`);
                                            } else {
                                                setCityWarning('');
                                            }
                                        } else {
                                            setCourierCityOptions([]);
                                            setCityWarning('');
                                        }
                                    }}
                                    optionFilterProp="label"
                                    style={{ width: '100%', fontSize: 11, marginBottom: 6 }}
                                    options={couriers.map((c: any) => ({ value: c.id, label: c.name }))}
                                />
                                {cityWarning && (
                                    <Alert type="warning" showIcon
                                        message={cityWarning}
                                        style={{ fontSize: 10, padding: '4px 8px', marginBottom: 6 }}
                                    />
                                )}
                                <Input.TextArea
                                    rows={2} value={deliveryNotes}
                                    onChange={(e) => setDeliveryNotes(e.target.value)}
                                    placeholder="Delivery instructions..."
                                    style={{ fontSize: 10, background: 'transparent', border: `1px solid ${THEME.border}`, resize: 'none' }}
                                />
                            </div>
                        </div>

                        {/* ── CALL NOTES + CALLBACK (side by side) ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                            <div style={sectionStyle}>
                                {sectionTitle('📝', 'Call Notes')}
                                <Input.TextArea
                                    rows={2} value={callNotes}
                                    onChange={(e) => setCallNotes(e.target.value)}
                                    placeholder="Notes from the call..."
                                    style={{ fontSize: 10, background: 'transparent', border: `1px solid ${THEME.border}`, resize: 'none' }}
                                />
                            </div>
                            <div style={sectionStyle}>
                                {sectionTitle('📅', 'Schedule Callback')}
                                <DatePicker
                                    showTime size="small"
                                    value={callbackDate}
                                    onChange={setCallbackDate}
                                    placeholder="Callback date & time"
                                    style={{ width: '100%', fontSize: 10 }}
                                />
                                <div style={{ fontSize: 9, color: THEME.textSec, marginTop: 2 }}>
                                    Required for "Report" status
                                </div>
                            </div>
                        </div>

                        {/* ── ACTION BUTTONS — 2 rows of 3 ── */}
                        <Row gutter={[6, 6]}>
                            <Col span={8}>
                                <Button
                                    type="primary" block size="middle"
                                    icon={<CheckCircleOutlined />}
                                    loading={statusLoading === 'confirmed'}
                                    onClick={() => handleStatusChange('confirmed')}
                                    style={{ background: THEME.success, borderColor: THEME.success, fontWeight: 600, fontSize: 12 }}
                                >
                                    ✅ Confirm
                                </Button>
                            </Col>
                            <Col span={8}>
                                <Button
                                    danger block size="middle"
                                    icon={<CloseCircleOutlined />}
                                    loading={statusLoading === 'cancelled'}
                                    onClick={() => handleStatusChange('cancelled')}
                                    style={{ fontWeight: 600, fontSize: 12 }}
                                >
                                    ❌ Cancel
                                </Button>
                            </Col>
                            <Col span={8}>
                                <Button
                                    block size="middle"
                                    icon={<CalendarOutlined />}
                                    loading={statusLoading === 'reported'}
                                    onClick={() => handleStatusChange('reported')}
                                    style={{ background: THEME.blue, borderColor: THEME.blue, color: '#fff', fontWeight: 600, fontSize: 12 }}
                                >
                                    ⏰ Report
                                </Button>
                            </Col>
                            <Col span={8}>
                                <Button
                                    block size="middle"
                                    icon={<PhoneOutlined />}
                                    loading={statusLoading === 'unreachable'}
                                    onClick={() => handleStatusChange('unreachable')}
                                    style={{ fontWeight: 600, fontSize: 12, background: 'rgba(139,90,43,0.15)', borderColor: THEME.border, color: THEME.text }}
                                >
                                    📵 Unreachable
                                </Button>
                            </Col>
                            <Col span={8}>
                                <Button
                                    block size="middle" danger
                                    icon={<StopOutlined />}
                                    loading={statusLoading === 'fake'}
                                    onClick={() => handleStatusChange('fake')}
                                    style={{ fontWeight: 600, fontSize: 12 }}
                                >
                                    🚫 Fake
                                </Button>
                            </Col>
                            <Col span={8}>
                                <Button
                                    block size="middle"
                                    icon={<WarningOutlined />}
                                    loading={statusLoading === 'out_of_stock'}
                                    onClick={() => handleStatusChange('out_of_stock')}
                                    style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff', fontWeight: 600, fontSize: 12 }}
                                >
                                    📦 No Stock
                                </Button>
                            </Col>
                        </Row>

                        {/* ── CUSTOMER HISTORY (collapsible) ── */}
                        {(customerHistory.length > 0 || historyLoading) && (
                            <Collapse
                                size="small"
                                style={{ marginTop: 10, background: 'transparent', border: `1px solid ${THEME.border}` }}
                                items={[{
                                    key: 'history',
                                    label: (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <HistoryOutlined style={{ color: THEME.accent }} />
                                            <span style={{ fontWeight: 600, fontSize: 12, color: THEME.text }}>Customer History</span>
                                            <Badge count={customerHistory.length} style={{ backgroundColor: THEME.accent }} />
                                        </div>
                                    ),
                                    children: historyLoading ? (
                                        <div style={{ textAlign: 'center', padding: 12, fontSize: 11, color: THEME.textSec }}>Loading...</div>
                                    ) : (
                                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                            {customerHistory.map((h: any) => (
                                                <div key={h.id} style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '6px 8px', borderBottom: `1px solid ${THEME.border}`,
                                                    fontSize: 11,
                                                }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <Text strong style={{ fontSize: 11 }}>{h.order_number}</Text>
                                                            <Tag
                                                                color={confirmationColors[h.confirmation_status] || 'default'}
                                                                style={{ fontSize: 9, borderRadius: 4, border: 'none', margin: 0, padding: '0 4px' }}
                                                            >
                                                                {h.confirmation_status?.replace(/_/g, ' ')}
                                                            </Tag>
                                                            {h.shipping_status && h.shipping_status !== 'not_shipped' && (
                                                                <Tag color="blue" style={{ fontSize: 9, borderRadius: 4, border: 'none', margin: 0, padding: '0 4px' }}>
                                                                    {h.shipping_status?.replace(/_/g, ' ')}
                                                                </Tag>
                                                            )}
                                                        </div>
                                                        <div style={{ color: THEME.textSec, fontSize: 10, marginTop: 2 }}>
                                                            {(h.items || []).map((i: any) =>
                                                                `${i.productName || 'Unknown'}${i.variantInfo ? ` (${i.variantInfo})` : ''} ×${i.quantity}`
                                                            ).join(', ')}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', minWidth: 70 }}>
                                                        <div style={{ fontWeight: 600, color: THEME.accent, fontSize: 11 }}>
                                                            {parseFloat(h.final_amount || h.total_amount || 0).toFixed(2)} MAD
                                                        </div>
                                                        <div style={{ color: THEME.textSec, fontSize: 9 }}>
                                                            {new Date(h.created_at).toLocaleDateString('fr-FR')}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ),
                                }]}
                            />
                        )}
                    </div>
                )}
            </Modal>

            {/* ═══ DUPLICATE ALERT MODAL ═══ */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 18 }} />
                        <span>⚠️ Duplicate Order Alert</span>
                    </div>
                }
                open={duplicateModalOpen}
                onCancel={() => setDuplicateModalOpen(false)}
                footer={
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <Button onClick={handleContinueWithoutMerge}>Continue Without Merging</Button>
                        <Button type="primary" icon={<MergeCellsOutlined />} onClick={handleOpenMerge}
                            style={{ background: '#8B5A2B', borderColor: '#8B5A2B' }}>
                            🔗 Merge Orders
                        </Button>
                    </div>
                }
                width={560}
                centered
            >
                <Alert
                    type="warning"
                    message="This customer has other pending orders"
                    description={`Phone: ${formatPhone(selectedOrder?.customer_phone || '')}`}
                    showIcon
                    style={{ marginBottom: 12 }}
                />

                {duplicates.map((dup: any) => (
                    <Card key={dup.id} size="small" style={{ marginBottom: 8, border: `1px solid ${THEME.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <Text strong style={{ fontSize: 12 }}>{dup.order_number}</Text>
                            <Tag color="gold" style={{ fontSize: 10 }}>Pending</Tag>
                        </div>
                        <div style={{ fontSize: 11, marginBottom: 2 }}>
                            {(dup.items || []).map((item: any) =>
                                `${item.productName} ${item.variantInfo ? `(${item.variantInfo})` : ''} ×${item.quantity}`
                            ).join(', ')}
                        </div>
                        <Text strong style={{ color: '#8B5A2B', fontSize: 12 }}>Total: {formatAmount(dup.final_amount || dup.total_amount)}</Text>
                        <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>
                            Placed {dayjs(dup.created_at).fromNow()}
                        </div>
                    </Card>
                ))}

                <Divider style={{ margin: '10px 0' }} />
                <div style={{ fontSize: 11 }}>
                    <Text type="secondary">Current order:</Text> <Text strong>{selectedOrder?.order_number}</Text> — {formatAmount(selectedOrder?.final_amount)}
                </div>
            </Modal>

            {/* ═══ MERGE PREVIEW MODAL ═══ */}
            <Modal
                title={<span>📎 Merge Preview — Combined Items</span>}
                open={mergeModalOpen}
                onCancel={() => setMergeModalOpen(false)}
                width={600}
                centered
                footer={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong style={{ fontSize: 13, color: '#8B5A2B' }}>
                            New Total: {formatAmount(mergeItems.reduce((sum, item) => sum + (item.unitPrice || 0) * (item.quantity || 1), 0))}
                        </Text>
                        <Space>
                            <Button onClick={() => setMergeModalOpen(false)}>Cancel</Button>
                            <Button type="primary" loading={mergeLoading} onClick={handleMerge}
                                style={{ background: '#8B5A2B', borderColor: '#8B5A2B' }}>
                                Confirm Merge
                            </Button>
                        </Space>
                    </div>
                }
            >
                <Alert
                    type="info"
                    message={`Merging into ${mergePrimary?.order_number} (primary). ${mergeSecondary.length} order(s) will be marked as merged.`}
                    showIcon
                    style={{ marginBottom: 12 }}
                />
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: `2px solid ${THEME.border}`, textAlign: 'left' }}>
                            <th style={{ padding: '6px 8px' }}>Product</th>
                            <th style={{ padding: '6px 8px' }}>Variant</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center' }}>Qty</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Price</th>
                            <th style={{ padding: '6px 8px' }}>Source</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mergeItems.map((item: any, idx: number) => (
                            <tr key={idx} style={{ borderBottom: `1px solid ${THEME.border}` }}>
                                <td style={{ padding: '4px 8px' }}>{item.productName || 'Unknown'}</td>
                                <td style={{ padding: '4px 8px', opacity: 0.7 }}>{item.variantInfo || '—'}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                    <InputNumber
                                        size="small" min={1}
                                        value={item.quantity}
                                        onChange={(val) => {
                                            const newItems = [...mergeItems];
                                            newItems[idx] = { ...newItems[idx], quantity: val || 1 };
                                            setMergeItems(newItems);
                                        }}
                                        style={{ width: 50 }}
                                    />
                                </td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{formatAmount(item.unitPrice)}</td>
                                <td style={{ padding: '4px 8px' }}>
                                    <Tag color={item.sourceOrder === mergePrimary?.order_number ? 'blue' : 'default'} style={{ fontSize: 10 }}>
                                        {item.sourceOrder}
                                    </Tag>
                                </td>
                                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                    <Button
                                        type="text" size="small" danger icon={<DeleteOutlined />}
                                        onClick={() => setMergeItems(mergeItems.filter((_, i) => i !== idx))}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Modal>
        
            {/* Create Order Modal */}
            <Modal title="Create Order" open={createOpen}
                onCancel={() => { setCreateOpen(false); setItemSelections({}); form.resetFields(); }}
                footer={null} destroyOnClose width={720}
                styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}>
                <Form form={form} layout="vertical" onFinish={handleCreate}
                    initialValues={{ discountType: 'fixed', source: 'manual', items: [{ quantity: 1 }] }}>

                    {/* Customer Info */}
                    <Card size="small" style={{ marginBottom: 12 }} title="Customer">
                        <Row gutter={[12, 0]}>
                            <Col xs={24} sm={12}>
                                <Form.Item name="customerName" label="Full Name" rules={[{ required: true, message: 'Name required' }]} style={{ marginBottom: 8 }}>
                                    <Input placeholder="Customer name" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item name="customerPhone" label="Phone" rules={[{ required: true, message: 'Phone required' }]} style={{ marginBottom: 8 }}>
                                    <Input placeholder="06XXXXXXXX" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item name="customerCity" label="City" style={{ marginBottom: 8 }}>
                                    <Input placeholder="City" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item name="customerAddress" label="Address" style={{ marginBottom: 8 }}>
                                    <Input placeholder="Delivery address" />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>

                    {/* Items */}
                    <Card size="small" style={{ marginBottom: 12 }} title="Order Items">
                        <Form.List name="items">
                            {(fields, { add, remove }) => (
                                <>
                                    {fields.map(({ key, name, ...restField }) => {
                                        const sel = createItemSelections[name] || {};
                                        const productId = sel.productId;
                                        const hasSizes = productId ? productHasSizes(productId) : false;
                                        const hasColors = productId ? productHasColors(productId) : false;
                                        const sizes = productId ? getSizesForProduct(productId) : [];
                                        const colors = productId ? getColorsForProduct(productId, sel.size) : [];
                                        const matchedVariant = productId ? findMatchingVariant(productId, sel.size, sel.color) : undefined;
                                        const currentUnitPrice = watchedItems?.[name]?.unitPrice;
                                        const discountedPrice = currentUnitPrice ? getDiscountedPrice(currentUnitPrice) : null;
                                        return (
                                            <Card key={key} size="small" style={{ marginBottom: 8, position: 'relative' }}>
                                                {fields.length > 1 && (
                                                    <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                                                        style={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}
                                                        onClick={() => { remove(name); setItemSelections(prev => { const n = { ...prev }; delete n[name]; return n; }); }} />
                                                )}
                                                <Row gutter={[8, 6]}>
                                                    <Col xs={24} sm={hasSizes && hasColors ? 24 : 12}>
                                                        <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 2 }}>Product</div>
                                                        <Select placeholder="Choose product..." showSearch optionFilterProp="label"
                                                            style={{ width: '100%' }} options={productOptions}
                                                            value={productId || undefined}
                                                            onChange={(val: string) => {
                                                                setItemSelections(prev => ({ ...prev, [name]: { productId: val } }));
                                                                const items = form.getFieldValue('items');
                                                                items[name] = { ...items[name], variantId: undefined, unitPrice: undefined };
                                                                form.setFieldsValue({ items });
                                                                const variants = getVariantsForProduct(val);
                                                                if (variants.length === 1) {
                                                                    items[name].variantId = variants[0].value;
                                                                    items[name].unitPrice = variants[0].price;
                                                                    form.setFieldsValue({ items });
                                                                }
                                                            }} />
                                                    </Col>
                                                    {hasSizes && (
                                                        <Col xs={12} sm={hasColors ? 6 : 12}>
                                                            <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 2 }}>Size</div>
                                                            <Select placeholder="Size" style={{ width: '100%' }}
                                                                value={sel.size || undefined}
                                                                options={sizes.map((s: any) => ({ value: s, label: s }))}
                                                                onChange={(val: string) => {
                                                                    const newSel = { ...sel, size: val, color: undefined };
                                                                    setItemSelections(prev => ({ ...prev, [name]: newSel }));
                                                                    const match = findMatchingVariant(productId!, val, hasColors ? undefined : null);
                                                                    const items = form.getFieldValue('items');
                                                                    if (match && !hasColors) {
                                                                        items[name].variantId = match.value;
                                                                        items[name].unitPrice = match.price;
                                                                    } else {
                                                                        items[name].variantId = undefined;
                                                                        items[name].unitPrice = undefined;
                                                                    }
                                                                    form.setFieldsValue({ items });
                                                                }} />
                                                        </Col>
                                                    )}
                                                    {hasColors && (
                                                        <Col xs={12} sm={hasSizes ? 6 : 12}>
                                                            <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 2 }}>Color</div>
                                                            <Select placeholder={hasSizes && !sel.size ? 'Pick size first' : 'Color'}
                                                                style={{ width: '100%' }}
                                                                disabled={hasSizes && !sel.size}
                                                                value={sel.color || undefined}
                                                                options={colors.map((c: any) => ({ value: c, label: c }))}
                                                                onChange={(val: string) => {
                                                                    const newSel = { ...sel, color: val };
                                                                    setItemSelections(prev => ({ ...prev, [name]: newSel }));
                                                                    const match = findMatchingVariant(productId!, sel.size, val);
                                                                    const items = form.getFieldValue('items');
                                                                    if (match) {
                                                                        items[name].variantId = match.value;
                                                                        items[name].unitPrice = match.price;
                                                                    } else {
                                                                        items[name].variantId = undefined;
                                                                        items[name].unitPrice = undefined;
                                                                    }
                                                                    form.setFieldsValue({ items });
                                                                }} />
                                                        </Col>
                                                    )}
                                                    {matchedVariant && (
                                                        <Col xs={24}>
                                                            <div style={{
                                                                fontSize: 11, padding: '3px 6px', borderRadius: 4,
                                                                background: matchedVariant.stock > 0 ? 'rgba(82,196,26,0.1)' : 'rgba(255,77,79,0.1)',
                                                                color: matchedVariant.stock > 0 ? '#52c41a' : '#ff4d4f'
                                                            }}>
                                                                ✓ {matchedVariant.price} MAD · {matchedVariant.stock} pcs in stock
                                                            </div>
                                                        </Col>
                                                    )}
                                                    <Form.Item {...restField} name={[name, 'variantId']} hidden
                                                        rules={[{ required: true, message: 'Select size/color to match a variant' }]}>
                                                        <Input />
                                                    </Form.Item>
                                                    <Col xs={12} sm={8}>
                                                        <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 2 }}>Qty</div>
                                                        <Form.Item {...restField} name={[name, 'quantity']} initialValue={1} style={{ marginBottom: 0 }}>
                                                            <InputNumber min={1} style={{ width: '100%' }} />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col xs={12} sm={8}>
                                                        <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 2 }}>Unit Price</div>
                                                        <Form.Item {...restField} name={[name, 'unitPrice']}
                                                            rules={[{ required: true, message: 'Price required' }]} style={{ marginBottom: 0 }}>
                                                            <InputNumber min={0} style={{ width: '100%' }} addonAfter="MAD" />
                                                        </Form.Item>
                                                        {discountedPrice !== null && discountedPrice !== currentUnitPrice && (
                                                            <div style={{ marginTop: 3, fontSize: 11 }}>
                                                                <span style={{ textDecoration: 'line-through', opacity: 0.5, marginRight: 4 }}>
                                                                    {currentUnitPrice?.toFixed(2)} MAD
                                                                </span>
                                                                <span style={{ color: '#52c41a', fontWeight: 600 }}>
                                                                    {discountedPrice.toFixed(2)} MAD
                                                                </span>
                                                            </div>
                                                        )}
                                                    </Col>
                                                </Row>
                                            </Card>
                                        );
                                    })}
                                    <Button type="dashed" onClick={() => add({ quantity: 1 })} block icon={<PlusOutlined />} size="small">
                                        Add Another Item
                                    </Button>
                                </>
                            )}
                        </Form.List>
                    </Card>

                    {/* Pricing & Source */}
                    <Card size="small" style={{ marginBottom: 12 }} title="Pricing & Source">
                        <Row gutter={[10, 0]}>
                            <Col xs={12} sm={6}>
                                <Form.Item name="discountType" label="Discount" style={{ marginBottom: 8 }}>
                                    <Select options={[
                                        { value: 'fixed', label: 'Fixed (MAD)' },
                                        { value: 'percentage', label: '% Percent' },
                                    ]} />
                                </Form.Item>
                            </Col>
                            <Col xs={12} sm={6}>
                                <Form.Item name="discountValue" label="Amount" initialValue={0} style={{ marginBottom: 8 }}>
                                    <InputNumber min={0} style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                            <Col xs={12} sm={6}>
                                <Form.Item name="shippingCost" label="Shipping" initialValue={0} style={{ marginBottom: 8 }}>
                                    <InputNumber min={0} style={{ width: '100%' }} addonAfter="MAD" />
                                </Form.Item>
                            </Col>
                            <Col xs={12} sm={6}>
                                <Form.Item name="source" label="Source" style={{ marginBottom: 8 }}>
                                    <Select options={[
                                        { value: 'manual', label: 'Manual' },
                                        { value: 'youcan', label: 'YouCan' },
                                        { value: 'facebook', label: 'Facebook' },
                                        { value: 'instagram', label: 'Instagram' },
                                        { value: 'whatsapp', label: 'WhatsApp' },
                                        { value: 'phone', label: 'Phone' },
                                        { value: 'website', label: 'Website' },
                                        { value: 'other', label: 'Other' },
                                    ]} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Form.Item name="note" label="Call Note" style={{ marginBottom: 8 }}>
                            <Input.TextArea rows={2} placeholder="Optional call note..." />
                        </Form.Item>
                        <Form.Item name="deliveryNotes" label="Delivery Notes" style={{ marginBottom: 0 }}>
                            <Input.TextArea rows={2} placeholder="Delivery instructions..." />
                        </Form.Item>
                    </Card>

                    <div style={{ textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => { setCreateOpen(false); setItemSelections({}); form.resetFields(); }}>Cancel</Button>
                            <Button type="primary" htmlType="submit">Create Order</Button>
                        </Space>
                    </div>
                </Form>
            </Modal>

            
            <style>{`
                @keyframes reportedGlow {
                    0%, 100% { box-shadow: 0 0 4px rgba(24,144,255,0.3); }
                    50% { box-shadow: 0 0 14px rgba(24,144,255,0.8), 0 0 20px rgba(24,144,255,0.4); }
                }
            `}</style>
        </div>
    );
}
