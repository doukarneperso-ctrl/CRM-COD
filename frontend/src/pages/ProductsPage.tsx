import { useState, useEffect, useMemo } from 'react';
import {
    Table, Button, Modal, Form, Input, InputNumber, Select, Space, Typography,
    Tag, Popconfirm, message, Card, Row, Col, Divider, Switch, Badge, Image, Upload, Tooltip, Alert
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, InboxOutlined,
    ThunderboltOutlined, PictureOutlined, RedoOutlined,
    WarningOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import api from '../api/client';
import { useAuthStore } from '../stores/authStore';

const { Title, Text } = Typography;
const { Dragger } = Upload;

interface Variant {
    id?: string;
    size?: string;
    color?: string;
    sku?: string;
    price: number;
    costPrice: number;
    stock: number;
    lowStockThreshold: number;
    isActive: boolean;
    tempId?: string;
}

interface Product {
    id: string;
    name: string;
    description?: string;
    category?: string;
    sku?: string;
    image_url?: string;
    is_active: boolean;
    total_stock: number;
    variants: Variant[];
    created_at: string;
}

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editProduct, setEditProduct] = useState<Product | null>(null);
    const [form] = Form.useForm();
    const [searchText, setSearchText] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [categories, setCategories] = useState<string[]>([]);
    const { hasPermission } = useAuthStore();

    // Generator State
    const [sizeOptions, setSizeOptions] = useState<string[]>([]);
    const [colorOptions, setColorOptions] = useState<string[]>([]);
    const [variantsList, setVariantsList] = useState<Variant[]>([]);

    // Multi-image state
    const [imageUrls, setImageUrls] = useState<string[]>([]);

    // Bulk controls
    const [bulkPrice, setBulkPrice] = useState<number | null>(null);
    const [bulkCost, setBulkCost] = useState<number | null>(null);
    const [bulkStock, setBulkStock] = useState<number | null>(null);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const params: any = { search: searchText, pageSize: 200 };
            if (categoryFilter) params.category = categoryFilter;
            const res = await api.get('/products', { params });
            setProducts(res.data.data);

            // Extract unique categories for filter
            const cats = new Set<string>();
            res.data.data.forEach((p: any) => { if (p.category) cats.add(p.category); });
            setCategories(Array.from(cats));
        } catch { message.error('Failed to load products'); }
        setLoading(false);
    };

    useEffect(() => { fetchProducts(); }, [searchText, categoryFilter]);

    const generateVariants = () => {
        if (sizeOptions.length === 0 && colorOptions.length === 0) {
            if (variantsList.length > 0) return;
            setVariantsList([{
                tempId: 'default-' + Date.now(),
                size: 'Standard',
                price: 0, costPrice: 0, stock: 0, lowStockThreshold: 5, isActive: true
            }]);
            return;
        }

        const newVariants: Variant[] = [];
        const sizes = sizeOptions.length > 0 ? sizeOptions : [null];
        const colors = colorOptions.length > 0 ? colorOptions : [null];

        sizes.forEach(s => {
            colors.forEach(c => {
                const exists = variantsList.find(v => v.size === s && v.color === c);
                if (exists) {
                    newVariants.push(exists);
                } else {
                    newVariants.push({
                        tempId: `${s}-${c}-${Date.now()}`,
                        size: s || undefined,
                        color: c || undefined,
                        price: bulkPrice || 0,
                        costPrice: bulkCost || 0,
                        stock: bulkStock || 0,
                        lowStockThreshold: 5,
                        isActive: true,
                        sku: `${form.getFieldValue('sku') || 'PROD'}-${s ? s.toUpperCase() : 'STD'}${c ? '-' + c.toUpperCase() : ''}`
                    });
                }
            });
        });
        setVariantsList(newVariants);
        message.success(`Generated ${newVariants.length} variants`);
    };

    const updateVariant = (id: string, field: keyof Variant, value: any) => {
        setVariantsList(list => list.map(v => (v.tempId === id || v.id === id) ? { ...v, [field]: value } : v));
    };

    const removeVariant = (id: string) => {
        setVariantsList(list => list.filter(v => v.tempId !== id && v.id !== id));
    };

    const duplicateVariant = (id: string) => {
        const variantToDuplicate = variantsList.find(v => v.tempId === id || v.id === id);
        if (!variantToDuplicate) return;
        const newVariant: Variant = {
            ...variantToDuplicate,
            id: undefined,
            tempId: `temp-${Date.now()}`,
        };
        setVariantsList(list => [...list, newVariant]);
        message.success('Variant duplicated');
    };

    const applyBulk = () => {
        setVariantsList(list => list.map(v => ({
            ...v,
            price: bulkPrice !== null ? bulkPrice : v.price,
            costPrice: bulkCost !== null ? bulkCost : v.costPrice,
            stock: bulkStock !== null ? bulkStock : v.stock,
        })));
        message.success('Applied to all variants');
    };

    const toNumberOr = (value: any, fallback: number) => {
        const parsed = typeof value === 'string' ? Number(value) : value;
        return (typeof parsed === 'number' && Number.isFinite(parsed)) ? parsed : fallback;
    };

    const toIntOr = (value: any, fallback: number) => {
        const parsed = typeof value === 'string' ? Number(value) : value;
        if (typeof parsed === 'number' && Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
        return fallback;
    };

    const toOptionalString = (value: any) => {
        if (value === null || value === undefined) return undefined;
        const str = String(value);
        return str.length > 0 ? str : undefined;
    };

    const handleCreate = async (values: any) => {
        if (variantsList.length === 0) {
            message.error('Please add at least one variant');
            return;
        }
        try {
            const payload = {
                ...values,
                imageUrl: imageUrls[0] || undefined, // First image = thumbnail
                variants: variantsList.map(v => ({
                    size: toOptionalString(v.size),
                    color: toOptionalString(v.color),
                    sku: toOptionalString(v.sku),
                    price: toNumberOr(v.price, 0),
                    costPrice: toNumberOr(v.costPrice, 0),
                    stock: toIntOr(v.stock, 0),
                    lowStockThreshold: toIntOr(v.lowStockThreshold, 5),
                })),
            };
            await api.post('/products', payload);
            message.success('Product created');
            setModalOpen(false);
            clearForm();
            fetchProducts();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Create failed');
        }
    };

    const handleUpdate = async (values: any) => {
        if (!editProduct) return;
        try {
            // Update product fields
            const productPayload = {
                name: toOptionalString(values.name),
                description: toOptionalString(values.description),
                category: toOptionalString(values.category),
                sku: toOptionalString(values.sku),
                isActive: values.isActive,
                imageUrl: imageUrls[0] || editProduct.image_url || undefined,
            };
            await api.put(`/products/${editProduct.id}`, productPayload);

            // Handle variant changes separately
            const existingVariantIds = new Set(editProduct.variants.map((v: any) => v.id));

            for (const variant of variantsList) {
                if (variant.id && existingVariantIds.has(variant.id)) {
                    // Update existing variant
                    const variantPayload = {
                        size: toOptionalString(variant.size),
                        color: toOptionalString(variant.color),
                        sku: toOptionalString(variant.sku),
                        price: toNumberOr(variant.price, 0),
                        costPrice: toNumberOr(variant.costPrice, 0),
                        stock: toIntOr(variant.stock, 0),
                        lowStockThreshold: toIntOr(variant.lowStockThreshold, 5),
                        isActive: variant.isActive !== undefined ? variant.isActive : true,
                    };
                    await api.put(`/products/${editProduct.id}/variants/${variant.id}`, {
                        ...variantPayload,
                    });
                } else if (!variant.id || variant.id.toString().startsWith('temp-')) {
                    // Create new variant (duplicated ones with tempId or no id)
                    await api.post(`/products/${editProduct.id}/variants`, {
                        size: toOptionalString(variant.size),
                        color: toOptionalString(variant.color),
                        sku: toOptionalString(variant.sku),
                        price: toNumberOr(variant.price, 0),
                        costPrice: toNumberOr(variant.costPrice, 0),
                        stock: toIntOr(variant.stock, 0),
                        lowStockThreshold: toIntOr(variant.lowStockThreshold, 5),
                    });
                }
            }

            // Delete removed variants
            for (const variantId of existingVariantIds) {
                const stillExists = variantsList.some((v: any) => v.id === variantId);
                if (!stillExists) {
                    await api.delete(`/products/${editProduct.id}/variants/${variantId}`);
                }
            }

            await fetchProducts();
            message.success('Product updated');
            setModalOpen(false);
            setEditProduct(null);
            clearForm();
        } catch (err: any) {
            const apiError = err.response?.data?.error;
            const detail = apiError?.details?.[0];
            const detailMsg = detail?.path ? `${detail.path}: ${detail.message}` : detail?.message;
            message.error(detailMsg || apiError?.message || 'Update failed');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/products/${id}`);
            message.success('Product deleted');
            fetchProducts();
        } catch { message.error('Delete failed'); }
    };

    const clearForm = () => {
        form.resetFields();
        setVariantsList([]);
        setSizeOptions([]);
        setColorOptions([]);
        setEditProduct(null);
        setImageUrls([]);
    };

    const openEdit = (p: Product) => {
        setEditProduct(p);
        form.setFieldsValue({
            name: p.name, description: p.description,
            category: p.category, sku: p.sku, isActive: p.is_active,
        });
        setVariantsList(p.variants.map(v => ({
            ...v,
            price: toNumberOr(v.price, 0),
            costPrice: toNumberOr(v.costPrice, 0),
            stock: toIntOr(v.stock, 0),
            lowStockThreshold: toIntOr(v.lowStockThreshold, 5),
            tempId: v.id,
        })));
        setImageUrls(p.image_url ? [p.image_url] : []);
        setModalOpen(true);
    };

    const uploadProps = {
        name: 'file',
        multiple: true,
        action: `${(api.defaults.baseURL || '').replace('/api', '')}/api/upload`,
        withCredentials: true,
        showUploadList: false,
        beforeUpload: (file: any) => {
            const allowed = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowed.includes(file.type)) {
                message.error('Only JPG, PNG, WebP allowed');
                return Upload.LIST_IGNORE;
            }
            if (imageUrls.length >= 5) {
                message.error('Max 5 images');
                return Upload.LIST_IGNORE;
            }
            return true;
        },
        onChange(info: any) {
            const { status } = info.file;
            if (status === 'done') {
                const url = info.file.response?.data?.url;
                if (url) {
                    setImageUrls(prev => {
                        if (prev.length >= 5) return prev;
                        return [...prev, url];
                    });
                    message.success(`${info.file.name} uploaded`);
                } else {
                    message.error(`Upload succeeded but no URL returned`);
                }
            } else if (status === 'error') {
                const errMsg = info.file.response?.error?.message || info.file.error?.message || 'Upload failed';
                message.error(`${info.file.name}: ${errMsg}`);
            }
        },
    };

    const removeImage = (idx: number) => {
        setImageUrls(prev => prev.filter((_, i) => i !== idx));
    };

    const getImageUrl = (path: string) => {
        if (!path) return '';
        if (path.startsWith('http')) return path;
        // Backend base URL without /api
        const base = (api.defaults.baseURL || '').replace('/api', '');
        return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
    };

    // ─── Compute Low-Stock & Out-of-Stock Warnings ───
    const { lowStockItems, outOfStockItems } = useMemo(() => {
        const lowStock: { product: string; variant: string; stock: number; threshold: number }[] = [];
        const outOfStock: { product: string; variant: string }[] = [];
        products.forEach(p => {
            (p.variants || []).forEach(v => {
                const variantLabel = [v.size, v.color].filter(Boolean).join('/') || 'Standard';
                const stock = parseInt(String(v.stock)) || 0;
                const threshold = parseInt(String(v.lowStockThreshold)) || 5;
                if (stock === 0) {
                    outOfStock.push({ product: p.name, variant: variantLabel });
                } else if (stock <= threshold) {
                    lowStock.push({ product: p.name, variant: variantLabel, stock, threshold });
                }
            });
        });
        return { lowStockItems: lowStock, outOfStockItems: outOfStock };
    }, [products]);

    // ─── Split products into two halves for 2-column layout ───
    const midpoint = Math.ceil(products.length / 2);
    const productsLeft = products.slice(0, midpoint);
    const productsRight = products.slice(midpoint);

    const productColumns: any[] = [
        {
            title: 'Product', key: 'name',
            render: (_: any, r: Product) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {r.image_url ? (
                        <Image src={getImageUrl(r.image_url)}
                            width={36} height={36} style={{ borderRadius: 6, objectFit: 'cover' }}
                            fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiMyMjE4MTAiLz48dGV4dCB4PSIyMCIgeT0iMjQiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM4QjVBMkIiIHRleHQtYW5jaG9yPSJtaWRkbGUiPj88L3RleHQ+PC9zdmc+"
                        />
                    ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: 'rgba(139,90,43,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C18E53', fontSize: 14, flexShrink: 0 }}>
                            <PictureOutlined />
                        </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                        <Text style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 12 }} ellipsis>{r.name}</Text>
                        {r.category && <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{r.category}</div>}
                    </div>
                </div>
            ),
        },
        {
            title: 'Var.', key: 'variants', width: 50, align: 'center' as const,
            render: (_: any, r: Product) => (
                <Tag style={{ background: 'rgba(139,90,43,0.15)', color: '#C18E53', border: 'none', borderRadius: 6, fontSize: 11 }}>
                    {r.variants.length}
                </Tag>
            ),
        },
        {
            title: 'Stock', key: 'stock', width: 60, align: 'center' as const,
            render: (_: any, r: Product) => {
                const total = parseInt(String(r.total_stock)) || 0;
                return <Badge count={total} style={{ backgroundColor: total === 0 ? '#ff4d4f' : total <= 5 ? '#faad14' : '#52c41a', fontSize: 10 }} showZero />;
            }
        },
        {
            title: 'Status', key: 'status', width: 56, align: 'center' as const,
            render: (_: any, r: Product) => (
                <Tag color={r.is_active ? 'green' : 'default'} style={{ borderRadius: 6, border: 'none', fontSize: 10, padding: '0 4px' }}>
                    {r.is_active ? '✓' : '—'}
                </Tag>
            ),
        },
        {
            title: '', key: 'actions', width: 70, fixed: 'right' as const,
            render: (_: any, r: Product) => (
                <Space size={0}>
                    <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} style={{ color: '#C18E53', fontSize: 12 }} size="small" />
                    <Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}>
                        <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <div>
            {/* ═══ LOW STOCK & OUT OF STOCK WARNINGS ═══ */}
            {(outOfStockItems.length > 0 || lowStockItems.length > 0) && (
                <div style={{ marginBottom: 16 }}>
                    {outOfStockItems.length > 0 && (
                        <Alert
                            type="error"
                            showIcon
                            icon={<ExclamationCircleOutlined />}
                            style={{
                                marginBottom: lowStockItems.length > 0 ? 10 : 0,
                                background: 'linear-gradient(135deg, rgba(255,77,79,0.08), rgba(255,77,79,0.03))',
                                border: '1px solid rgba(255,77,79,0.25)',
                                borderRadius: 10,
                                animation: 'pulse 3s ease-in-out infinite',
                            }}
                            message={
                                <span style={{ fontWeight: 600, color: '#ff4d4f', fontSize: 13 }}>
                                    🚨 {outOfStockItems.length} Variant{outOfStockItems.length > 1 ? 's' : ''} Out of Stock
                                </span>
                            }
                            description={
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                    {outOfStockItems.slice(0, 8).map((item, i) => (
                                        <Tag key={i} color="error" style={{ borderRadius: 6, fontSize: 11 }}>
                                            {item.product} — {item.variant}
                                        </Tag>
                                    ))}
                                    {outOfStockItems.length > 8 && (
                                        <Tag style={{ borderRadius: 6, fontSize: 11 }}>+{outOfStockItems.length - 8} more</Tag>
                                    )}
                                </div>
                            }
                        />
                    )}
                    {lowStockItems.length > 0 && (
                        <Alert
                            type="warning"
                            showIcon
                            icon={<WarningOutlined />}
                            style={{
                                background: 'linear-gradient(135deg, rgba(250,173,20,0.08), rgba(250,173,20,0.03))',
                                border: '1px solid rgba(250,173,20,0.25)',
                                borderRadius: 10,
                            }}
                            message={
                                <span style={{ fontWeight: 600, color: '#faad14', fontSize: 13 }}>
                                    ⚠️ {lowStockItems.length} Variant{lowStockItems.length > 1 ? 's' : ''} Running Low
                                </span>
                            }
                            description={
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                    {lowStockItems.slice(0, 8).map((item, i) => (
                                        <Tag key={i} color="warning" style={{ borderRadius: 6, fontSize: 11 }}>
                                            {item.product} — {item.variant} ({item.stock} left)
                                        </Tag>
                                    ))}
                                    {lowStockItems.length > 8 && (
                                        <Tag style={{ borderRadius: 6, fontSize: 11 }}>+{lowStockItems.length - 8} more</Tag>
                                    )}
                                </div>
                            }
                        />
                    )}
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <Title level={4} style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>Products</Title>
                {hasPermission('create_products') && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { clearForm(); setModalOpen(true); }}
                        style={{ background: 'linear-gradient(135deg, #8B5A2B, #A0693B)', border: 'none', borderRadius: 8, height: 38 }}>
                        Add Product
                    </Button>
                )}
            </div>

            {/* Filter bar */}
            <Card style={{ background: 'rgba(30,22,12,0.6)', border: '1px solid rgba(139,90,43,0.1)', borderRadius: 10, marginBottom: 16 }}
                styles={{ body: { padding: '12px 16px' } }}>
                <Row gutter={[12, 12]} align="middle">
                    <Col xs={24} sm={14} md={10}>
                        <Input.Search placeholder="Search products..." onSearch={setSearchText} allowClear />
                    </Col>
                    <Col xs={24} sm={10} md={6}>
                        <Select placeholder="Category" allowClear style={{ width: '100%' }}
                            value={categoryFilter || undefined}
                            onChange={(v) => setCategoryFilter(v || '')}
                            options={categories.map(c => ({ value: c, label: c }))} />
                    </Col>
                </Row>
            </Card>

            {/* ═══ TWO-COLUMN PRODUCT TABLES ═══ */}
            <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                    <Card style={{ background: 'rgba(30,22,12,0.8)', border: '1px solid rgba(139,90,43,0.15)', borderRadius: 12 }}
                        styles={{ body: { padding: 0 } }}>
                        <Table dataSource={productsLeft} rowKey="id" loading={loading}
                            columns={productColumns} size="small"
                            pagination={false}
                            scroll={{ x: 400 }} />
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <Card style={{ background: 'rgba(30,22,12,0.8)', border: '1px solid rgba(139,90,43,0.15)', borderRadius: 12 }}
                        styles={{ body: { padding: 0 } }}>
                        <Table dataSource={productsRight} rowKey="id" loading={loading}
                            columns={productColumns} size="small"
                            pagination={false}
                            scroll={{ x: 400 }} />
                    </Card>
                </Col>
            </Row>

            {/* Create/Edit Modal */}
            <Modal title={editProduct ? 'Edit Product' : 'New Product'} open={modalOpen}
                onCancel={() => { setModalOpen(false); setEditProduct(null); }}
                width={900} footer={null} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={editProduct ? handleUpdate : handleCreate} style={{ marginTop: 20 }}>
                    <Row gutter={[24, 0]}>
                        {/* Images Column */}
                        <Col xs={24} md={8}>
                            <Form.Item label={`Images (${imageUrls.length}/5)`}>
                                {/* Image thumbnails */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: imageUrls.length > 0 ? 12 : 0 }}>
                                    {imageUrls.map((url, i) => (
                                        <div key={i} style={{ position: 'relative', width: 64, height: 64 }}>
                                            <img src={getImageUrl(url)} alt={`img-${i}`}
                                                style={{
                                                    width: 64, height: 64, borderRadius: 6, objectFit: 'cover',
                                                    border: i === 0 ? '2px solid #C18E53' : '1px solid rgba(139,90,43,0.2)'
                                                }} />
                                            {i === 0 && (
                                                <div style={{
                                                    position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(139,90,43,0.85)',
                                                    color: '#fff', textAlign: 'center', fontSize: 9, borderBottomLeftRadius: 6, borderBottomRightRadius: 6
                                                }}>
                                                    Thumb
                                                </div>
                                            )}
                                            <Button type="text" danger size="small" icon={<DeleteOutlined />}
                                                onClick={() => removeImage(i)}
                                                style={{
                                                    position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                                                    background: '#ff4d4f', color: '#fff', borderRadius: '50%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 10
                                                }} />
                                        </div>
                                    ))}
                                </div>
                                {imageUrls.length < 5 && (
                                    <Dragger {...uploadProps} style={{ background: 'rgba(139,90,43,0.05)', borderColor: 'var(--border-primary)' }}>
                                        <p className="ant-upload-drag-icon" style={{ color: '#C18E53' }}><InboxOutlined /></p>
                                        <p className="ant-upload-text" style={{ color: 'var(--text-primary)', fontSize: 12 }}>
                                            Click or drag (JPG, PNG, WebP)
                                        </p>
                                    </Dragger>
                                )}
                            </Form.Item>
                        </Col>
                        {/* Details Column */}
                        <Col xs={24} md={16}>
                            <Row gutter={16}>
                                <Col xs={24} sm={12}><Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
                                <Col xs={24} sm={12}><Form.Item name="category" label="Category"><Input /></Form.Item></Col>
                                <Col xs={24} sm={12}><Form.Item name="sku" label="Base SKU"><Input /></Form.Item></Col>
                                <Col xs={24} sm={12}><Form.Item name="isActive" label="Status" valuePropName="checked"><Switch checkedChildren="Active" unCheckedChildren="Draft" /></Form.Item></Col>
                            </Row>
                            <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
                        </Col>
                    </Row>

                    <Divider style={{ borderColor: 'rgba(139,90,43,0.15)', color: '#C18E53' }}>Variants & Inventory</Divider>

                    {!editProduct && (
                        <div style={{ background: 'rgba(139,90,43,0.05)', padding: 16, borderRadius: 8, marginBottom: 20 }}>
                            <Row gutter={[16, 12]} align="bottom">
                                <Col xs={24} sm={9}>
                                    <Form.Item label="Option 1 (e.g. Size)" style={{ marginBottom: 0 }}>
                                        <Select mode="tags" placeholder="S, M, L..." value={sizeOptions} onChange={setSizeOptions} tokenSeparators={[',']} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={9}>
                                    <Form.Item label="Option 2 (e.g. Color)" style={{ marginBottom: 0 }}>
                                        <Select mode="tags" placeholder="Red, Blue..." value={colorOptions} onChange={setColorOptions} tokenSeparators={[',']} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={6}>
                                    <Button type="dashed" icon={<RedoOutlined />} onClick={generateVariants} block>Generate</Button>
                                </Col>
                            </Row>
                        </div>
                    )}

                    {variantsList.length > 0 && (
                        <>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Bulk Apply:</Text>
                                <InputNumber size="small" placeholder="Price" style={{ width: 80 }} value={bulkPrice} onChange={setBulkPrice} />
                                <InputNumber size="small" placeholder="Cost" style={{ width: 80 }} value={bulkCost} onChange={setBulkCost} />
                                <InputNumber size="small" placeholder="Stock" style={{ width: 80 }} value={bulkStock} onChange={setBulkStock} />
                                <Tooltip title="Apply to all variants"><Button size="small" icon={<ThunderboltOutlined />} onClick={applyBulk} /></Tooltip>
                            </div>

                            <Table dataSource={variantsList} rowKey={(r) => r.tempId || r.id || 'key'}
                                pagination={false} size="small" scroll={{ x: 600, y: 240 }}
                                columns={[
                                    { title: 'Size', dataIndex: 'size', width: 90, render: (v: any, r: any) => <Input size="small" value={v} onChange={e => updateVariant(r.tempId || r.id, 'size', e.target.value)} /> },
                                    { title: 'Color', dataIndex: 'color', width: 90, render: (v: any, r: any) => <Input size="small" value={v} onChange={e => updateVariant(r.tempId || r.id, 'color', e.target.value)} /> },
                                    { title: 'SKU', dataIndex: 'sku', width: 130, render: (v: any, r: any) => <Input size="small" value={v} onChange={e => updateVariant(r.tempId || r.id, 'sku', e.target.value)} /> },
                                    { title: 'Price', dataIndex: 'price', width: 85, render: (v: any, r: any) => <InputNumber size="small" value={v} min={0} onChange={(val: any) => updateVariant(r.tempId || r.id, 'price', val)} /> },
                                    { title: 'Cost', dataIndex: 'costPrice', width: 85, render: (v: any, r: any) => <InputNumber size="small" value={v} min={0} onChange={(val: any) => updateVariant(r.tempId || r.id, 'costPrice', val)} /> },
                                    { title: 'Stock', dataIndex: 'stock', width: 80, render: (v: any, r: any) => <InputNumber size="small" value={v} min={0} onChange={(val: any) => updateVariant(r.tempId || r.id, 'stock', val)} /> },
                                    { title: '', width: 90, render: (_: any, r: any) => (
                                        <Space size={0}>
                                            <Tooltip title="Duplicate">
                                                <Button type="text" size="small" icon={<RedoOutlined style={{ fontSize: 12 }} />} onClick={() => duplicateVariant(r.tempId || r.id)} />
                                            </Tooltip>
                                            <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeVariant(r.tempId || r.id)} />
                                        </Space>
                                    ) }
                                ]} />
                        </>
                    )}

                    <Form.Item style={{ textAlign: 'right', marginTop: 24, marginBottom: 0 }}>
                        <Space>
                            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit" style={{ background: 'linear-gradient(135deg, #8B5A2B, #A0693B)', border: 'none' }}>
                                {editProduct ? 'Save Changes' : 'Create Product'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Compact table styles */}
            <style>{`
                .ant-table-thead > tr > th {
                    font-size: 10px !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.5px !important;
                    padding: 6px 4px !important;
                }
                .ant-table-tbody > tr > td {
                    padding: 5px 4px !important;
                    vertical-align: middle !important;
                }
            `}</style>
        </div>
    );
}
