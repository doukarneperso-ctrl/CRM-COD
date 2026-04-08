import { useState, useEffect, useMemo } from 'react';
import {
    Table, Typography, Card, Row, Col, Input, Tag, Space,
    InputNumber, Button, Modal, message, Select, Tooltip, Badge,
} from 'antd';
import {
    AppstoreOutlined, WarningOutlined, StopOutlined,
    PlusOutlined, MinusOutlined, EditOutlined, CheckOutlined, CloseOutlined,
    SearchOutlined, ReloadOutlined,
    InboxOutlined,
} from '@ant-design/icons';
import api from '../api/client';

const { Title, Text } = Typography;

interface VariantData {
    id: string;
    product_id: string;
    product_name: string;
    product_image: string | null;
    size: string | null;
    color: string | null;
    sku: string | null;
    stock: number;
    price: number;
    low_stock_threshold: number;
}
export default function StockPage() {
    const [products, setProducts] = useState<any[]>([]);
    const [searchText, setSearchText] = useState('');
    const [productFilter, setProductFilter] = useState('');

    // Inline edit state
    const [editingCell, setEditingCell] = useState<{ variantId: string; field: string } | null>(null);
    const [editValue, setEditValue] = useState<any>(null);

    // Adjustment modal
    const [adjustModal, setAdjustModal] = useState(false);
    const [adjustVariant, setAdjustVariant] = useState<VariantData | null>(null);
    const [adjustAmount, setAdjustAmount] = useState(0);

    // Alert collapse
    const [alertsCollapsed, setAlertsCollapsed] = useState(false);

    const fetchProducts = async () => {
        try {
            const params: any = { pageSize: 200 };
            if (searchText) params.search = searchText;
            if (productFilter) params.productId = productFilter;
            const res = await api.get('/products', { params });
            setProducts(res.data.data || []);
        } catch { message.error('Failed to load stock data'); }
    };

    useEffect(() => { fetchProducts(); }, [searchText, productFilter]);

    // Flatten products into variants
    const allVariants: VariantData[] = products.flatMap((p: any) =>
        (p.variants || []).map((v: any) => ({
            id: v.id,
            product_id: p.id,
            product_name: p.name,
            product_image: p.image_url || null,
            size: v.size || null,
            color: v.color || null,
            sku: v.sku || null,
            stock: parseInt(v.stock) || 0,
            price: parseFloat(v.price) || 0,
            low_stock_threshold: parseInt(v.low_stock_threshold || v.lowStockThreshold) || 5,
        }))
    );

    // KPIs
    const totalProducts = products.length;
    const totalUnits = allVariants.reduce((s, v) => s + v.stock, 0);
    const lowStockCount = allVariants.filter(v => v.stock > 0 && v.stock <= v.low_stock_threshold).length;
    const outOfStockCount = allVariants.filter(v => v.stock === 0).length;

    // Stock color coding
    const stockColor = (stock: number) => {
        if (stock === 0) return '#ff4d4f';
        if (stock <= 10) return '#faad14';
        return '#52c41a';
    };
    const stockBg = (stock: number) => {
        if (stock === 0) return 'rgba(255,77,79,0.08)';
        if (stock <= 10) return 'rgba(250,173,20,0.06)';
        return 'rgba(82,196,26,0.06)';
    };

    // Group by product for matrix display
    const productGroups = products.map(p => {
        const variants = (p.variants || []).map((v: any) => ({
            ...v,
            stock: parseInt(v.stock) || 0,
            price: parseFloat(v.price) || 0,
        }));
        const SIZE_ORDER = ['XS', 'S', 'M/S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL',
            '34', '36', '38', '40', '42', '44', '46', '48', '50'];
        const sizes = ([...new Set(variants.map((v: any) => v.size).filter(Boolean))] as string[])
            .sort((a, b) => {
                const ia = SIZE_ORDER.indexOf(a.toUpperCase());
                const ib = SIZE_ORDER.indexOf(b.toUpperCase());
                if (ia !== -1 && ib !== -1) return ia - ib;
                if (ia !== -1) return -1;
                if (ib !== -1) return 1;
                return a.localeCompare(b);
            });
        const colors = [...new Set(variants.map((v: any) => v.color).filter(Boolean))] as string[];
        const hasMatrix = sizes.length > 0 || colors.length > 0;
        return { ...p, variants, sizes, colors, hasMatrix };
    });

    // Warnings
    const { lowStockItems, outOfStockItems } = useMemo(() => {
        const lowStock: { id: string; product: string; variant: string; stock: number; threshold: number; variantData: VariantData }[] = [];
        const outOfStock: { id: string; product: string; variant: string; variantData: VariantData }[] = [];
        allVariants.forEach(v => {
            const variantLabel = [v.size, v.color].filter(Boolean).join('/') || 'Standard';
            if (v.stock === 0) {
                outOfStock.push({ id: v.id, product: v.product_name, variant: variantLabel, variantData: v });
            } else if (v.stock <= v.low_stock_threshold) {
                lowStock.push({ id: v.id, product: v.product_name, variant: variantLabel, stock: v.stock, threshold: v.low_stock_threshold, variantData: v });
            }
        });
        return { lowStockItems: lowStock, outOfStockItems: outOfStock };
    }, [products]);

    // Edit handlers
    const startEdit = (variantId: string, field: string, currentValue: any) => {
        setEditingCell({ variantId, field });
        setEditValue(currentValue);
    };

    const saveEdit = async () => {
        if (!editingCell) return;
        try {
            const payload: any = {};
            if (editingCell.field === 'stock') payload.stock = editValue;
            else if (editingCell.field === 'price') payload.price = editValue;
            else if (editingCell.field === 'sku') payload.sku = editValue;
            if (payload.stock === null || payload.stock === undefined) delete payload.stock;
            if (payload.price === null || payload.price === undefined) delete payload.price;
            if (payload.sku === null || payload.sku === undefined) payload.sku = '';
            if (Object.keys(payload).length === 0) {
                setEditingCell(null);
                return;
            }

            const variant = allVariants.find(v => v.id === editingCell.variantId);
            if (!variant) return;

            await api.put(`/products/${variant.product_id}/variants/${editingCell.variantId}`, payload);
            await fetchProducts();
            message.success('Updated');
            setEditingCell(null);
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Update failed');
        }
    };

    const cancelEdit = () => {
        setEditingCell(null);
        setEditValue(null);
    };

    // Stock adjustment
    const openAdjust = (variant: VariantData) => {
        setAdjustVariant(variant);
        setAdjustAmount(0);
        setAdjustModal(true);
    };

    const applyAdjustment = async () => {
        if (!adjustVariant || adjustAmount === 0) return;
        try {
            const newStock = Math.max(0, adjustVariant.stock + adjustAmount);
            await api.put(`/products/${adjustVariant.product_id}/variants/${adjustVariant.id}`, { stock: newStock });
            await fetchProducts();
            message.success(`Stock adjusted: ${adjustVariant.stock} → ${newStock}`);
            setAdjustModal(false);
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Adjustment failed');
        }
    };

    // Render an editable cell
    const renderEditableCell = (variantId: string, field: string, value: any, type: 'number' | 'text' = 'number') => {
        const isEditing = editingCell?.variantId === variantId && editingCell?.field === field;
        if (isEditing) {
            return (
                <Space size={4}>
                    {type === 'number' ? (
                        <InputNumber size="small" value={editValue} min={0}
                            onChange={(v) => setEditValue(v)} style={{ width: 70 }}
                            onPressEnter={saveEdit} autoFocus />
                    ) : (
                        <Input size="small" value={editValue}
                            onChange={(e) => setEditValue(e.target.value)} style={{ width: 90 }}
                            onPressEnter={saveEdit} autoFocus />
                    )}
                    <Button type="text" size="small" icon={<CheckOutlined />} onClick={saveEdit}
                        style={{ color: '#52c41a', padding: 0 }} />
                    <Button type="text" size="small" icon={<CloseOutlined />} onClick={cancelEdit}
                        style={{ color: '#ff4d4f', padding: 0 }} />
                </Space>
            );
        }
        return (
            <Tooltip title="Click to edit">
                <span onClick={() => startEdit(variantId, field, value)}
                    style={{
                        cursor: 'pointer', padding: '2px 6px', borderRadius: 4,
                        border: '1px dashed transparent', transition: 'border 0.2s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(139,90,43,0.3)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}>
                    {field === 'stock' ? (
                        <span style={{ color: stockColor(value), fontWeight: 600 }}>{value}</span>
                    ) : field === 'price' ? (
                        <span>{value} MAD</span>
                    ) : (
                        <span style={{ color: '#999', fontSize: 12 }}>{value || '—'}</span>
                    )}
                </span>
            </Tooltip>
        );
    };

    const renderMatrix = (group: any) => {
        const { variants } = group;
        // Normalize: if only sizes exist, colors = [''], and vice versa
        const rawSizes = [...new Set(variants.map((v: any) => v.size).filter(Boolean))] as string[];
        const rawColors = [...new Set(variants.map((v: any) => v.color).filter(Boolean))] as string[];

        const SIZE_ORDER = ['XS', 'S', 'M/S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL',
            '34', '36', '38', '40', '42', '44', '46', '48', '50'];

        const sizes = rawSizes.length > 0
            ? rawSizes.sort((a, b) => {
                const ia = SIZE_ORDER.indexOf(a.toUpperCase());
                const ib = SIZE_ORDER.indexOf(b.toUpperCase());
                if (ia !== -1 && ib !== -1) return ia - ib;
                if (ia !== -1) return -1;
                if (ib !== -1) return 1;
                return a.localeCompare(b);
            })
            : [''];  // no sizes — single column

        const colors = rawColors.length > 0 ? rawColors : [''];  // no colors — single row

        const getVariant = (size: string, color: string) => {
            if (size === '' && color === '') return variants[0];
            if (size === '') return variants.find((v: any) => v.color === color);
            if (color === '') return variants.find((v: any) => v.size === size);
            return variants.find((v: any) => v.size === size && v.color === color);
        };

        const showSizeHeader = rawSizes.length > 0;
        const showColorCol = rawColors.length > 0;

        return (
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr>
                            {showColorCol && (
                                <th style={{
                                    padding: '8px 12px', textAlign: 'left', color: '#8B5A2B',
                                    borderBottom: '2px solid #f0e6d9', fontWeight: 600, fontSize: 11,
                                    textTransform: 'uppercase', letterSpacing: '0.5px',
                                }}>
                                    {showSizeHeader ? 'Color / Size' : 'Color'}
                                </th>
                            )}
                            {sizes.map((s: string) => (
                                <th key={s || 'std'} style={{
                                    padding: '8px 12px', textAlign: 'center',
                                    color: '#8B5A2B', borderBottom: '2px solid #f0e6d9',
                                    fontWeight: 600, fontSize: 12,
                                }}>
                                    {s || 'Stock'}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {colors.map((c: string) => (
                            <tr key={c || 'std'} style={{ transition: 'background 0.15s' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,90,43,0.03)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                                {showColorCol && (
                                    <td style={{
                                        padding: '8px 12px', color: '#5a3e1b', fontWeight: 500,
                                        borderBottom: '1px solid #f5efe8'
                                    }}>{c || '—'}</td>
                                )}
                                {sizes.map((s: string) => {
                                    const v = getVariant(s, c);
                                    if (!v) return (
                                        <td key={s || 'std'} style={{
                                            padding: '6px 12px', textAlign: 'center',
                                            borderBottom: '1px solid #f5efe8', color: '#d9d0c4'
                                        }}>—</td>
                                    );
                                    return (
                                        <td key={s || 'std'} style={{
                                            padding: '6px 12px', textAlign: 'center',
                                            borderBottom: '1px solid #f5efe8',
                                            background: stockBg(parseInt(v.stock) || 0),
                                        }}>
                                            {renderEditableCell(v.id, 'stock', parseInt(v.stock) || 0)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const getImageUrl = (path: string) => {
        if (!path) return '';
        if (path.startsWith('http')) return path;
        const base = (api.defaults.baseURL || '').replace('/api', '');
        return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
    };

    // Flat list columns
    const flatColumns = [
        {
            title: 'Product', key: 'product', width: 180,
            render: (_: any, r: VariantData) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {r.product_image ? (
                        <img src={getImageUrl(r.product_image)} alt=""
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: '1px solid #ede0d0' }} />
                    ) : (
                        <div style={{
                            width: 32, height: 32, borderRadius: 6, background: '#faf5ee',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c4a77d', fontSize: 13
                        }}>
                            <InboxOutlined />
                        </div>
                    )}
                    <Text style={{ fontWeight: 500, fontSize: 12 }} ellipsis>{r.product_name}</Text>
                </div>
            ),
        },
        {
            title: 'Variant', key: 'variant', width: 100,
            render: (_: any, r: VariantData) => (
                <Tag style={{ background: '#faf5ee', color: '#8B5A2B', border: '1px solid #ede0d0', borderRadius: 6, fontSize: 11 }}>
                    {[r.size, r.color].filter(Boolean).join(' / ') || 'Std'}
                </Tag>
            ),
        },
        { title: 'SKU', key: 'sku', width: 100, responsive: ['md' as const], render: (_: any, r: VariantData) => renderEditableCell(r.id, 'sku', r.sku, 'text') },
        { title: 'Price', key: 'price', width: 90, render: (_: any, r: VariantData) => renderEditableCell(r.id, 'price', r.price) },
        {
            title: 'Stock', key: 'stock', width: 80,
            render: (_: any, r: VariantData) => renderEditableCell(r.id, 'stock', r.stock),
        },
        {
            title: '', key: 'actions', width: 50, fixed: 'right' as const,
            render: (_: any, r: VariantData) => (
                <Tooltip title="Adjust stock">
                    <Button type="text" size="small" icon={<EditOutlined />}
                        onClick={() => openAdjust(r)} style={{ color: '#8B5A2B' }} />
                </Tooltip>
            ),
        },
    ];

    const productNames = products.map((p: any) => ({ value: p.id, label: p.name }));
    const matrixProducts = productGroups.filter(g => g.hasMatrix);



    const flatVariants = productGroups.filter(g => !g.hasMatrix).flatMap(g =>
        g.variants.map((v: any) => ({
            ...v,
            product_name: g.name,
            product_id: g.id,
            product_image: g.image_url || null,
            stock: parseInt(v.stock) || 0,
            price: parseFloat(v.price) || 0,
        }))
    );
    const flatMid = Math.ceil(flatVariants.length / 2);
    const flatLeft = flatVariants.slice(0, flatMid);
    const flatRight = flatVariants.slice(flatMid);

    const totalAlerts = outOfStockItems.length + lowStockItems.length;

    // ─── Card style helper ───
    const cardStyle: React.CSSProperties = {
        background: '#ffffff',
        border: '1px solid #ede0d0',
        borderRadius: 10,
        boxShadow: '0 1px 3px rgba(139,90,43,0.06)',
    };

    return (
        <div style={{ padding: '16px 20px' }}>
            {/* ═══ PAGE HEADER ═══ */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <Title level={4} style={{ margin: 0, fontWeight: 600, color: '#2c1810' }}>
                        📦 Stock Management
                    </Title>
                    <Text style={{ color: '#8c7a68', fontSize: 13 }}>
                        {totalProducts} products · {allVariants.length} variants · {totalUnits.toLocaleString()} total units
                    </Text>
                </div>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={fetchProducts}>Refresh</Button>
                </Space>
            </div>

            {/* ═══ COMPACT ALERTS BAR ═══ */}
            {totalAlerts > 0 && (
                <div style={{
                    background: '#fffbf5', border: '1px solid #f0e0c8', borderRadius: 10,
                    padding: alertsCollapsed ? '10px 16px' : '12px 16px', marginBottom: 16,
                    transition: 'all 0.2s',
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer',
                    }} onClick={() => setAlertsCollapsed(!alertsCollapsed)}>
                        <Space size={16}>
                            {outOfStockItems.length > 0 && (
                                <Space size={6}>
                                    <Badge color="#ff4d4f" />
                                    <Text style={{ fontSize: 13, fontWeight: 500, color: '#cf1322' }}>
                                        {outOfStockItems.length} out of stock
                                    </Text>
                                </Space>
                            )}
                            {lowStockItems.length > 0 && (
                                <Space size={6}>
                                    <Badge color="#faad14" />
                                    <Text style={{ fontSize: 13, fontWeight: 500, color: '#d48806' }}>
                                        {lowStockItems.length} running low
                                    </Text>
                                </Space>
                            )}
                        </Space>
                        <Button type="text" size="small" style={{ color: '#8B5A2B', fontSize: 12 }}>
                            {alertsCollapsed ? 'Show details ▼' : 'Hide ▲'}
                        </Button>
                    </div>

                    {!alertsCollapsed && (
                        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {outOfStockItems.slice(0, 8).map((item) => (
                                <Tag key={item.id} color="error"
                                    style={{ borderRadius: 6, fontSize: 11, cursor: 'pointer', margin: 0 }}
                                    onClick={() => openAdjust(item.variantData)}>
                                    {item.product} — {item.variant}
                                </Tag>
                            ))}
                            {lowStockItems.slice(0, 8).map((item) => (
                                <Tag key={item.id} color="warning"
                                    style={{ borderRadius: 6, fontSize: 11, cursor: 'pointer', margin: 0 }}
                                    onClick={() => openAdjust(item.variantData)}>
                                    {item.product} — {item.variant} ({item.stock})
                                </Tag>
                            ))}
                            {totalAlerts > 16 && (
                                <Tag style={{ borderRadius: 6, fontSize: 11 }}>+{totalAlerts - 16} more</Tag>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ KPI CARDS ═══ */}
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                {[
                    { title: 'Products', value: totalProducts, icon: <AppstoreOutlined />, color: '#8B5A2B', bg: '#faf5ee' },
                    { title: 'Total Units', value: totalUnits.toLocaleString(), icon: <InboxOutlined />, color: '#1677ff', bg: '#f0f5ff' },
                    { title: 'Low Stock', value: lowStockCount, icon: <WarningOutlined />, color: '#d48806', bg: '#fffbe6' },
                    { title: 'Out of Stock', value: outOfStockCount, icon: <StopOutlined />, color: '#cf1322', bg: '#fff1f0' },
                ].map((s, i) => (
                    <Col xs={12} sm={6} key={i}>
                        <Card style={{
                            ...cardStyle,
                            borderLeft: `3px solid ${s.color}`,
                        }}
                            styles={{ body: { padding: '14px 16px' } }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ color: '#8c7a68', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{s.title}</div>
                                    <div style={{ color: '#2c1810', fontSize: 22, fontWeight: 700 }}>{s.value}</div>
                                </div>
                                <div style={{
                                    width: 38, height: 38, borderRadius: 8, background: s.bg,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: s.color, fontSize: 16,
                                }}>
                                    {s.icon}
                                </div>
                            </div>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* ═══ SEARCH & FILTER ═══ */}
            <Card style={{ ...cardStyle, marginBottom: 16 }}
                styles={{ body: { padding: '10px 14px' } }}>
                <Row gutter={[10, 8]} align="middle">
                    <Col xs={24} sm={12} md={8}>
                        <Input placeholder="Search product or SKU..." prefix={<SearchOutlined style={{ color: '#c4a77d' }} />}
                            allowClear onChange={(e) => setSearchText(e.target.value)}
                            style={{ borderColor: '#ede0d0' }} size="middle" />
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Select placeholder="Filter by product" allowClear showSearch optionFilterProp="label"
                            style={{ width: '100%' }} options={productNames} size="middle"
                            onChange={(v) => setProductFilter(v || '')} />
                    </Col>
                    <Col>
                        <Text style={{ color: '#a0917f', fontSize: 12 }}>
                            🟢 &gt;10 &nbsp; 🟡 1-10 &nbsp; 🔴 0
                        </Text>
                    </Col>
                </Row>
            </Card>

            {/* ═══ MATRIX VIEW — One product per row, large photo ═══ */}
            {matrixProducts.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Text style={{ color: '#5a3e1b', fontSize: 14, fontWeight: 600 }}>📊 Variant Matrix</Text>
                        <Text style={{ color: '#a0917f', fontSize: 12 }}>click any cell to edit</Text>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {matrixProducts.map(group => (
                            <Card key={group.id}
                                style={{ ...cardStyle, overflow: 'hidden' }}
                                styles={{ body: { padding: 0 } }}
                            >
                                <div style={{ display: 'flex', minHeight: 120 }}>
                                    {/* Large product image */}
                                    <div style={{
                                        width: 120, minWidth: 120, flexShrink: 0,
                                        background: '#faf5ee',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        borderRight: '1px solid #f0e6d9',
                                        overflow: 'hidden',
                                    }}>
                                        {group.image_url ? (
                                            <img src={getImageUrl(group.image_url)} alt=""
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                style={{
                                                    width: '100%', height: '100%',
                                                    objectFit: 'cover',
                                                }} />
                                        ) : (
                                            <InboxOutlined style={{ fontSize: 36, color: '#d4c5b0' }} />
                                        )}
                                    </div>

                                    {/* Right side: name + matrix */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* Product header */}
                                        <div style={{
                                            padding: '12px 16px 8px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            borderBottom: '1px solid #f5efe8',
                                        }}>
                                            <Text style={{
                                                fontWeight: 700, fontSize: 18, color: '#2c1810',
                                                letterSpacing: '-0.3px',
                                            }}>{group.name}</Text>
                                            <Tag style={{
                                                background: '#f0e6d9', color: '#8B5A2B',
                                                border: 'none', borderRadius: 4, fontSize: 10,
                                            }}>
                                                {group.variants.length} variants
                                            </Tag>
                                        </div>

                                        {/* Matrix table */}
                                        {renderMatrix(group)}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ FLAT LIST ═══ */}
            {flatVariants.length > 0 && (
                <div>
                    <Text style={{ color: '#5a3e1b', fontSize: 14, fontWeight: 600, marginBottom: 10, display: 'block' }}>
                        📋 Other Products
                    </Text>
                    <Row gutter={[12, 12]}>
                        <Col xs={24} lg={12}>
                            <Card style={cardStyle} styles={{ body: { padding: 0 } }}>
                                <Table
                                    dataSource={flatLeft}
                                    columns={flatColumns}
                                    rowKey="id"
                                    pagination={false}
                                    scroll={{ x: 500 }}
                                    size="small"
                                />
                            </Card>
                        </Col>
                        <Col xs={24} lg={12}>
                            <Card style={cardStyle} styles={{ body: { padding: 0 } }}>
                                <Table
                                    dataSource={flatRight}
                                    columns={flatColumns}
                                    rowKey="id"
                                    pagination={false}
                                    scroll={{ x: 500 }}
                                    size="small"
                                />
                            </Card>
                        </Col>
                    </Row>
                </div>
            )}

            {/* Stock Adjustment Modal */}
            <Modal title="Stock Adjustment" open={adjustModal}
                onCancel={() => setAdjustModal(false)}
                onOk={applyAdjustment} okText="Apply"
                okButtonProps={{ style: { background: '#8B5A2B', border: 'none' } }}>
                {adjustVariant && (
                    <div style={{ padding: '16px 0' }}>
                        <div style={{ marginBottom: 16 }}>
                            <Text style={{ fontWeight: 600, fontSize: 15, color: '#2c1810' }}>{adjustVariant.product_name}</Text>
                            <div style={{ color: '#8c7a68', fontSize: 13, marginTop: 4 }}>
                                {[adjustVariant.size, adjustVariant.color].filter(Boolean).join(' / ') || 'Standard'}
                                {adjustVariant.sku && ` — SKU: ${adjustVariant.sku}`}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: '#8c7a68', fontSize: 12 }}>Current</div>
                                <div style={{ color: '#2c1810', fontSize: 24, fontWeight: 600 }}>{adjustVariant.stock}</div>
                            </div>
                            <div style={{ fontSize: 20, color: '#c4a77d' }}>→</div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: '#8c7a68', fontSize: 12 }}>New</div>
                                <div style={{
                                    color: stockColor(Math.max(0, adjustVariant.stock + adjustAmount)),
                                    fontSize: 24, fontWeight: 600
                                }}>
                                    {Math.max(0, adjustVariant.stock + adjustAmount)}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Button icon={<MinusOutlined />} onClick={() => setAdjustAmount(a => a - 1)} />
                            <InputNumber value={adjustAmount} onChange={(v) => setAdjustAmount(v || 0)}
                                style={{ width: 100 }} />
                            <Button icon={<PlusOutlined />} onClick={() => setAdjustAmount(a => a + 1)} />
                        </div>
                    </div>
                )}
            </Modal>

            {/* Compact table styles */}
            <style>{`
                .ant-table-thead > tr > th {
                    font-size: 10px !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.5px !important;
                    padding: 6px 4px !important;
                    background: #faf8f5 !important;
                    color: #8B5A2B !important;
                    border-bottom: 2px solid #f0e6d9 !important;
                }
                .ant-table-tbody > tr > td {
                    padding: 5px 4px !important;
                    vertical-align: middle !important;
                    border-bottom: 1px solid #f5efe8 !important;
                }
                .ant-table-tbody > tr:hover > td {
                    background: rgba(139,90,43,0.03) !important;
                }
                .ant-card-head {
                    border-bottom: 1px solid #f0e6d9 !important;
                    min-height: 42px !important;
                    padding: 0 14px !important;
                }
                .ant-card-head-title {
                    padding: 10px 0 !important;
                }
            `}</style>
        </div>
    );
}

