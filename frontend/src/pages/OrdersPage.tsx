import { useState, useEffect, useMemo } from 'react';
import {
    Table, Button, Modal, Form, Input, InputNumber, Select, Space, Typography,
    Tag, Popconfirm, message, Card, Row, Col, Timeline, Divider, Alert,
    DatePicker, Tooltip, Dropdown, Checkbox, Tabs, Empty,
} from 'antd';
import type { MenuProps } from 'antd';
import {
    PlusOutlined, EyeOutlined, DeleteOutlined,
    CheckCircleOutlined, ClockCircleOutlined, PhoneOutlined,
    TruckOutlined, ShoppingCartOutlined,
    MinusCircleOutlined, DollarOutlined, EditOutlined,
    HistoryOutlined, WarningOutlined, ExclamationCircleOutlined,
    InstagramOutlined, WhatsAppOutlined, FacebookOutlined,
    GlobalOutlined, AppstoreOutlined, SettingOutlined, UserOutlined,
    LinkOutlined, SendOutlined, SwapOutlined,
} from '@ant-design/icons';
import api from '../api/client';
import { useRealtimeRefresh } from '../hooks/useSocket';
import { useAuthStore } from '../stores/authStore';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const confirmationColors: Record<string, string> = {
    pending: 'gold', confirmed: 'green', cancelled: 'red', unreachable: 'default',
    fake: 'magenta', reported: 'blue', out_of_stock: 'orange', merged_into: 'purple',
};

const shippingColors: Record<string, string> = {
    not_shipped: 'default', pickup_scheduled: 'blue', in_transit: 'gold',
    delivered: 'green', returned: 'red',
};

const paymentColors: Record<string, string> = {
    unpaid: 'red', paid: 'green',
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

// Get WhatsApp link
const getWhatsAppLink = (phone: string): string => {
    if (!phone) return '';
    let p = phone.replace(/\s+/g, '').replace(/-/g, '').replace('+', '');
    // If starts with 0, convert to 212
    if (p.startsWith('0')) p = '212' + p.slice(1);
    // If starts with 00212, remove 00
    if (p.startsWith('00212')) p = p.slice(2);
    return `https://wa.me/${p}`;
};

// Source icon mapping
const sourceConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    youcan: { color: '#22c55e', icon: <AppstoreOutlined />, label: 'YouCan' },
    instagram: { color: '#E1306C', icon: <InstagramOutlined />, label: 'Instagram' },
    whatsapp: { color: '#25D366', icon: <WhatsAppOutlined />, label: 'WhatsApp' },
    facebook: { color: '#1877F2', icon: <FacebookOutlined />, label: 'Facebook' },
    website: { color: '#1890ff', icon: <GlobalOutlined />, label: 'Website' },
    manual: { color: '#8B5A2B', icon: <EditOutlined />, label: 'Manual' },
    phone: { color: '#fa8c16', icon: <PhoneOutlined />, label: 'Phone' },
    other: { color: '#8c8c8c', icon: <GlobalOutlined />, label: 'Other' },
};

// All available column keys for toggle
const ALL_COLUMN_KEYS = [
    'order_number', 'customer', 'product', 'amount',
    'confirmation', 'shipping', 'delivery_notes', 'note', 'source',
    'delivery', 'city', 'actions',
];

const COLUMN_LABELS: Record<string, string> = {
    order_number: 'Order ID',
    customer: 'Customer',
    product: 'Product',
    amount: 'Amount',
    confirmation: 'Confirmation',
    shipping: 'Shipping',
    delivery_notes: 'Delivery Notes',
    note: 'Call Note',
    source: 'Source',
    delivery: 'Delivery',
    city: 'City',
    actions: 'Actions',
};

export default function OrdersPage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    // View modal
    const [viewModalOrder, setViewModalOrder] = useState<any>(null);
    const [viewModalOpen, setViewModalOpen] = useState(false);
    // History modal
    const [historyOrder, setHistoryOrder] = useState<any>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyActiveTab, setHistoryActiveTab] = useState('status');

    // Edit modal
    const [editOrder, setEditOrder] = useState<any>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [editForm] = Form.useForm();
    const [form] = Form.useForm();
    const [products, setProducts] = useState<any[]>([]);
    const [agents, setAgents] = useState<any[]>([]);
    const [stats, setStats] = useState<any>({});
    const [filters, setFilters] = useState({
        search: '', confirmationStatus: '', shippingStatus: '',
        dateFrom: '', dateTo: '', assignedTo: '', city: '',
    });
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('crm-order-columns');
            if (saved) return new Set(JSON.parse(saved));
        } catch { /* ignore */ }
        return new Set(ALL_COLUMN_KEYS);
    });
    const [assignAgent, setAssignAgent] = useState<string>('');
    const [assignLoading, setAssignLoading] = useState(false);
    const [relinkLoading, setRelinkLoading] = useState(false);
    const { hasPermission } = useAuthStore();

    // Order lock state
    const [lockInfo, setLockInfo] = useState<{ locked: boolean; lockedBy?: string } | null>(null);

    // Reassign state
    const [reassignModalOpen, setReassignModalOpen] = useState(false);
    const [reassignOrder, setReassignOrder] = useState<any>(null);
    const [reassignAgentId, setReassignAgentId] = useState<string | undefined>(undefined);
    const [reassignLoading, setReassignLoading] = useState(false);

    // Bulk reassign state
    const [showBulkReassignModal, setShowBulkReassignModal] = useState(false);
    const [bulkReassignAgentId, setBulkReassignAgentId] = useState<string | undefined>(undefined);
    const [bulkReassignLoading, setBulkReassignLoading] = useState(false);

    // Out-of-stock queue
    const [oosQueue, setOosQueue] = useState<any[]>([]);
    const [_oosLoading, setOosLoading] = useState(false);

    const fetchOosQueue = async () => {
        setOosLoading(true);
        try {
            const res = await api.get('/orders/out-of-stock-queue');
            setOosQueue(res.data.data || []);
        } catch { /* silently fail */ }
        setOosLoading(false);
    };

    const handleRelinkAll = async () => {
        setRelinkLoading(true);
        try {
            const res = await api.post('/orders/relink-all');
            const { linked, total } = res.data;
            if (linked > 0) {
                message.success(`🔗 ${linked}/${total} item(s) linked to products!`);
                fetchOrders();
            } else if (total === 0) {
                message.info('No unlinked items found — all orders are linked!');
            } else {
                message.warning(`${total} unlinked item(s) found but no matching products in stock`);
            }
        } catch { message.error('Failed to relink items'); }
        setRelinkLoading(false);
    };

    const [exportingId, setExportingId] = useState<string | null>(null);
    const handleExportToColiix = async (orderId: string) => {
        setExportingId(orderId);
        try {
            const res = await api.post(`/delivery/export/${orderId}`);
            message.success(`🚚 Exported! Tracking: ${res.data.data.trackingNumber}`);
            fetchOrders();
        } catch (err: any) {
            const errMsg = err?.response?.data?.error?.message || 'Export failed';
            if (err?.response?.data?.error?.code === 'ALREADY_EXPORTED') {
                message.info(`Already exported — Tracking: ${err.response.data.error.trackingNumber}`);
            } else {
                message.error(errMsg);
            }
        }
        setExportingId(null);
    };

    const handleBulkExport = async () => {
        const confirmed = orders.filter((o: any) => selectedRowKeys.includes(o.id) && o.confirmation_status === 'confirmed' && !o.tracking_number);
        if (confirmed.length === 0) {
            message.warning('No confirmed orders without tracking selected');
            return;
        }
        setExportingId('bulk');
        let exported = 0;
        for (const order of confirmed) {
            try {
                await api.post(`/delivery/export/${order.id}`);
                exported++;
            } catch { }
        }
        setExportingId(null);
        message.success(`🚚 ${exported}/${confirmed.length} order(s) exported to Coliix`);
        fetchOrders();
    };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const params: any = { pageSize: 999 };
            Object.entries(filters).forEach(([k, v]) => {
                // Shipping filter is handled client-side to support courier statuses + empty state.
                if (v && k !== 'shippingStatus') params[k] = v;
            });
            const res = await api.get('/orders', { params });
            setOrders(res.data.data);
        } catch { message.error('Failed to load orders'); }
        setLoading(false);
    };

    const fetchStats = async () => {
        try { const res = await api.get('/orders/stats/summary'); setStats(res.data.data); } catch { }
    };
    const fetchProducts = async () => {
        try { const res = await api.get('/products', { params: { pageSize: 200 } }); setProducts(res.data.data); } catch { }
    };
    const fetchAgents = async () => {
        try { const res = await api.get('/users', { params: { pageSize: 100 } }); setAgents(res.data.data || []); } catch { }
    };

    useEffect(() => { fetchOrders(); fetchStats(); fetchProducts(); fetchAgents(); fetchOosQueue(); }, []);
    useEffect(() => { fetchOrders(); }, [filters]);

    // Real-time auto-refresh via Socket.IO
    useRealtimeRefresh(() => { fetchOrders(); fetchStats(); });

    // Product select options
    const productOptions = products.map((p: any) => ({
        value: p.id,
        label: p.name,
    }));

    // Get variants for a specific product
    const getVariantsForProduct = (productId: string) => {
        const product = products.find((p: any) => p.id === productId);
        if (!product) return [];
        return (product.variants || []).map((v: any) => ({
            value: v.id,
            sizeName: v.size || null,
            colorName: v.color || null,
            price: parseFloat(v.price) || 0,
            stock: parseInt(v.stock) || 0,
        }));
    };

    const getSizesForProduct = (productId: string) => {
        const variants = getVariantsForProduct(productId);
        return [...new Set(variants.map((v: any) => v.sizeName).filter(Boolean))];
    };

    const getColorsForProduct = (productId: string, selectedSize?: string | null) => {
        const variants = getVariantsForProduct(productId);
        const filtered = selectedSize
            ? variants.filter((v: any) => v.sizeName === selectedSize)
            : variants;
        return [...new Set(filtered.map((v: any) => v.colorName).filter(Boolean))];
    };

    const findMatchingVariant = (productId: string, size?: string | null, color?: string | null) => {
        const variants = getVariantsForProduct(productId);
        return variants.find((v: any) => {
            const sizeMatch = !size ? !v.sizeName : v.sizeName === size;
            const colorMatch = !color ? !v.colorName : v.colorName === color;
            return sizeMatch && colorMatch;
        });
    };

    const productHasSizes = (productId: string) => getSizesForProduct(productId).length > 0;
    const productHasColors = (productId: string) => {
        const variants = getVariantsForProduct(productId);
        return variants.some((v: any) => v.colorName);
    };

    const [itemSelections, setItemSelections] = useState<Record<number, { productId?: string; size?: string; color?: string }>>({});
    const [editItemSelections, setEditItemSelections] = useState<Record<number, { productId?: string; size?: string; color?: string }>>({});

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
                const sel = itemSelections[idx];
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
            setItemSelections({});
            form.resetFields();
            fetchOrders();
            fetchStats();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Create failed');
        }
    };

    const updateConfirmation = async (orderId: string, status: string) => {
        // Pre-check: if confirming, warn about unlinked items
        if (status === 'confirmed') {
            const order = orders.find((o: any) => o.id === orderId) || viewModalOrder;
            const unlinkedItems = (order?.items || []).filter((i: any) => !i.variantId);
            if (unlinkedItems.length > 0) {
                Modal.confirm({
                    title: '⚠️ Items Not Linked to Stock',
                    icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
                    content: (
                        <div>
                            <p>The following items are not linked to your stock system:</p>
                            <ul style={{ paddingLeft: 20 }}>
                                {unlinkedItems.map((item: any, i: number) => (
                                    <li key={i}>
                                        <strong>{item.productName}</strong>
                                        {item.variantInfo && <span style={{ opacity: 0.6 }}> — {item.variantInfo}</span>}
                                    </li>
                                ))}
                            </ul>
                            <p style={{ fontSize: 12, opacity: 0.6 }}>Link them in the Edit view for stock tracking, or confirm without stock deduction.</p>
                        </div>
                    ),
                    okText: 'Confirm Anyway',
                    cancelText: 'Edit Order',
                    onOk: async () => {
                        try {
                            await api.put(`/orders/${orderId}/confirmation-status`, { status });
                            message.success('Status → confirmed');
                            fetchOrders(); fetchStats();
                            if (viewModalOrder?.id === orderId) openViewModal(orderId);
                        } catch (err: any) { message.error(err.response?.data?.error?.message || 'Update failed'); }
                    },
                    onCancel: () => {
                        if (viewModalOpen) { setViewModalOpen(false); setViewModalOrder(null); }
                        openEditModal(orderId);
                    },
                });
                return;
            }
        }
        try {
            await api.put(`/orders/${orderId}/confirmation-status`, { status });
            message.success(`Status → ${status}`);
            fetchOrders(); fetchStats();
            if (viewModalOrder?.id === orderId) openViewModal(orderId);
        } catch (err: any) { message.error(err.response?.data?.error?.message || 'Update failed'); }
    };

    const updateShipping = async (orderId: string, status: string) => {
        try {
            await api.put(`/orders/${orderId}/shipping-status`, { status });
            message.success(`Shipping → ${status}`);
            fetchOrders(); fetchStats();
            // Refresh view modal if open
            if (viewModalOrder?.id === orderId) openViewModal(orderId);
        } catch (err: any) { message.error(err.response?.data?.error?.message || 'Update failed'); }
    };

    const getShippingDisplay = (order: any) => {
        const courier = (order?.courier_status || '').trim();
        if (courier) {
            const k = courier.toLowerCase();
            let color = 'blue';
            if (/(deliv|livr|success|ok|done)/i.test(k)) color = 'green';
            else if (/(return|retour|refus|cancel|failed|echec)/i.test(k)) color = 'red';
            else if (/(transit|route|ship|pickup|ramass|collect)/i.test(k)) color = 'gold';
            return { key: `courier:${k}`, label: courier, color };
        }

        const status = (order?.shipping_status || '').trim();
        if (!status || status === 'not_shipped') {
            return { key: '__empty__', label: 'Not shipped', color: 'default' };
        }

        return {
            key: `sys:${status}`,
            label: status.replace(/_/g, ' '),
            color: shippingColors[status] || 'default',
        };
    };

    // View modal — shows all info, no history
    const openViewModal = async (id: string) => {
        try {
            const res = await api.get(`/orders/${id}`);
            setViewModalOrder(res.data.data);
            setViewModalOpen(true);
        } catch { message.error('Failed to load order details'); }
    };

    // History modal — shows history tabs
    const openHistoryModal = async (id: string, defaultTab = 'status') => {
        try {
            // Force a fresh Coliix history import before loading CRM history.
            try {
                await api.post(`/orders/${id}/reconcile-courier-history`);
            } catch (reconcileErr: any) {
                const apiMsg = reconcileErr?.response?.data?.error?.message;
                if (apiMsg) {
                    message.warning(`Courier sync warning: ${apiMsg}`);
                }
            }

            const res = await api.get(`/orders/${id}`);
            setHistoryOrder(res.data.data);
            setHistoryActiveTab(defaultTab);
            setHistoryOpen(true);
        } catch { message.error('Failed to load order history'); }
    };

    // Edit modal — pre-fill form with order data
    const openEditModal = async (id: string) => {
        try {
            // Check lock first
            try {
                const lockRes = await api.get(`/orders/${id}/lock`);
                if (lockRes.data.locked) {
                    setLockInfo({ locked: true, lockedBy: lockRes.data.data?.locked_by_name });
                } else {
                    setLockInfo(null);
                    // Acquire lock
                    await api.post(`/orders/${id}/lock`);
                }
            } catch (lockErr: any) {
                if (lockErr.response?.status === 409) {
                    setLockInfo({ locked: true, lockedBy: lockErr.response?.data?.error?.lockedBy });
                }
            }

            const res = await api.get(`/orders/${id}`);
            const o = res.data.data;
            setEditOrder(o);

            // Build editItemSelections by matching variantId back to product
            const selections: Record<number, { productId?: string; size?: string; color?: string }> = {};
            const formItems = (o.items || []).map((item: any, idx: number) => {
                const vid = item.variantId || item.variant_id || '';
                // Find which product owns this variant
                let foundProductId = '';
                let foundSize = '';
                let foundColor = '';
                for (const p of products) {
                    const v = (p.variants || []).find((pv: any) => pv.id === vid);
                    if (v) {
                        foundProductId = p.id;
                        foundSize = v.size || '';
                        foundColor = v.color || '';
                        break;
                    }
                }
                selections[idx] = { productId: foundProductId, size: foundSize || undefined, color: foundColor || undefined };
                return {
                    variantId: vid,
                    quantity: item.quantity || 1,
                    unitPrice: parseFloat(item.unitPrice || item.unit_price) || 0,
                };
            });
            setEditItemSelections(selections);
            editForm.setFieldsValue({
                customerName: o.customer_name,
                customerPhone: o.customer_phone,
                customerCity: o.customer_city || '',
                customerAddress: o.customer_address || '',
                note: o.note || '',
                deliveryNotes: o.delivery_notes || '',
                source: o.source || 'manual',
                shippingCost: parseFloat(o.shipping_cost) || 0,
                discount: parseFloat(o.discount) || 0,
                items: formItems,
            });
            setEditOpen(true);
        } catch { message.error('Failed to load order for editing'); }
    };

    // Release lock when closing edit modal
    const closeEditModal = () => {
        if (editOrder?.id) {
            api.delete(`/orders/${editOrder.id}/lock`).catch(() => { });
        }
        setEditOpen(false);
        setEditOrder(null);
        setLockInfo(null);
    };

    // Handle edit submit
    const handleEditSubmit = async (values: any) => {
        if (!editOrder) return;
        try {
            const editItems = (values.items || []).map((item: any, idx: number) => {
                const sel = editItemSelections[idx];
                let variantId = item.variantId;
                let productName = '';
                let variantInfo = '';
                if (sel?.productId) {
                    const product = products.find((p: any) => p.id === sel.productId);
                    productName = product?.name || '';
                    if (!variantId) {
                        const match = findMatchingVariant(sel.productId, sel.size, sel.color);
                        if (match) variantId = match.value;
                    }
                    variantInfo = [sel.size, sel.color].filter(Boolean).join(' / ');
                }
                return {
                    variantId: variantId || null,
                    productName,
                    variantInfo,
                    quantity: item.quantity || 1,
                    unitPrice: parseFloat(item.unitPrice) || 0,
                };
            });
            if (editItems.length === 0) {
                message.error('Add at least one item');
                return;
            }
            await api.put(`/orders/${editOrder.id}`, {
                customerName: values.customerName,
                customerPhone: values.customerPhone,
                customerCity: values.customerCity || undefined,
                customerAddress: values.customerAddress || undefined,
                note: values.note || undefined,
                deliveryNotes: values.deliveryNotes || undefined,
                source: values.source,
                shippingCost: parseFloat(values.shippingCost) || 0,
                discount: parseFloat(values.discount) || 0,
                items: editItems,
            });
            message.success('Order updated!');
            setEditOpen(false);
            setEditOrder(null);
            setEditItemSelections({});
            editForm.resetFields();
            fetchOrders();
        } catch (err: any) { message.error(err.response?.data?.error?.message || 'Update failed'); }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/orders/${id}`);
            message.success('Order deleted');
            fetchOrders(); fetchStats();
        } catch { message.error('Delete failed'); }
    };

    // Bulk assign selected orders to agent
    const handleBulkAssign = async () => {
        if (!assignAgent) { message.warning('Select an agent first'); return; }
        setAssignLoading(true);
        const alreadyAssigned: string[] = [];
        let assignedCount = 0;

        for (const key of selectedRowKeys) {
            const order = orders.find((o: any) => o.id === key);
            if (!order) continue;
            if (order.assigned_to_name) {
                alreadyAssigned.push(`#${order.order_number} already assigned to ${order.assigned_to_name}`);
                continue;
            }
            try {
                await api.put(`/orders/${key}/assign`, { userId: assignAgent });
                assignedCount++;
            } catch { /* skip */ }
        }

        if (assignedCount > 0) message.success(`Assigned ${assignedCount} order(s)`);
        if (alreadyAssigned.length > 0) {
            Modal.warning({
                title: 'Some orders already assigned',
                content: (
                    <div>
                        {alreadyAssigned.map((msg, i) => <div key={i} style={{ marginBottom: 4 }}>{msg}</div>)}
                    </div>
                ),
            });
        }

        setAssignLoading(false);
        setSelectedRowKeys([]);
        setAssignAgent('');
        fetchOrders();
    };

    // Bulk reassign or unassign selected orders
    const handleBulkReassign = async (agentId: string | null) => {
        if (selectedRowKeys.length === 0) {
            message.warning('Select orders first');
            return;
        }

        setBulkReassignLoading(true);
        let successCount = 0;
        const errors: string[] = [];

        for (const key of selectedRowKeys) {
            try {
                await api.post('/auth/reassign-order', {
                    orderId: key,
                    agentId: agentId,
                });
                successCount++;
            } catch (err: any) {
                const orderNumber = orders.find((o: any) => o.id === key)?.order_number || key;
                errors.push(`Order #${orderNumber}: ${err?.response?.data?.error?.message || 'Failed'}`);
            }
        }

        const action = agentId ? 'Reassigned' : 'Unassigned';
        if (successCount > 0) message.success(`${action} ${successCount} order(s)`);
        if (errors.length > 0) {
            Modal.warning({
                title: 'Some orders could not be updated',
                content: <div>{errors.map((msg, i) => <div key={i} style={{ marginBottom: 4, fontSize: 12 }}>{msg}</div>)}</div>,
            });
        }

        setBulkReassignLoading(false);
        setShowBulkReassignModal(false);
        setSelectedRowKeys([]);
        setBulkReassignAgentId(undefined);
        fetchOrders();
    };

    const formatAmount = (amount: string | number) => {
        const num = parseFloat(String(amount));
        return num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
    };

    // ─── Merged Order Grouping ────────────────────────────
    // Hide 'merged_into' orders from the main list and attach them as children to their parent order
    const displayOrders = useMemo(() => {
        const mergedMap = new Map<string, any[]>(); // parent_id -> merged child orders
        const parentIds = new Set<string>();
        const childIds = new Set<string>();

        // First pass: identify merged orders and group by parent
        orders.forEach((o: any) => {
            if (o.confirmation_status === 'merged_into' && o.merged_into_id) {
                childIds.add(o.id);
                const existing = mergedMap.get(o.merged_into_id) || [];
                existing.push(o);
                mergedMap.set(o.merged_into_id, existing);
                parentIds.add(o.merged_into_id);
            }
        });

        // Second pass: also check merged_orders field from the backend
        orders.forEach((o: any) => {
            if (o.merged_orders && o.merged_orders.length > 0) {
                parentIds.add(o.id);
                const existing = mergedMap.get(o.id) || [];
                // Add any backend-provided merged orders not already tracked
                o.merged_orders.forEach((mo: any) => {
                    if (!existing.find((e: any) => e.id === mo.id)) {
                        childIds.add(mo.id);
                        existing.push(mo);
                    }
                });
                mergedMap.set(o.id, existing);
            }
        });

        // Filter: remove child orders, attach children to parents
        return orders
            .filter((o: any) => !childIds.has(o.id))
            .map((o: any) => {
                const children = mergedMap.get(o.id);
                if (children && children.length > 0) {
                    return { ...o, _mergedChildren: children };
                }
                return o;
            });
    }, [orders]);

    const shippingFilterOptions = useMemo(() => {
        const map = new Map<string, string>();
        map.set('__empty__', 'Empty / Not shipped');
        orders.forEach((o: any) => {
            const s = getShippingDisplay(o);
            if (s.key !== '__empty__') map.set(s.key, s.label);
        });
        return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
    }, [orders]);

    const filteredDisplayOrders = useMemo(() => {
        if (!filters.shippingStatus) return displayOrders;
        return displayOrders.filter((o: any) => getShippingDisplay(o).key === filters.shippingStatus);
    }, [displayOrders, filters.shippingStatus]);

    // Column toggle dropdown items
    const columnToggleItems: MenuProps['items'] = ALL_COLUMN_KEYS.map(key => ({
        key,
        label: (
            <Checkbox
                checked={visibleColumns.has(key)}
                onChange={(e) => {
                    const next = new Set(visibleColumns);
                    if (e.target.checked) next.add(key);
                    else next.delete(key);
                    setVisibleColumns(next);
                    localStorage.setItem('crm-order-columns', JSON.stringify([...next]));
                }}
            >
                {COLUMN_LABELS[key]}
            </Checkbox>
        ),
    }));

    const allColumns = [
        {
            title: 'OR.ID', dataIndex: 'order_number', key: 'order_number', width: 92, fixed: 'left' as const,
            render: (v: string, r: any) => {
                // Show short ID: "ORD-26-00195" → "#00195"
                const shortId = v ? '#' + v.replace(/^ORD-\d+-/, '') : v;
                const dateTime = r.created_at
                    ? new Date(r.created_at).toLocaleString('en-GB', {
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                    })
                    : '-';
                return (
                    <div>
                        <div style={{ fontSize: 9, opacity: 0.65, marginBottom: 2, whiteSpace: 'nowrap' }}>{dateTime}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Tooltip title={v}>
                                <Text strong style={{ fontSize: 10, letterSpacing: '-0.3px', cursor: 'default' }}>{shortId}</Text>
                            </Tooltip>
                            {r._mergedChildren && r._mergedChildren.length > 0 && (
                                <Tag color="purple" style={{
                                    fontSize: 8, borderRadius: 10, padding: '0 3px',
                                    margin: 0, lineHeight: '14px', cursor: 'pointer',
                                    fontWeight: 600,
                                }}>
                                    +{r._mergedChildren.length}
                                </Tag>
                            )}
                        </div>
                        {r.assigned_to_name && (
                            <div style={{
                                fontSize: 9, marginTop: 1, lineHeight: 1,
                                display: 'inline-block',
                                padding: '1px 5px',
                                borderRadius: 8,
                                background: 'linear-gradient(135deg, rgba(24,144,255,0.08), rgba(24,144,255,0.15))',
                                color: '#1890ff',
                                fontWeight: 500,
                            }}>
                                {r.assigned_to_name.split(' ')[0]}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'CUSTOMER', key: 'customer', width: 120, ellipsis: true,
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{r.customer_name}</div>
                    <div style={{ fontSize: 11, opacity: 0.6, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <PhoneOutlined style={{ fontSize: 10 }} />{formatPhone(r.customer_phone)}
                        {r.customer_phone && (
                            <a href={getWhatsAppLink(r.customer_phone)}
                                target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ color: '#25D366', fontSize: 12, lineHeight: 1, marginLeft: 2 }}>
                                <WhatsAppOutlined />
                            </a>
                        )}
                    </div>
                    {r.customer_address && (
                        <div style={{ fontSize: 10, opacity: 0.5 }}>@ {r.customer_address}</div>
                    )}
                </div>
            ),
        },
        {
            title: 'PRODUCT', key: 'product', width: 140, ellipsis: false,
            render: (_: any, r: any) => {
                const items = (r.items || []).filter((i: any) => i.productName);
                if (items.length === 0) return <Text style={{ fontSize: 12, opacity: 0.4 }}>—</Text>;
                return (
                    <div>
                        {items.map((item: any, idx: number) => {
                            const isUnlinked = !item.variantId;
                            const stockNum = parseInt(item.stock);
                            const isOutOfStock = !isUnlinked && (isNaN(stockNum) || stockNum <= 0);
                            const variantLabel = item.variantInfo || [item.size, item.color].filter(Boolean).join(' / ');
                            return (
                                <div key={idx} style={{ marginBottom: idx < items.length - 1 ? 6 : 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3 }}>{item.productName}</div>
                                    {variantLabel && (
                                        <div style={{ fontSize: 10, opacity: 0.55, lineHeight: 1.2 }}>
                                            {variantLabel} × {item.quantity}
                                        </div>
                                    )}
                                    {!variantLabel && (
                                        <div style={{ fontSize: 10, opacity: 0.55, lineHeight: 1.2 }}>× {item.quantity}</div>
                                    )}
                                    {isUnlinked && (
                                        <div style={{ fontSize: 10, color: '#faad14', lineHeight: 1.2 }}>
                                            <WarningOutlined style={{ marginRight: 2 }} />Not in stock system
                                        </div>
                                    )}
                                    {isOutOfStock && (
                                        <div style={{ fontSize: 10, color: '#ff4d4f', lineHeight: 1.2 }}>
                                            <WarningOutlined style={{ marginRight: 2 }} />Out of stock
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            },
        },
        {
            title: 'AMT', key: 'amount', width: 72,
            render: (_: any, r: any) => <Text strong style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{formatAmount(r.final_amount)}</Text>,
        },
        {
            title: 'CONF.', key: 'confirmation', width: 88,
            render: (_: any, r: any) => (
                <Tag color={confirmationColors[r.confirmation_status] || 'default'}
                    style={{ borderRadius: 4, border: 'none', textTransform: 'capitalize' as const, fontSize: 11, margin: 0 }}>
                    {r.confirmation_status?.replace(/_/g, ' ')}
                </Tag>
            ),
        },
        {
            title: 'SHIPPING', key: 'shipping', width: 125,
            render: (_: any, r: any) => {
                const shipping = getShippingDisplay(r);
                return (
                    <Tag
                        color={shipping.color}
                        style={{
                            borderRadius: 4,
                            border: 'none',
                            textTransform: 'capitalize' as const,
                            fontSize: 11,
                            margin: 0,
                            maxWidth: 120,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'inline-block',
                        }}
                        title={shipping.label}
                    >
                        {shipping.label}
                    </Tag>
                );
            },
        },
        {
            title: 'D.NOTES', key: 'delivery_notes', width: 85, ellipsis: true,
            render: (_: any, r: any) => (
                <Tooltip title={r.delivery_notes}>
                    <Text style={{ fontSize: 11 }}>{r.delivery_notes || '—'}</Text>
                </Tooltip>
            ),
        },
        {
            title: 'NOTE', key: 'note', width: 85, ellipsis: true,
            render: (_: any, r: any) => (
                <Tooltip title={r.note}>
                    <Text style={{ fontSize: 11 }}>{r.note || '—'}</Text>
                </Tooltip>
            ),
        },
        {
            title: 'SRC', key: 'source', width: 42, align: 'center' as const,
            render: (_: any, r: any) => {
                const src = sourceConfig[r.source] || sourceConfig.other;
                return (
                    <Tooltip title={src.label}>
                        <span style={{ color: src.color, fontSize: 14, cursor: 'default' }}>{src.icon}</span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'DELIVERY', key: 'delivery', width: 118, align: 'center' as const,
            render: (_: any, r: any) => {
                if (r.tracking_number) {
                    return (
                        <Space size={2} direction="vertical" style={{ lineHeight: 1.2 }}>
                            <Space size={4}>
                                <Tooltip title={`Tracking: ${r.tracking_number}\nClick to track on Coliix`}>
                                    <Tag color="blue" style={{ fontSize: 9, cursor: 'pointer', margin: 0, padding: '0 4px' }}
                                        onClick={() => window.open(`https://my.coliix.com/tracking/${r.tracking_number}`, '_blank')}>
                                        🚚 {r.tracking_number.slice(-8)}
                                    </Tag>
                                </Tooltip>
                                {r.label_printed_at && (
                                    <Tooltip title={`Printed: ${new Date(r.label_printed_at).toLocaleString()}`}>
                                        <Tag color="green" style={{ fontSize: 9, margin: 0, padding: '0 3px' }}>✅</Tag>
                                    </Tooltip>
                                )}
                            </Space>
                            <Button type="link" size="small"
                                style={{ fontSize: 10, height: 18, padding: 0, color: r.label_printed_at ? '#52c41a' : '#1890ff' }}
                                onClick={async () => {
                                    // Open Coliix dashboard — "Bons de livraison" page where labels can be printed
                                    window.open('https://my.coliix.com/aga/seller/bons-de-livraison', '_blank');
                                    // Mark label as printed in CRM
                                    try {
                                        await api.post(`/delivery/mark-printed/${r.id}`);
                                        fetchOrders();
                                    } catch { /* ignore */ }
                                }}>
                                🖨️ {r.label_printed_at ? 'Reprint' : 'Print Label'}
                            </Button>
                        </Space>
                    );
                }
                if (r.confirmation_status === 'confirmed') {
                    return (
                        <Tooltip title="Export to Coliix">
                            <Button type="primary" size="small" ghost
                                icon={<SendOutlined />}
                                loading={exportingId === r.id}
                                onClick={() => handleExportToColiix(r.id)}
                                style={{ fontSize: 10, height: 22, padding: '0 6px' }}>
                                Export
                            </Button>
                        </Tooltip>
                    );
                }
                return <TruckOutlined style={{ fontSize: 14, opacity: 0.3 }} />;
            },
        },
        {
            title: 'CITY', key: 'city', width: 68, ellipsis: true,
            render: (_: any, r: any) => <Text style={{ fontSize: 11 }}>{r.customer_city || '—'}</Text>,
        },
        {
            title: '', key: 'actions', width: 100, fixed: 'right' as const,
            render: (_: any, r: any) => (
                <Space size={0}>
                    <Tooltip title="View">
                        <Button type="text" size="small" icon={<EyeOutlined style={{ fontSize: 12 }} />}
                            onClick={() => openViewModal(r.id)}
                            style={{ padding: '2px 4px', height: 24, width: 24 }} />
                    </Tooltip>
                    <Tooltip title="Edit">
                        <Button type="text" size="small" icon={<EditOutlined style={{ fontSize: 12 }} />}
                            onClick={() => openEditModal(r.id)}
                            style={{ padding: '2px 4px', height: 24, width: 24 }} />
                    </Tooltip>
                    <Tooltip title="History">
                        <Button type="text" size="small" icon={<HistoryOutlined style={{ fontSize: 12 }} />}
                            onClick={() => openHistoryModal(r.id, 'status')}
                            style={{ padding: '2px 4px', height: 24, width: 24 }} />
                    </Tooltip>
                    {r.assigned_to_name && (
                        <Tooltip title={`Reassign (${r.assigned_to_name})`}>
                            <Button type="text" size="small"
                                icon={<SwapOutlined style={{ fontSize: 12, color: '#1890ff' }} />}
                                onClick={() => {
                                    setReassignOrder(r);
                                    setReassignAgentId(undefined);
                                    setReassignModalOpen(true);
                                }}
                                style={{ padding: '2px 4px', height: 24, width: 24 }} />
                        </Tooltip>
                    )}
                    {hasPermission('delete_orders') && (
                        <Popconfirm title="Delete order?" onConfirm={() => handleDelete(r.id)}>
                            <Tooltip title="Delete">
                                <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                                    style={{ padding: '2px 4px', height: 24, width: 24 }} />
                            </Tooltip>
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    // Filter columns based on visibility toggle
    const columns = allColumns.filter(c => visibleColumns.has(c.key));

    return (
        <div style={{ padding: '16px 20px' }}>
            {/* Stats row */}
            <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
                {[
                    { title: 'Today', value: stats.today_orders || 0, icon: <ShoppingCartOutlined />, color: '#8B5A2B' },
                    { title: 'Pending', value: stats.pending || 0, icon: <ClockCircleOutlined />, color: '#faad14' },
                    { title: 'Confirmed', value: stats.confirmed || 0, icon: <CheckCircleOutlined />, color: '#52c41a' },
                    { title: 'In Transit', value: stats.in_transit || 0, icon: <TruckOutlined />, color: '#1890ff' },
                    { title: 'Delivered', value: stats.delivered || 0, icon: <CheckCircleOutlined />, color: '#52c41a' },
                    { title: 'Revenue', value: `${parseFloat(stats.total_revenue || 0).toFixed(0)} MAD`, icon: <DollarOutlined />, color: '#8B5A2B' },
                ].map((s, i) => (
                    <Col xs={12} sm={8} lg={4} key={i}>
                        <Card styles={{ body: { padding: '12px 14px' } }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{s.title}</div>
                                    <div style={{ fontSize: 20, fontWeight: 700 }}>{s.value}</div>
                                </div>
                                <div style={{
                                    color: s.color, fontSize: 18, opacity: 0.7,
                                    width: 36, height: 36, borderRadius: 8,
                                    background: `${s.color}15`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>{s.icon}</div>
                            </div>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <Title level={4} style={{ margin: 0 }}>All Orders</Title>
                <Space>
                    <Button icon={<LinkOutlined />} size="small" loading={relinkLoading} onClick={handleRelinkAll}
                        style={{ borderColor: '#8B5A2B', color: '#8B5A2B' }}>
                        🔗 Relink Products
                    </Button>
                    <Dropdown menu={{ items: columnToggleItems }} trigger={['click']} placement="bottomRight">
                        <Button icon={<SettingOutlined />} size="small">Columns</Button>
                    </Dropdown>
                    {hasPermission('create_orders') && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>
                            New Order
                        </Button>
                    )}
                </Space>
            </div>

            {/* Filter bar */}
            <Card styles={{ body: { padding: '10px 14px' } }} style={{ marginBottom: 12 }}>
                <Row gutter={[8, 8]} align="middle">
                    <Col xs={24} sm={12} md={6}>
                        <Input.Search placeholder="Search..." onSearch={(v: string) => setFilters(f => ({ ...f, search: v }))}
                            allowClear size="small" />
                    </Col>
                    <Col xs={12} sm={12} md={4}>
                        <Select placeholder="Confirmation" allowClear style={{ width: '100%' }} size="small" getPopupContainer={() => document.body}
                            onChange={(v: string) => setFilters(f => ({ ...f, confirmationStatus: v || '' }))}
                            options={['pending', 'confirmed', 'cancelled', 'unreachable', 'fake', 'reported', 'out_of_stock'].map(s => ({ value: s, label: s.replace(/_/g, ' ') }))} />
                    </Col>
                    <Col xs={12} sm={12} md={3}>
                        <Select placeholder="Shipping" allowClear style={{ width: '100%' }} size="small" getPopupContainer={() => document.body}
                            onChange={(v: string) => setFilters(f => ({ ...f, shippingStatus: v || '' }))}
                            options={shippingFilterOptions} />
                    </Col>
                    <Col xs={12} sm={12} md={4}>
                        <Select placeholder="Agent" allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} size="small" getPopupContainer={() => document.body}
                            onChange={(v: string) => setFilters(f => ({ ...f, assignedTo: v || '' }))}
                            options={agents.map((a: any) => ({ value: a.id, label: a.full_name }))} />
                    </Col>
                    <Col xs={12} sm={12} md={3}>
                        <Input placeholder="City" allowClear size="small"
                            onChange={(e) => setFilters(f => ({ ...f, city: e.target.value }))} />
                    </Col>
                    <Col xs={24} sm={24} md={4}>
                        <RangePicker size="small" style={{ width: '100%' }}
                            onChange={(dates) => {
                                setFilters(f => ({
                                    ...f,
                                    dateFrom: dates?.[0]?.format('YYYY-MM-DD') || '',
                                    dateTo: dates?.[1]?.format('YYYY-MM-DD') || '',
                                }));
                            }} />
                    </Col>
                </Row>
            </Card>

            {/* Bulk assign bar */}
            {selectedRowKeys.length > 0 && (
                <Card styles={{ body: { padding: '8px 14px' } }} style={{ marginBottom: 12 }}>
                    <Space wrap>
                        <Text style={{ fontSize: 12 }}>{selectedRowKeys.length} selected</Text>
                        <Select
                            placeholder="Assign to agent..."
                            size="small"
                            style={{ width: 200 }}
                            showSearch
                            optionFilterProp="label"
                            value={assignAgent || undefined}
                            onChange={(v: string) => setAssignAgent(v)}
                            options={agents.map((a: any) => ({ value: a.id, label: a.full_name }))}
                        />
                        <Button type="primary" size="small" icon={<UserOutlined />}
                            loading={assignLoading} onClick={handleBulkAssign}>
                            Assign
                        </Button>
                        <Button type="primary" ghost size="small" icon={<SwapOutlined />}
                            loading={bulkReassignLoading}
                            onClick={() => {
                                setShowBulkReassignModal(true);
                                setBulkReassignAgentId(undefined);
                            }}>
                            Bulk Reassign/Unassign
                        </Button>
                        <Divider type="vertical" />
                        <Button size="small" icon={<SendOutlined />}
                            style={{ borderColor: '#1890ff', color: '#1890ff' }}
                            loading={exportingId === 'bulk'}
                            onClick={handleBulkExport}>
                            🚚 Export to Coliix
                        </Button>
                        {orders.some((o: any) => selectedRowKeys.includes(o.id) && o.tracking_number) && (
                            <Button size="small"
                                style={{ borderColor: '#52c41a', color: '#52c41a' }}
                                onClick={() => {
                                    const trackingCodes = orders
                                        .filter((o: any) => selectedRowKeys.includes(o.id) && o.tracking_number)
                                        .map((o: any) => o.tracking_number);
                                    window.open(`https://my.coliix.com/aga/seller/labels?tracking=${trackingCodes.join(',')}`, '_blank');
                                }}>
                                🖨️ Print Labels ({orders.filter((o: any) => selectedRowKeys.includes(o.id) && o.tracking_number).length})
                            </Button>
                        )}
                        <Button size="small" onClick={() => { setSelectedRowKeys([]); setAssignAgent(''); }}>Cancel</Button>
                    </Space>
                </Card>
            )}

            {/* Out-of-Stock Queue Alert */}
            {oosQueue.length > 0 && (
                <Alert
                    type="warning" showIcon closable
                    message={`⚠️ ${oosQueue.length} order(s) are waiting for restock`}
                    description={
                        <Space wrap size={4} style={{ marginTop: 4 }}>
                            {oosQueue.slice(0, 5).map((o: any) => (
                                <Tag key={o.id} color="orange" style={{ cursor: 'pointer', fontSize: 11 }}
                                    onClick={() => openViewModal(o.id)}>
                                    #{o.order_number} — {o.customer_name}
                                </Tag>
                            ))}
                            {oosQueue.length > 5 && <Tag>+{oosQueue.length - 5} more</Tag>}
                        </Space>
                    }
                    style={{ marginBottom: 12 }}
                />
            )}

            {/* Table */}
                <Table
                    columns={columns}
                    dataSource={filteredDisplayOrders}
                rowKey="id"
                loading={loading}
                rowSelection={{
                    selectedRowKeys,
                    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
                }}
                expandable={{
                    expandedRowRender: (record: any) => {
                        if (!record._mergedChildren || record._mergedChildren.length === 0) return null;
                        return (
                            <div style={{
                                padding: '8px 12px',
                                background: 'var(--bg-hover)',
                                borderRadius: 6,
                                margin: '4px 0',
                            }}>
                                <Text strong style={{ fontSize: 11, opacity: 0.6, marginBottom: 6, display: 'block' }}>
                                    📎 Merged Orders ({record._mergedChildren.length})
                                </Text>
                                {record._mergedChildren.map((child: any, idx: number) => (
                                    <div key={child.id || idx} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '6px 10px', borderRadius: 4,
                                        background: idx % 2 === 0 ? 'var(--bg-secondary)' : 'transparent',
                                        marginBottom: 2,
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Tag color="purple" style={{ fontSize: 10, margin: 0, borderRadius: 4 }}>
                                                {child.order_number || `Merged #${idx + 1}`}
                                            </Tag>
                                            <Text style={{ fontSize: 11 }}>
                                                {child.customer_name || record.customer_name}
                                            </Text>
                                            {child.items && child.items.length > 0 && (
                                                <Text style={{ fontSize: 10, opacity: 0.5 }}>
                                                    ({child.items.map((i: any) => i.productName || i.product_name).filter(Boolean).join(', ')})
                                                </Text>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Text style={{ fontSize: 11, fontWeight: 600 }}>
                                                {formatAmount(child.final_amount || 0)}
                                            </Text>
                                            <Tag color="default" style={{ fontSize: 9, margin: 0 }}>merged</Tag>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    },
                    rowExpandable: (record: any) => record._mergedChildren && record._mergedChildren.length > 0,
                }}
                pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], showTotal: (total: number) => `${total} orders` }}
                scroll={{ x: 980 }}
                size="small"
                className="orders-table"
            />

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
                                        const sel = itemSelections[name] || {};
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

            {/* ═══ VIEW ORDER MODAL — Premium Info Only ═══ */}
            <Modal
                open={viewModalOpen}
                onCancel={() => { setViewModalOpen(false); setViewModalOrder(null); }}
                footer={null} width={520}
                title={null}
                closable
                styles={{
                    body: { padding: 0, maxHeight: '80vh', overflow: 'auto' },
                    header: { display: 'none' },
                }}
            >
                {viewModalOrder && (
                    <div style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}>
                        {/* ── Header Banner ── */}
                        <div style={{
                            background: 'linear-gradient(135deg, #8B5A2B 0%, #A0522D 50%, #CD853F 100%)',
                            padding: '20px 24px 16px',
                            color: '#fff',
                            position: 'relative',
                        }}>
                            <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Order</div>
                            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px' }}>{viewModalOrder.order_number}</div>
                            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                                {new Date(viewModalOrder.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                {' · '}
                                {new Date(viewModalOrder.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            {viewModalOrder.tracking_number && (
                                <div style={{
                                    marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
                                    background: 'rgba(255,255,255,0.18)', borderRadius: 6, padding: '3px 10px',
                                    fontSize: 11, cursor: 'pointer', backdropFilter: 'blur(4px)',
                                }}
                                    onClick={() => window.open(`https://my.coliix.com/tracking/${viewModalOrder.tracking_number}`, '_blank')}
                                >
                                    🚚 {viewModalOrder.tracking_number}
                                </div>
                            )}
                        </div>

                        {/* ── Content Body ── */}
                        <div style={{ padding: '16px 24px 20px' }}>

                            {/* ─ Customer Section with Order History ─ */}
                            {(() => {
                                const custOrders = viewModalOrder.customerOrders || [];
                                const totalOrders = custOrders.length;
                                const deliveredCount = custOrders.filter((co: any) => co.shipping_status === 'delivered').length;
                                const returnedCount = custOrders.filter((co: any) => co.shipping_status === 'returned').length;
                                const unreachableCount = custOrders.filter((co: any) => co.confirmation_status === 'unreachable').length;
                                return (
                                    <div style={{
                                        background: 'var(--bg-secondary, #faf8f5)', borderRadius: 10,
                                        padding: '14px 16px', marginBottom: 16,
                                        border: '1px solid rgba(139,90,43,0.08)',
                                    }}>
                                        {/* Header with auto-tags */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, opacity: 0.45, fontWeight: 700 }}>Customer</div>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                {deliveredCount > 0 && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                                                        background: 'rgba(82,196,26,0.12)', color: '#389e0d',
                                                    }}>✅ {deliveredCount} Delivered</span>
                                                )}
                                                {returnedCount > 0 && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                                                        background: 'rgba(250,173,20,0.12)', color: '#d48806',
                                                    }}>⚠️ {returnedCount} Returned</span>
                                                )}
                                                {totalOrders >= 3 && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                                                        background: 'rgba(255,77,79,0.1)', color: '#cf1322',
                                                    }}>🔴 {totalOrders} Orders</span>
                                                )}
                                                {unreachableCount > 0 && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                                                        background: 'rgba(255,77,79,0.08)', color: '#cf1322',
                                                    }}>🚩 {unreachableCount} No Answer</span>
                                                )}
                                                {totalOrders > 0 && totalOrders < 3 && deliveredCount === 0 && returnedCount === 0 && unreachableCount === 0 && (
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                                                        background: 'rgba(0,0,0,0.04)', color: '#999',
                                                    }}>{totalOrders} Order{totalOrders > 1 ? 's' : ''}</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Customer info grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                                            <div>
                                                <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 2 }}>Name</div>
                                                <div style={{ fontSize: 14, fontWeight: 600 }}>{viewModalOrder.customer_name}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 2 }}>Phone</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontSize: 13 }}>{viewModalOrder.customer_phone}</span>
                                                    {viewModalOrder.customer_phone && (
                                                        <a href={`https://wa.me/${viewModalOrder.customer_phone.replace(/[^0-9]/g, '')}`}
                                                            target="_blank" rel="noopener noreferrer"
                                                            style={{ color: '#25D366', fontSize: 15, lineHeight: 1 }}
                                                            onClick={(e) => e.stopPropagation()}>
                                                            <WhatsAppOutlined />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 2 }}>City</div>
                                                <div style={{ fontSize: 13 }}>{viewModalOrder.customer_city || '—'}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 2 }}>Address</div>
                                                <div style={{ fontSize: 13 }}>{viewModalOrder.customer_address || '—'}</div>
                                            </div>
                                        </div>

                                        {viewModalOrder.assigned_to_name && (
                                            <div style={{
                                                marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(139,90,43,0.08)',
                                                display: 'flex', alignItems: 'center', gap: 6,
                                            }}>
                                                <UserOutlined style={{ fontSize: 11, color: '#8B5A2B' }} />
                                                <span style={{ fontSize: 11, color: '#8B5A2B', fontWeight: 500 }}>Assigned to {viewModalOrder.assigned_to_name}</span>
                                            </div>
                                        )}

                                        {/* Customer Order History */}
                                        {custOrders.length > 0 && (
                                            <div style={{
                                                marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(139,90,43,0.08)',
                                            }}>
                                                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, opacity: 0.4, fontWeight: 700, marginBottom: 6 }}>Order History</div>
                                                <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                    {custOrders.map((co: any) => {
                                                        const isCurrent = co.id === viewModalOrder.id;
                                                        const dotColor =
                                                            co.shipping_status === 'delivered' ? '#52c41a' :
                                                            co.shipping_status === 'returned' ? '#faad14' :
                                                            co.confirmation_status === 'unreachable' ? '#ff7a45' :
                                                            co.confirmation_status === 'cancelled' ? '#ff4d4f' :
                                                            co.confirmation_status === 'confirmed' ? '#1890ff' :
                                                            '#d9d9d9';
                                                        const statusLabel =
                                                            co.shipping_status === 'delivered' ? 'Delivered' :
                                                            co.shipping_status === 'returned' ? 'Returned' :
                                                            co.confirmation_status === 'unreachable' ? 'No Answer' :
                                                            co.confirmation_status === 'cancelled' ? 'Cancelled' :
                                                            co.confirmation_status === 'confirmed' ? 'Confirmed' :
                                                            co.confirmation_status?.replace(/_/g, ' ') || 'Pending';
                                                        return (
                                                            <div key={co.id} style={{
                                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                padding: '4px 8px', borderRadius: 6,
                                                                background: isCurrent ? 'rgba(139,90,43,0.08)' : 'transparent',
                                                                border: isCurrent ? '1px solid rgba(139,90,43,0.15)' : '1px solid transparent',
                                                                fontSize: 11,
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                    <span style={{
                                                                        width: 7, height: 7, borderRadius: '50%',
                                                                        background: dotColor, display: 'inline-block',
                                                                        boxShadow: `0 0 4px ${dotColor}44`,
                                                                    }} />
                                                                    <span style={{ fontWeight: isCurrent ? 700 : 500, color: isCurrent ? '#8B5A2B' : 'inherit' }}>
                                                                        {co.order_number}
                                                                    </span>
                                                                    <span style={{ fontSize: 9, opacity: 0.5, textTransform: 'capitalize' }}>{statusLabel}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.6 }}>
                                                                    <span style={{ fontSize: 10 }}>{parseFloat(co.final_amount).toFixed(0)} MAD</span>
                                                                    <span style={{ fontSize: 9 }}>{new Date(co.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* ─ Notes Section ─ */}
                            {(viewModalOrder.note || viewModalOrder.delivery_notes) && (
                                <div style={{
                                    background: 'var(--bg-secondary, #faf8f5)', borderRadius: 10,
                                    padding: '14px 16px', marginBottom: 16,
                                    border: '1px solid rgba(139,90,43,0.08)',
                                }}>
                                    {viewModalOrder.note && (
                                        <div style={{ marginBottom: viewModalOrder.delivery_notes ? 10 : 0 }}>
                                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, opacity: 0.45, fontWeight: 700, marginBottom: 4 }}>Call Note</div>
                                            <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>{viewModalOrder.note}</div>
                                        </div>
                                    )}
                                    {viewModalOrder.delivery_notes && (
                                        <div>
                                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, opacity: 0.45, fontWeight: 700, marginBottom: 4 }}>Delivery Notes</div>
                                            <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>{viewModalOrder.delivery_notes}</div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ─ Items ─ */}
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, opacity: 0.45, fontWeight: 700, marginBottom: 10 }}>Items</div>
                                {viewModalOrder.items?.map((item: any, i: number) => {
                                    const isUnlinked = !item.variantId;
                                    const stockNum = parseInt(item.stock);
                                    const isOutOfStock = !isUnlinked && (isNaN(stockNum) || stockNum <= 0);
                                    const isLowStock = !isUnlinked && !isOutOfStock && stockNum <= 5;
                                    const variantLabel = item.variantInfo || [item.size, item.color].filter(Boolean).join(' / ');
                                    return (
                                        <div key={i} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '10px 12px', marginBottom: 6, borderRadius: 8,
                                            background: 'var(--bg-secondary, #faf8f5)',
                                            border: '1px solid rgba(139,90,43,0.06)',
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{item.productName}</span>
                                                    {isUnlinked && <Tag color="warning" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', margin: 0, borderRadius: 3 }}><WarningOutlined /> Unlinked</Tag>}
                                                    {isOutOfStock && <Tag color="error" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', margin: 0, borderRadius: 3 }}>Out of stock</Tag>}
                                                    {isLowStock && <Tag color="warning" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', margin: 0, borderRadius: 3 }}>Low: {stockNum}</Tag>}
                                                </div>
                                                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                                                    {variantLabel ? `${variantLabel}  ·  ×${item.quantity}` : `×${item.quantity}`}
                                                </div>
                                            </div>
                                            <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', marginLeft: 12, color: '#8B5A2B' }}>
                                                {parseFloat(item.totalPrice).toFixed(0)} <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.6 }}>MAD</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ─ Financial Summary ─ */}
                            <div style={{
                                background: 'var(--bg-secondary, #faf8f5)', borderRadius: 10,
                                padding: '14px 16px', marginBottom: 16,
                                border: '1px solid rgba(139,90,43,0.08)',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ fontSize: 12, opacity: 0.5 }}>Subtotal</span>
                                    <span style={{ fontSize: 12 }}>{parseFloat(viewModalOrder.total_amount).toFixed(0)} MAD</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ fontSize: 12, opacity: 0.5 }}>Shipping</span>
                                    <span style={{ fontSize: 12 }}>{parseFloat(viewModalOrder.shipping_cost).toFixed(0)} MAD</span>
                                </div>
                                {parseFloat(viewModalOrder.discount) > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ fontSize: 12, opacity: 0.5 }}>Discount</span>
                                        <span style={{ fontSize: 12, color: '#ff4d4f' }}>-{parseFloat(viewModalOrder.discount).toFixed(0)} MAD</span>
                                    </div>
                                )}
                                <div style={{ borderTop: '1px solid rgba(139,90,43,0.12)', paddingTop: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 16, fontWeight: 700 }}>Total</span>
                                    <span style={{ fontSize: 20, fontWeight: 800, color: '#8B5A2B' }}>
                                        {parseFloat(viewModalOrder.final_amount).toFixed(0)} <span style={{ fontSize: 12, fontWeight: 500 }}>MAD</span>
                                    </span>
                                </div>
                            </div>

                            {/* ─ Merged Orders ─ */}
                            {viewModalOrder.merged_orders && viewModalOrder.merged_orders.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, opacity: 0.45, fontWeight: 700, marginBottom: 10 }}>📎 Merged Orders</div>
                                    <div style={{ border: '1px solid rgba(139,90,43,0.1)', borderRadius: 8, overflow: 'hidden' }}>
                                        {viewModalOrder.merged_orders.map((mo: any, idx: number) => (
                                            <div key={idx} style={{
                                                padding: '8px 12px',
                                                borderBottom: idx < viewModalOrder.merged_orders.length - 1 ? '1px solid rgba(139,90,43,0.06)' : 'none',
                                                background: idx % 2 === 0 ? 'rgba(139,90,43,0.02)' : 'transparent',
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <Text strong style={{ color: '#8B5A2B', fontSize: 12 }}>{mo.order_number}</Text>
                                                        <Tag color="purple" style={{ fontSize: 9, margin: '0 0 0 6px', borderRadius: 4 }}>merged</Tag>
                                                    </div>
                                                    <span style={{ fontSize: 11, fontWeight: 600 }}>{parseFloat(mo.final_amount || 0).toFixed(0)} MAD</span>
                                                </div>
                                                {mo.items && mo.items.length > 0 && (
                                                    <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: '2px solid rgba(139,90,43,0.1)' }}>
                                                        {mo.items.map((item: any, ii: number) => (
                                                            <div key={ii} style={{ fontSize: 11, opacity: 0.6, padding: '2px 0' }}>
                                                                {item.productName || item.product_name || 'Product'} × {item.quantity}
                                                                {item.variantInfo && <span style={{ opacity: 0.5 }}> ({item.variantInfo})</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* ═══ HISTORY MODAL ═══ */}
            <Modal title={<span>📜 History — {historyOrder?.order_number}</span>}
                open={historyOpen}
                onCancel={() => { setHistoryOpen(false); setHistoryOrder(null); setHistoryActiveTab('status'); }}
                footer={null} width={550} styles={{ body: { minHeight: 400, maxHeight: '70vh', overflow: 'auto' } }}>
                {historyOrder && (
                    <Tabs
                        activeKey={historyActiveTab}
                        onChange={setHistoryActiveTab}
                        items={[
                            {
                                key: 'status',
                                label: 'Status History',
                                children: historyOrder.statusHistory?.length > 0 ? (
                                    <Timeline style={{ marginTop: 16 }} items={historyOrder.statusHistory.map((h: any) => ({
                                        children: (
                                            <div>
                                                <Text style={{ fontSize: 12 }}>
                                                    {h.field?.replace(/_/g, ' ')}: <Text delete type="secondary">{h.old_value || '—'}</Text> → <Text strong>{h.new_value}</Text>
                                                </Text>
                                                {h.note && (
                                                    <div style={{ fontSize: 11, color: '#8B5A2B', marginTop: 2 }}>
                                                        {h.note}
                                                    </div>
                                                )}
                                                <div style={{ fontSize: 10, opacity: 0.5 }}>
                                                    {h.changed_by_name} — {new Date(h.created_at).toLocaleString()}
                                                </div>
                                            </div>
                                        ),
                                    }))} />
                                ) : <Text style={{ opacity: 0.5 }}>No status history yet.</Text>
                            },
                            {
                                key: 'edits',
                                label: 'Edit History',
                                children: historyOrder.editHistory?.length > 0 ? (
                                    <Timeline style={{ marginTop: 16 }} items={historyOrder.editHistory.map((h: any) => {
                                        try {
                                            const oldVals = h.old_values ? (typeof h.old_values === 'string' ? JSON.parse(h.old_values) : h.old_values) : {};
                                            const newVals = h.new_values ? (typeof h.new_values === 'string' ? JSON.parse(h.new_values) : h.new_values) : {};
                                            
                                            const changes = [];
                                            for (const key in newVals) {
                                                if (oldVals[key] !== newVals[key]) {
                                                    changes.push({
                                                        field: key,
                                                        old: oldVals[key] !== undefined ? String(oldVals[key]) : '—',
                                                        new: newVals[key] !== undefined ? String(newVals[key]) : '—'
                                                    });
                                                }
                                            }
                                            return {
                                                children: (
                                                    <div>
                                                        <div style={{ fontSize: 12, marginBottom: 4 }}>
                                                            {changes.length > 0 ? changes.map((c, i) => (
                                                                <div key={i} style={{ marginBottom: 2 }}>
                                                                    <Text strong capitalize>{c.field.replace(/([A-Z])/g, ' $1').toLowerCase()}: </Text>
                                                                    <Text delete type="secondary" style={{ fontSize: 11 }}>{c.old}</Text>
                                                                    <span style={{ fontSize: 10, margin: '0 4px', opacity: 0.5 }}>→</span>
                                                                    <Text style={{ fontSize: 11, color: '#1890ff' }}>{c.new}</Text>
                                                                </div>
                                                            )) : <Text italic>Details updated</Text>}
                                                        </div>
                                                        <div style={{ fontSize: 10, opacity: 0.5 }}>
                                                            {h.changed_by_name || 'System'} — {new Date(h.created_at).toLocaleString()}
                                                        </div>
                                                    </div>
                                                ),
                                            };
                                        } catch {
                                            return { children: <div>Parse Error</div> };
                                        }
                                    })} />
                                ) : <Text style={{ opacity: 0.5 }}>No edit history yet.</Text>
                            },
                            {
                                key: 'assignments',
                                label: 'Assignment History',
                                children: historyOrder.assignmentHistory?.length > 0 ? (
                                    <Timeline style={{ marginTop: 16 }} items={historyOrder.assignmentHistory.map((h: any) => ({
                                        children: (
                                            <div>
                                                <Text style={{ fontSize: 12 }}>
                                                    Assigned to <Text strong style={{ color: '#8B5A2B' }}>{h.assigned_to_name || 'Unassigned'}</Text>
                                                    {h.assigned_by_name && <span> by {h.assigned_by_name}</span>}
                                                </Text>
                                                <div style={{ fontSize: 10, opacity: 0.5 }}>
                                                    {new Date(h.assigned_at).toLocaleString()}
                                                </div>
                                            </div>
                                        ),
                                    }))} />
                                ) : <Text style={{ opacity: 0.5 }}>No assignment history yet.</Text>
                            }
                        ]}
                    />
                )}
            </Modal>

            <Modal title={<span>✏️ Edit Order {editOrder?.order_number}</span>}
                open={editOpen}
                onCancel={closeEditModal}
                footer={null} destroyOnClose width={560}
                styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}>
                {lockInfo?.locked && (
                    <Alert
                        type="warning" showIcon
                        message={`⚠️ This order is being edited by ${lockInfo.lockedBy || 'another user'}`}
                        description="Your changes may conflict. Proceed with caution."
                        style={{ marginBottom: 12 }}
                    />
                )}
                <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
                    <Card size="small" style={{ marginBottom: 12 }} title="Customer">
                        <Row gutter={[12, 0]}>
                            <Col xs={24} sm={12}>
                                <Form.Item name="customerName" label="Full Name" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item name="customerPhone" label="Phone" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item name="customerCity" label="City" style={{ marginBottom: 8 }}>
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item name="customerAddress" label="Address" style={{ marginBottom: 8 }}>
                                    <Input />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>
                    {/* Order Items (fully editable) */}
                    <Card size="small" style={{ marginBottom: 12 }} title="Order Items">
                        <Form.List name="items">
                            {(fields, { add, remove }) => (
                                <>
                                    {fields.map(({ key, name, ...restField }) => {
                                        const eSel = editItemSelections[name] || {};
                                        const eProdId = eSel.productId;
                                        const eHasSizes = eProdId ? productHasSizes(eProdId) : false;
                                        const eHasColors = eProdId ? productHasColors(eProdId) : false;
                                        const eSizes = eProdId ? getSizesForProduct(eProdId) : [];
                                        const eColors = eProdId ? getColorsForProduct(eProdId, eSel.size) : [];
                                        const eMatchedVariant = eProdId ? findMatchingVariant(eProdId, eSel.size, eSel.color) : undefined;
                                        // Get the original YouCan item info for hint display
                                        const originalItem = editOrder?.items?.[name];
                                        const youcanHint = !eProdId && originalItem?.productName ? originalItem : null;
                                        return (
                                            <Card key={key} size="small" style={{ marginBottom: 8, position: 'relative' }}>
                                                {fields.length > 1 && (
                                                    <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                                                        style={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}
                                                        onClick={() => { remove(name); setEditItemSelections(prev => { const n = { ...prev }; delete n[name]; return n; }); }} />
                                                )}
                                                {/* YouCan product hint banner */}
                                                {youcanHint && (
                                                    <div style={{
                                                        background: 'rgba(250,173,20,0.08)', border: '1px solid rgba(250,173,20,0.3)',
                                                        borderRadius: 4, padding: '6px 10px', marginBottom: 8, fontSize: 12
                                                    }}>
                                                        <WarningOutlined style={{ color: '#faad14', marginRight: 6 }} />
                                                        <strong>YouCan product:</strong> {youcanHint.productName}
                                                        {youcanHint.variantInfo && <span style={{ opacity: 0.6 }}> — {youcanHint.variantInfo}</span>}
                                                        <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>Search and select the matching CRM product below to link it to your stock</div>
                                                    </div>
                                                )}
                                                <Form.Item {...restField} name={[name, 'variantId']} hidden>
                                                    <Input />
                                                </Form.Item>
                                                <Row gutter={[8, 6]}>
                                                    <Col xs={24} sm={eHasSizes && eHasColors ? 24 : 12}>
                                                        <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 2 }}>Product</div>
                                                        <Select placeholder="Choose product..." showSearch optionFilterProp="label"
                                                            style={{ width: '100%' }} options={productOptions}
                                                            value={eProdId || undefined}
                                                            onChange={(val: string) => {
                                                                setEditItemSelections(prev => ({ ...prev, [name]: { productId: val } }));
                                                                const items = editForm.getFieldValue('items');
                                                                items[name] = { ...items[name], variantId: undefined, unitPrice: undefined };
                                                                editForm.setFieldsValue({ items });
                                                                const variants = getVariantsForProduct(val);
                                                                if (variants.length === 1) {
                                                                    items[name].variantId = variants[0].value;
                                                                    items[name].unitPrice = variants[0].price;
                                                                    editForm.setFieldsValue({ items });
                                                                }
                                                            }} />
                                                    </Col>
                                                    {eHasSizes && (
                                                        <Col xs={12} sm={eHasColors ? 6 : 12}>
                                                            <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 2 }}>Size</div>
                                                            <Select placeholder="Size" style={{ width: '100%' }}
                                                                value={eSel.size || undefined}
                                                                options={eSizes.map((s: any) => ({ value: s, label: s }))}
                                                                onChange={(val: string) => {
                                                                    const newSel = { ...eSel, size: val, color: undefined };
                                                                    setEditItemSelections(prev => ({ ...prev, [name]: newSel }));
                                                                    const match = findMatchingVariant(eProdId!, val, eHasColors ? undefined : null);
                                                                    const items = editForm.getFieldValue('items');
                                                                    if (match && !eHasColors) {
                                                                        items[name].variantId = match.value;
                                                                        items[name].unitPrice = match.price;
                                                                    } else {
                                                                        items[name].variantId = undefined;
                                                                        items[name].unitPrice = undefined;
                                                                    }
                                                                    editForm.setFieldsValue({ items });
                                                                }} />
                                                        </Col>
                                                    )}
                                                    {eHasColors && (
                                                        <Col xs={12} sm={eHasSizes ? 6 : 12}>
                                                            <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 2 }}>Color</div>
                                                            <Select placeholder={eHasSizes && !eSel.size ? 'Pick size first' : 'Color'}
                                                                style={{ width: '100%' }}
                                                                disabled={eHasSizes && !eSel.size}
                                                                value={eSel.color || undefined}
                                                                options={eColors.map((c: any) => ({ value: c, label: c }))}
                                                                onChange={(val: string) => {
                                                                    const newSel = { ...eSel, color: val };
                                                                    setEditItemSelections(prev => ({ ...prev, [name]: newSel }));
                                                                    const match = findMatchingVariant(eProdId!, eSel.size, val);
                                                                    const items = editForm.getFieldValue('items');
                                                                    if (match) {
                                                                        items[name].variantId = match.value;
                                                                        items[name].unitPrice = match.price;
                                                                    } else {
                                                                        items[name].variantId = undefined;
                                                                        items[name].unitPrice = undefined;
                                                                    }
                                                                    editForm.setFieldsValue({ items });
                                                                }} />
                                                        </Col>
                                                    )}
                                                    {eMatchedVariant && (
                                                        <Col xs={24}>
                                                            <div style={{
                                                                fontSize: 11, padding: '3px 6px', borderRadius: 4,
                                                                background: eMatchedVariant.stock > 0 ? 'rgba(82,196,26,0.1)' : 'rgba(255,77,79,0.1)',
                                                                color: eMatchedVariant.stock > 0 ? '#52c41a' : '#ff4d4f'
                                                            }}>
                                                                ✓ {eMatchedVariant.price} MAD · {eMatchedVariant.stock} pcs in stock
                                                            </div>
                                                        </Col>
                                                    )}
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
                    <Card size="small" style={{ marginBottom: 12 }} title="Order Details">
                        <Row gutter={[12, 0]}>
                            <Col xs={12} sm={8}>
                                <Form.Item name="shippingCost" label="Shipping" style={{ marginBottom: 8 }}>
                                    <InputNumber min={0} style={{ width: '100%' }} addonAfter="MAD" />
                                </Form.Item>
                            </Col>
                            <Col xs={12} sm={8}>
                                <Form.Item name="discount" label="Discount" style={{ marginBottom: 8 }}>
                                    <InputNumber min={0} style={{ width: '100%' }} addonAfter="MAD" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={8}>
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
                            <Input.TextArea rows={2} />
                        </Form.Item>
                        <Form.Item name="deliveryNotes" label="Delivery Notes" style={{ marginBottom: 0 }}>
                            <Input.TextArea rows={2} />
                        </Form.Item>
                    </Card>
                    <div style={{ textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => { setEditOpen(false); setEditOrder(null); editForm.resetFields(); }}>Cancel</Button>
                            <Button type="primary" htmlType="submit">Save Changes</Button>
                        </Space>
                    </div>
                </Form>
            </Modal>

            {/* Premium table styles */}
            <style>{`
                /* ─── Header ─── */
                .orders-table .ant-table-thead > tr > th {
                    font-size: 9px !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.6px !important;
                    padding: 6px 4px !important;
                    font-weight: 700 !important;
                    color: var(--text-secondary) !important;
                    background: var(--bg-header) !important;
                    border-bottom: 2px solid var(--border-light) !important;
                    white-space: nowrap !important;
                    position: sticky;
                    top: 0;
                    z-index: 2;
                }
                /* ─── Body cells ─── */
                .orders-table .ant-table-tbody > tr > td {
                    padding: 4px 4px !important;
                    vertical-align: middle !important;
                    font-size: 11px !important;
                    border-bottom: 1px solid var(--border-light) !important;
                    transition: background 0.15s ease !important;
                }
                /* ─── Zebra striping ─── */
                .orders-table .ant-table-tbody > tr:nth-child(even) > td {
                    background: var(--bg-secondary, rgba(0,0,0,0.015)) !important;
                }
                /* ─── Row hover ─── */
                .orders-table .ant-table-tbody > tr:hover > td {
                    background: var(--bg-hover, rgba(139,90,43,0.04)) !important;
                }
                /* ─── Selected rows ─── */
                .orders-table .ant-table-tbody > tr.ant-table-row-selected > td {
                    background: rgba(139,90,43,0.08) !important;
                }
                /* ─── Fixed columns shadow ─── */
                .orders-table .ant-table-cell-fix-left,
                .orders-table .ant-table-cell-fix-right {
                    background: var(--bg-primary, #fff) !important;
                }
                .orders-table .ant-table-cell-fix-left-last::after {
                    box-shadow: inset 8px 0 6px -6px rgba(0,0,0,0.06) !important;
                }
                .orders-table .ant-table-cell-fix-right-first::after {
                    box-shadow: inset -8px 0 6px -6px rgba(0,0,0,0.06) !important;
                }
                /* ─── Smooth horizontal scroll ─── */
                .orders-table .ant-table-body {
                    overflow-x: auto !important;
                    -webkit-overflow-scrolling: touch !important;
                    scrollbar-width: thin !important;
                }
                .orders-table .ant-table-body::-webkit-scrollbar {
                    height: 5px;
                }
                .orders-table .ant-table-body::-webkit-scrollbar-thumb {
                    background: rgba(139,90,43,0.25);
                    border-radius: 4px;
                }
                .orders-table .ant-table-body::-webkit-scrollbar-track {
                    background: transparent;
                }
                /* ─── Pagination ─── */
                .orders-table .ant-pagination {
                    margin: 10px 0 0 !important;
                    font-size: 12px !important;
                }
                /* ─── Mobile ─── */
                @media (max-width: 768px) {
                    .orders-table .ant-table-thead > tr > th {
                        font-size: 8px !important;
                        padding: 5px 3px !important;
                        letter-spacing: 0.3px !important;
                    }
                    .orders-table .ant-table-tbody > tr > td {
                        padding: 3px 3px !important;
                        font-size: 10px !important;
                    }
                    .orders-table .ant-table-body {
                        max-height: calc(100vh - 280px) !important;
                    }
                }
                /* ─── Expand row ─── */
                .orders-table .ant-table-expanded-row > td {
                    padding: 6px 8px !important;
                    background: var(--bg-secondary, rgba(0,0,0,0.02)) !important;
                }
                /* ─── Selection checkbox ─── */
                .orders-table .ant-table-selection-column {
                    padding: 0 2px !important;
                    width: 32px !important;
                    min-width: 32px !important;
                }
            `}</style>

            {/* ── Reassign Order Modal ── */}
            <Modal
                title={<span><SwapOutlined /> Reassign Order {reassignOrder?.order_number}</span>}
                open={reassignModalOpen}
                onCancel={() => setReassignModalOpen(false)}
                footer={[
                    <Button key="unassign"
                        danger
                        loading={reassignLoading}
                        onClick={async () => {
                            setReassignLoading(true);
                            try {
                                await api.post('/auth/reassign-order', { orderId: reassignOrder?.id, agentId: null });
                                message.success('Order unassigned');
                                setReassignModalOpen(false);
                                fetchOrders();
                            } catch { message.error('Failed to unassign'); }
                            setReassignLoading(false);
                        }}
                    >
                        Unassign
                    </Button>,
                    <Button key="cancel" onClick={() => setReassignModalOpen(false)}>Cancel</Button>,
                    <Button key="reassign" type="primary"
                        loading={reassignLoading}
                        disabled={!reassignAgentId}
                        onClick={async () => {
                            setReassignLoading(true);
                            try {
                                const res = await api.post('/auth/reassign-order', { orderId: reassignOrder?.id, agentId: reassignAgentId });
                                message.success(res.data.message || 'Order reassigned');
                                setReassignModalOpen(false);
                                fetchOrders();
                            } catch { message.error('Failed to reassign'); }
                            setReassignLoading(false);
                        }}
                        style={{ background: '#8B5A2B', borderColor: '#8B5A2B' }}
                    >
                        Reassign
                    </Button>,
                ]}
                width={440}
            >
                {reassignOrder && (
                    <div>
                        <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 8, border: '1px solid var(--border-light)' }}>
                            <Text strong>{reassignOrder.customer_name}</Text>
                            <Text style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>{reassignOrder.customer_city}</Text>
                            <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>
                                Currently assigned to: <Text strong style={{ color: '#1890ff' }}>{reassignOrder.assigned_to_name || 'Nobody'}</Text>
                            </div>
                        </div>

                        <Text style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 12 }}>Select new agent:</Text>
                        <Select
                            style={{ width: '100%' }}
                            placeholder="Select agent"
                            value={reassignAgentId}
                            onChange={setReassignAgentId}
                            showSearch
                            optionFilterProp="children"
                        >
                            {agents.map((a: any) => (
                                <Select.Option key={a.id} value={a.id}>
                                    {a.full_name || a.fullName || a.username}
                                </Select.Option>
                            ))}
                        </Select>
                    </div>
                )}
            </Modal>

            {/* ── Bulk Reassign/Unassign Modal ── */}
            <Modal
                title={<span><SwapOutlined /> Bulk Reassign {selectedRowKeys.length} Orders</span>}
                open={showBulkReassignModal}
                onCancel={() => setShowBulkReassignModal(false)}
                footer={[
                    <Button key="unassign" danger loading={bulkReassignLoading}
                        onClick={() => handleBulkReassign(null)}>
                        Unassign All
                    </Button>,
                    <Button key="cancel" onClick={() => setShowBulkReassignModal(false)}>
                        Cancel
                    </Button>,
                    <Button key="reassign" type="primary" loading={bulkReassignLoading}
                        disabled={!bulkReassignAgentId}
                        onClick={() => handleBulkReassign(bulkReassignAgentId)}
                        style={{ background: '#8B5A2B', borderColor: '#8B5A2B' }}>
                        Reassign to Selected Agent
                    </Button>,
                ]}
                width={440}
            >
                {selectedRowKeys.length === 0 ? (
                    <Empty description="No orders selected" />
                ) : (
                    <>
                        <p style={{ marginBottom: 16 }}>
                            Selected: <strong>{selectedRowKeys.length} orders</strong>
                        </p>
                        <p style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
                            Assigned: {orders.filter((o: any) => selectedRowKeys.includes(o.id) && o.assigned_to_name).length} |
                            Unassigned: {orders.filter((o: any) => selectedRowKeys.includes(o.id) && !o.assigned_to_name).length}
                        </p>
                        <Text style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 12 }}>Select agent to reassign to:</Text>
                        <Select
                            placeholder="Select agent to reassign..."
                            style={{ width: '100%' }}
                            value={bulkReassignAgentId}
                            onChange={setBulkReassignAgentId}
                            showSearch
                            optionFilterProp="children"
                            options={agents.map((a: any) => ({
                                value: a.id,
                                label: a.full_name || a.fullName || a.username
                            }))}
                        />
                        <p style={{ marginTop: 16, fontSize: 12, color: '#999' }}>
                            Note: All selected orders will be unassigned first, then reassigned if an agent is chosen.
                        </p>
                    </>
                )}
            </Modal>
        </div>
    );
}
