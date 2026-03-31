import { useState, useEffect, useCallback } from 'react';
import {
    Typography, Card, Row, Col, Button, Modal, Form, Input, InputNumber, Select, message, Space, Tag, Popconfirm,
    Table, Descriptions, Empty, Spin, Tabs,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
    EyeOutlined, DollarOutlined,
} from '@ant-design/icons';
import api from '../api/client';

const { Title, Text } = Typography;
const TEAL = '#0d9488';
const TEAL_BG = 'rgba(13,148,136,0.06)';
const TEAL_BORDER = 'rgba(13,148,136,0.18)';

export default function ProductionPage() {
    const [tab, setTab] = useState<'products' | 'cost'>('products');

    // ─── Products List ───────────────────────────────
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [productModal, setProductModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<any>(null);
    const [productForm] = Form.useForm();

    // ─── Product Detail ──────────────────────────────
    const [detailProduct, setDetailProduct] = useState<any>(null);
    const [detailModal, setDetailModal] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);

    // ─── Sub-item modals ─────────────────────────────
    const [tissuAddModal, setTissuAddModal] = useState(false);
    const [roloModal, setRoloModal] = useState(false);
    const [cuttingModal, setCuttingModal] = useState(false);
    const [expenseModal, setExpenseModal] = useState(false);
    const [editingRolo, setEditingRolo] = useState<any>(null);
    const [editingCutting, setEditingCutting] = useState<any>(null);
    const [tissuAddForm] = Form.useForm();
    const [roloForm] = Form.useForm();
    const [cuttingForm] = Form.useForm();
    const [expenseForm] = Form.useForm();

    // ─── Stock items for selects ─────────────────────
    const [stockTissus, setStockTissus] = useState<any[]>([]);
    const [stockSupplies, setStockSupplies] = useState<any[]>([]);

    // ─── Cost data ───────────────────────────────────
    const [costData, setCostData] = useState<any>(null);
    const [costLoading, setCostLoading] = useState(false);
    const [costProductId, setCostProductId] = useState<string | null>(null);

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/production/products');
            setProducts(res.data.data || []);
        } catch { message.error('Failed to load products'); }
        setLoading(false);
    }, []);

    const fetchStockItems = useCallback(async () => {
        try {
            const [t, s] = await Promise.all([api.get('/stock/tissus'), api.get('/stock/supplies')]);
            setStockTissus(t.data.data || []);
            setStockSupplies(s.data.data || []);
        } catch { /* silent */ }
    }, []);

    useEffect(() => { fetchProducts(); fetchStockItems(); }, []);

    // ─── Product CRUD ────────────────────────────────
    const openProductModal = (record?: any) => {
        if (record) {
            setEditingProduct(record);
            productForm.setFieldsValue({ name: record.name, photoUrl: record.photo_url });
        } else {
            setEditingProduct(null);
            productForm.resetFields();
        }
        setProductModal(true);
    };

    const saveProduct = async () => {
        try {
            const values = await productForm.validateFields();
            if (editingProduct) {
                await api.put(`/production/products/${editingProduct.id}`, values);
                message.success('Product updated');
            } else {
                await api.post('/production/products', values);
                message.success('Product created');
            }
            setProductModal(false);
            fetchProducts();
        } catch (err: any) {
            if (err.response) message.error(err.response.data?.error?.message || 'Failed');
        }
    };

    const deleteProduct = async (id: string) => {
        try {
            await api.delete(`/production/products/${id}`);
            message.success('Product deleted');
            fetchProducts();
        } catch { message.error('Failed to delete'); }
    };

    // ─── Product Detail ──────────────────────────────
    const openDetail = async (productId: string) => {
        setDetailLoading(true);
        setDetailModal(true);
        try {
            const res = await api.get(`/production/products/${productId}`);
            setDetailProduct(res.data.data);
        } catch { message.error('Failed to load product details'); }
        setDetailLoading(false);
    };

    const refreshDetail = async () => {
        if (!detailProduct?.id) return;
        setDetailLoading(true);
        try {
            const res = await api.get(`/production/products/${detailProduct.id}`);
            setDetailProduct(res.data.data);
        } catch { /* silent */ }
        setDetailLoading(false);
    };

    // ─── Tissu Link ──────────────────────────────────
    const addTissu = async () => {
        try {
            const values = await tissuAddForm.validateFields();
            await api.post(`/production/products/${detailProduct.id}/tissus`, values);
            message.success('Tissu linked');
            setTissuAddModal(false);
            refreshDetail();
        } catch (err: any) {
            if (err.response) message.error(err.response.data?.error?.message || 'Failed');
        }
    };

    const removeTissu = async (linkId: string) => {
        try {
            await api.delete(`/production/products/${detailProduct.id}/tissus/${linkId}`);
            message.success('Tissu removed');
            refreshDetail();
        } catch { message.error('Failed'); }
    };

    // ─── Rolo CRUD ───────────────────────────────────
    const openRoloModal = (record?: any) => {
        if (record) {
            setEditingRolo(record);
            roloForm.setFieldsValue({
                stockTissuId: record.stock_tissu_id, color: record.color,
                quantity: record.quantity, metersPerRolo: parseFloat(record.meters_per_rolo),
                expectedPieces: record.expected_pieces, actualPieces: record.actual_pieces,
            });
        } else {
            setEditingRolo(null);
            roloForm.resetFields();
            roloForm.setFieldsValue({ quantity: 1, metersPerRolo: 0, expectedPieces: 0, actualPieces: 0 });
        }
        setRoloModal(true);
    };

    const saveRolo = async () => {
        try {
            const values = await roloForm.validateFields();
            if (editingRolo) {
                await api.put(`/production/products/${detailProduct.id}/rolos/${editingRolo.id}`, values);
                message.success('Rolo updated');
            } else {
                await api.post(`/production/products/${detailProduct.id}/rolos`, values);
                message.success('Rolo added');
            }
            setRoloModal(false);
            refreshDetail();
        } catch (err: any) {
            if (err.response) message.error(err.response.data?.error?.message || 'Failed');
        }
    };

    const deleteRolo = async (roloId: string) => {
        try {
            await api.delete(`/production/products/${detailProduct.id}/rolos/${roloId}`);
            message.success('Rolo deleted');
            refreshDetail();
        } catch { message.error('Failed'); }
    };

    // ─── Cutting CRUD ────────────────────────────────
    const openCuttingModal = (record?: any) => {
        if (record) {
            setEditingCutting(record);
            cuttingForm.setFieldsValue({
                meters: parseFloat(record.meters), cm: parseFloat(record.cm),
                cuttingDate: record.cutting_date?.split('T')[0],
                workStartDate: record.work_start_date?.split('T')[0],
                workEndDate: record.work_end_date?.split('T')[0],
                notes: record.notes,
            });
        } else {
            setEditingCutting(null);
            cuttingForm.resetFields();
        }
        setCuttingModal(true);
    };

    const saveCutting = async () => {
        try {
            const values = await cuttingForm.validateFields();
            if (editingCutting) {
                await api.put(`/production/products/${detailProduct.id}/cutting/${editingCutting.id}`, values);
                message.success('Cutting updated');
            } else {
                await api.post(`/production/products/${detailProduct.id}/cutting`, values);
                message.success('Cutting added');
            }
            setCuttingModal(false);
            refreshDetail();
        } catch (err: any) {
            if (err.response) message.error(err.response.data?.error?.message || 'Failed');
        }
    };

    const deleteCutting = async (cuttingId: string) => {
        try {
            await api.delete(`/production/products/${detailProduct.id}/cutting/${cuttingId}`);
            message.success('Cutting deleted');
            refreshDetail();
        } catch { message.error('Failed'); }
    };

    // ─── Expense CRUD ────────────────────────────────
    const addExpense = async () => {
        try {
            const values = await expenseForm.validateFields();
            await api.post(`/production/products/${detailProduct.id}/expenses`, values);
            message.success('Expense added');
            setExpenseModal(false);
            refreshDetail();
        } catch (err: any) {
            if (err.response) message.error(err.response.data?.error?.message || 'Failed');
        }
    };

    const deleteExpense = async (expenseId: string) => {
        try {
            await api.delete(`/production/products/${detailProduct.id}/expenses/${expenseId}`);
            message.success('Expense deleted');
            refreshDetail();
        } catch { message.error('Failed'); }
    };

    // ─── Cost Breakdown ──────────────────────────────
    const fetchCost = async (productId: string) => {
        setCostLoading(true);
        setCostProductId(productId);
        try {
            const res = await api.get(`/production/products/${productId}/cost`);
            setCostData(res.data.data);
        } catch { message.error('Failed to load cost breakdown'); }
        setCostLoading(false);
    };

    // ─── Product card grid ───────────────────────────
    const productColumns = [
        {
            title: 'Product', key: 'name',
            render: (_: any, r: any) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {r.photo_url ? (
                        <img src={r.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: `1px solid ${TEAL_BORDER}` }} />
                    ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: TEAL_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEAL, fontSize: 16, fontWeight: 700 }}>
                            {r.name?.[0]?.toUpperCase() || 'P'}
                        </div>
                    )}
                    <Text strong style={{ fontSize: 14 }}>{r.name}</Text>
                </div>
            ),
        },
        { title: 'Tissus', dataIndex: 'tissu_count', key: 'tissus', width: 70, render: (v: number) => <Tag color="cyan">{v || 0}</Tag> },
        { title: 'Rolos', dataIndex: 'rolo_count', key: 'rolos', width: 70, render: (v: number) => <Tag color="blue">{v || 0}</Tag> },
        { title: 'Cutting', dataIndex: 'cutting_count', key: 'cutting', width: 80, render: (v: number) => <Tag color="orange">{v || 0}</Tag> },
        { title: 'Expenses', dataIndex: 'expense_count', key: 'expenses', width: 80, render: (v: number) => <Tag color="gold">{v || 0}</Tag> },
        {
            title: '', key: 'actions', width: 140,
            render: (_: any, r: any) => (
                <Space size={4}>
                    <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)} style={{ color: TEAL }}>Details</Button>
                    <Button type="text" size="small" icon={<DollarOutlined />} onClick={() => { setTab('cost'); fetchCost(r.id); }} style={{ color: '#d97706' }}>Cost</Button>
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openProductModal(r)} style={{ color: '#6b7280' }} />
                    <Popconfirm title="Delete product?" onConfirm={() => deleteProduct(r.id)} okText="Delete" okButtonProps={{ danger: true }}>
                        <Button type="text" size="small" icon={<DeleteOutlined />} style={{ color: '#ff4d4f' }} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const tabBtnStyle = (active: boolean): React.CSSProperties => ({
        padding: '8px 20px', borderRadius: 8, border: `1px solid ${active ? TEAL : TEAL_BORDER}`,
        background: active ? TEAL : 'transparent', color: active ? '#fff' : TEAL,
        fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
    });

    const tissuOptions = stockTissus.map(t => ({
        value: t.id,
        label: `${t.tissu_name}${t.color ? ` — ${t.color}` : ''}${t.largeur ? ` — ${parseFloat(t.largeur)} cm` : ''} [Qty: ${parseFloat(t.quantity)} ${t.unit}]`,
    }));

    return (
        <div style={{ padding: '16px 20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <Title level={4} style={{ margin: 0, fontWeight: 700, color: TEAL }}>🏭 Production</Title>
                    <Text style={{ color: '#6b7280', fontSize: 13 }}>{products.length} products</Text>
                </div>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={fetchProducts}>Refresh</Button>
                    {tab === 'products' && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openProductModal()}
                            style={{ background: TEAL, borderColor: TEAL }}>Add Product</Button>
                    )}
                </Space>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <div style={tabBtnStyle(tab === 'products')} onClick={() => setTab('products')}>📦 Products</div>
                <div style={tabBtnStyle(tab === 'cost')} onClick={() => setTab('cost')}>💰 Product Cost</div>
            </div>

            {/* Products Tab */}
            {tab === 'products' && (
                <Card style={{ borderRadius: 10, border: `1px solid ${TEAL_BORDER}` }} styles={{ body: { padding: 0 } }}>
                    <Table dataSource={products} columns={productColumns} rowKey="id" loading={loading} pagination={false} size="small" />
                </Card>
            )}

            {/* Cost Tab */}
            {tab === 'cost' && (
                <div>
                    {/* Product selector */}
                    <Card style={{ borderRadius: 10, border: `1px solid ${TEAL_BORDER}`, marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
                        <Space>
                            <Text strong>Select product:</Text>
                            <Select
                                style={{ width: 300 }}
                                placeholder="Choose a product"
                                value={costProductId}
                                onChange={(v) => fetchCost(v)}
                                showSearch optionFilterProp="label"
                                options={products.map(p => ({ value: p.id, label: p.name }))}
                            />
                        </Space>
                    </Card>

                    {costLoading ? (
                        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
                    ) : costData ? (
                        <Row gutter={[16, 16]}>
                            {/* Summary */}
                            <Col span={24}>
                                <Row gutter={[12, 12]}>
                                    {[
                                        { title: 'Cost / Piece', value: `${costData.totalCostPerPiece} MAD`, color: TEAL },
                                        { title: 'Total Pieces', value: costData.totalPieces, color: '#3b82f6' },
                                        { title: 'Batch Cost', value: `${costData.totalBatchCost.toLocaleString()} MAD`, color: '#d97706' },
                                        { title: 'Tissu / Piece', value: `${costData.tissu.costPerPiece} MAD`, color: '#059669' },
                                        { title: 'Labor / Piece', value: `${costData.labor.costPerPiece} MAD`, color: '#7c3aed' },
                                        { title: 'Accessories / Piece', value: `${costData.accessories.costPerPiece} MAD`, color: '#ea580c' },
                                    ].map((s, i) => (
                                        <Col xs={12} sm={8} md={4} key={i}>
                                            <Card style={{ borderRadius: 10, border: `1px solid ${TEAL_BORDER}`, borderTop: `3px solid ${s.color}` }}
                                                styles={{ body: { padding: '10px 14px' } }}>
                                                <div style={{ color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{s.title}</div>
                                                <div style={{ color: '#111827', fontSize: 18, fontWeight: 700 }}>{s.value}</div>
                                            </Card>
                                        </Col>
                                    ))}
                                </Row>
                            </Col>

                            {/* Tissu Details */}
                            <Col xs={24} md={8}>
                                <Card title={<span style={{ color: TEAL }}>🧵 Tissu Cost</span>} size="small"
                                    style={{ borderRadius: 10, border: `1px solid ${TEAL_BORDER}` }}>
                                    {costData.tissu.details.length === 0 ? <Empty description="No tissus linked" /> : (
                                        costData.tissu.details.map((t: any, i: number) => (
                                            <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                                                <Text strong style={{ fontSize: 13 }}>{t.tissuName}</Text>
                                                <div style={{ color: '#6b7280', fontSize: 12 }}>
                                                    {t.consumptionPerPiece} {t.unit} × {t.pricePerUnit} MAD = <span style={{ color: TEAL, fontWeight: 600 }}>{t.costPerPiece} MAD</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </Card>
                            </Col>

                            {/* Labor Details */}
                            <Col xs={24} md={8}>
                                <Card title={<span style={{ color: '#7c3aed' }}>👷 Labor Cost</span>} size="small"
                                    style={{ borderRadius: 10, border: `1px solid ${TEAL_BORDER}` }}>
                                    <Descriptions column={1} size="small">
                                        <Descriptions.Item label="Total Labor">{costData.labor.totalLaborCost} MAD</Descriptions.Item>
                                        <Descriptions.Item label="Per Piece">{costData.labor.costPerPiece} MAD</Descriptions.Item>
                                    </Descriptions>
                                </Card>
                            </Col>

                            {/* Accessories Details */}
                            <Col xs={24} md={8}>
                                <Card title={<span style={{ color: '#ea580c' }}>🔩 Accessories</span>} size="small"
                                    style={{ borderRadius: 10, border: `1px solid ${TEAL_BORDER}` }}>
                                    {costData.accessories.details.length === 0 ? <Empty description="No accessories" /> : (
                                        costData.accessories.details.map((a: any, i: number) => (
                                            <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                                                <Text strong style={{ fontSize: 13 }}>{a.name}</Text>
                                                <div style={{ color: '#6b7280', fontSize: 12 }}>
                                                    {a.unitCost} MAD × {a.qtyPerPiece} = <span style={{ color: '#ea580c', fontWeight: 600 }}>{a.costPerPiece} MAD</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </Card>
                            </Col>
                        </Row>
                    ) : (
                        <Card style={{ borderRadius: 10, border: `1px solid ${TEAL_BORDER}`, textAlign: 'center', padding: 60 }}>
                            <Empty description="Select a product to view cost breakdown" />
                        </Card>
                    )}
                </div>
            )}

            {/* ═══ Product Create/Edit Modal ═══ */}
            <Modal title={editingProduct ? 'Edit Product' : 'New Product'} open={productModal} onCancel={() => setProductModal(false)} onOk={saveProduct}
                okButtonProps={{ style: { background: TEAL, borderColor: TEAL } }}>
                <Form form={productForm} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item name="name" label="Product Name" rules={[{ required: true }]}>
                        <Input placeholder="e.g. Djellaba, Kaftan..." />
                    </Form.Item>
                    <Form.Item name="photoUrl" label="Photo URL (optional)">
                        <Input placeholder="https://..." />
                    </Form.Item>
                </Form>
            </Modal>

            {/* ═══ Product Detail Modal ═══ */}
            <Modal title={detailProduct?.name || 'Product Details'} open={detailModal}
                onCancel={() => { setDetailModal(false); setDetailProduct(null); }}
                footer={null} width={800}>
                {detailLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
                ) : detailProduct ? (
                    <Tabs defaultActiveKey="tissus" items={[
                        {
                            key: 'tissus', label: '🧵 Tissus',
                            children: (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <Text strong>Linked Tissus ({detailProduct.tissus?.length || 0})</Text>
                                        <Button size="small" icon={<PlusOutlined />} onClick={() => { tissuAddForm.resetFields(); setTissuAddModal(true); }}
                                            style={{ color: TEAL, borderColor: TEAL }}>Link Tissu</Button>
                                    </div>
                                    <Table dataSource={detailProduct.tissus || []} rowKey="id" pagination={false} size="small" columns={[
                                        { title: 'Tissu', key: 'name', render: (_: any, r: any) => <>{r.tissu_name} {r.tissu_color && <Tag>{r.tissu_color}</Tag>}</> },
                                        { title: 'Largeur', key: 'largeur', width: 90, render: (_: any, r: any) => r.tissu_largeur ? <span style={{ fontWeight: 600 }}>{parseFloat(r.tissu_largeur)} cm</span> : '—' },
                                        { title: 'Consumption/pc', dataIndex: 'consumption_per_piece', key: 'consumption', render: (v: any) => `${parseFloat(v)} ${detailProduct.tissus?.[0]?.unit || 'M'}` },
                                        { title: 'Price/unit', dataIndex: 'price_per_unit', key: 'price', render: (v: any) => `${parseFloat(v)} MAD` },
                                        {
                                            title: '', key: 'actions', width: 50,
                                            render: (_: any, r: any) => (
                                                <Popconfirm title="Remove?" onConfirm={() => removeTissu(r.id)}>
                                                    <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                                                </Popconfirm>
                                            ),
                                        },
                                    ]} />
                                </div>
                            ),
                        },
                        {
                            key: 'rolos', label: '🧶 Rolos',
                            children: (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <Text strong>Rolos ({detailProduct.rolos?.length || 0})</Text>
                                        <Button size="small" icon={<PlusOutlined />} onClick={() => openRoloModal()}
                                            style={{ color: TEAL, borderColor: TEAL }}>Add Rolo</Button>
                                    </div>
                                    <Table dataSource={detailProduct.rolos || []} rowKey="id" pagination={false} size="small" columns={[
                                        { title: 'Tissu', dataIndex: 'tissu_name', key: 'tissu', render: (v: string) => v || '—' },
                                        { title: 'Color', dataIndex: 'color', key: 'color', render: (v: string) => v || '—' },
                                        { title: 'Qty', dataIndex: 'quantity', key: 'qty', width: 60 },
                                        { title: 'M/Rolo', dataIndex: 'meters_per_rolo', key: 'meters', width: 80, render: (v: any) => parseFloat(v) },
                                        { title: 'Expected', dataIndex: 'expected_pieces', key: 'expected', width: 80 },
                                        { title: 'Actual', dataIndex: 'actual_pieces', key: 'actual', width: 70, render: (v: number) => <span style={{ fontWeight: 600, color: TEAL }}>{v}</span> },
                                        {
                                            title: '', key: 'actions', width: 70,
                                            render: (_: any, r: any) => (
                                                <Space size={4}>
                                                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openRoloModal(r)} />
                                                    <Popconfirm title="Delete?" onConfirm={() => deleteRolo(r.id)}>
                                                        <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                                                    </Popconfirm>
                                                </Space>
                                            ),
                                        },
                                    ]} />
                                </div>
                            ),
                        },
                        {
                            key: 'cutting', label: '✂️ Traçage',
                            children: (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <Text strong>Cutting Records ({detailProduct.cutting?.length || 0})</Text>
                                        <Button size="small" icon={<PlusOutlined />} onClick={() => openCuttingModal()}
                                            style={{ color: TEAL, borderColor: TEAL }}>Add Cutting</Button>
                                    </div>
                                    <Table dataSource={detailProduct.cutting || []} rowKey="id" pagination={false} size="small" columns={[
                                        { title: 'Meters', dataIndex: 'meters', key: 'meters', render: (v: any) => parseFloat(v) },
                                        { title: 'cm', dataIndex: 'cm', key: 'cm', render: (v: any) => parseFloat(v) },
                                        { title: 'Cutting Date', dataIndex: 'cutting_date', key: 'cdate', render: (v: string) => v?.split('T')[0] || '—' },
                                        { title: 'Work Start', dataIndex: 'work_start_date', key: 'wstart', render: (v: string) => v?.split('T')[0] || '—' },
                                        { title: 'Work End', dataIndex: 'work_end_date', key: 'wend', render: (v: string) => v?.split('T')[0] || '—' },
                                        { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
                                        {
                                            title: '', key: 'actions', width: 70,
                                            render: (_: any, r: any) => (
                                                <Space size={4}>
                                                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openCuttingModal(r)} />
                                                    <Popconfirm title="Delete?" onConfirm={() => deleteCutting(r.id)}>
                                                        <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                                                    </Popconfirm>
                                                </Space>
                                            ),
                                        },
                                    ]} />
                                </div>
                            ),
                        },
                        {
                            key: 'expenses', label: '🔩 Accessories',
                            children: (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <Text strong>Accessories & Expenses ({detailProduct.expenses?.length || 0})</Text>
                                        <Button size="small" icon={<PlusOutlined />} onClick={() => { expenseForm.resetFields(); expenseForm.setFieldsValue({ qtyPerPiece: 1 }); setExpenseModal(true); }}
                                            style={{ color: TEAL, borderColor: TEAL }}>Add Expense</Button>
                                    </div>
                                    <Table dataSource={detailProduct.expenses || []} rowKey="id" pagination={false} size="small" columns={[
                                        { title: 'Name', dataIndex: 'expense_name', key: 'name' },
                                        { title: 'Supply', dataIndex: 'supply_item_name', key: 'supply', render: (v: string) => v || '—' },
                                        { title: 'Unit Cost', dataIndex: 'unit_cost', key: 'cost', render: (v: any) => `${parseFloat(v)} MAD` },
                                        { title: 'Qty/Piece', dataIndex: 'qty_per_piece', key: 'qty', render: (v: any) => parseFloat(v) },
                                        { title: 'Cost/Piece', key: 'total', render: (_: any, r: any) => <span style={{ fontWeight: 600, color: TEAL }}>{(parseFloat(r.unit_cost) * parseFloat(r.qty_per_piece)).toFixed(2)} MAD</span> },
                                        {
                                            title: '', key: 'actions', width: 50,
                                            render: (_: any, r: any) => (
                                                <Popconfirm title="Delete?" onConfirm={() => deleteExpense(r.id)}>
                                                    <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                                                </Popconfirm>
                                            ),
                                        },
                                    ]} />
                                </div>
                            ),
                        },
                    ]} />
                ) : null}
            </Modal>

            {/* ═══ Sub-item Modals ═══ */}

            {/* Link Tissu */}
            <Modal title="Link Tissu to Product" open={tissuAddModal} onCancel={() => setTissuAddModal(false)} onOk={addTissu}
                okButtonProps={{ style: { background: TEAL, borderColor: TEAL } }}>
                <Form form={tissuAddForm} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item name="stockTissuId" label="Tissu from Stock" rules={[{ required: true }]}>
                        <Select options={tissuOptions} showSearch optionFilterProp="label" placeholder="Select tissu..." />
                    </Form.Item>
                    <Form.Item name="consumptionPerPiece" label="Consumption per piece (M or kg)" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Rolo */}
            <Modal title={editingRolo ? 'Edit Rolo' : 'Add Rolo'} open={roloModal} onCancel={() => setRoloModal(false)} onOk={saveRolo}
                okButtonProps={{ style: { background: TEAL, borderColor: TEAL } }}>
                <Form form={roloForm} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item name="stockTissuId" label="Tissu (optional)">
                        <Select options={tissuOptions} showSearch optionFilterProp="label" placeholder="Select tissu..." allowClear />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={12}><Form.Item name="color" label="Color"><Input /></Form.Item></Col>
                        <Col span={12}><Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}><Form.Item name="metersPerRolo" label="Meters / Rolo" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} step={0.5} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="expectedPieces" label="Expected Pieces"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
                    </Row>
                    <Form.Item name="actualPieces" label="Actual Pieces">
                        <InputNumber style={{ width: '100%' }} min={0} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Cutting */}
            <Modal title={editingCutting ? 'Edit Cutting' : 'Add Cutting Record'} open={cuttingModal} onCancel={() => setCuttingModal(false)} onOk={saveCutting}
                okButtonProps={{ style: { background: TEAL, borderColor: TEAL } }}>
                <Form form={cuttingForm} layout="vertical" style={{ marginTop: 16 }}>
                    <Row gutter={12}>
                        <Col span={12}><Form.Item name="meters" label="Meters"><InputNumber style={{ width: '100%' }} min={0} step={0.5} /></Form.Item></Col>
                        <Col span={12}><Form.Item name="cm" label="CM"><InputNumber style={{ width: '100%' }} min={0} step={0.5} /></Form.Item></Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={8}><Form.Item name="cuttingDate" label="Cutting Date"><Input type="date" /></Form.Item></Col>
                        <Col span={8}><Form.Item name="workStartDate" label="Work Start"><Input type="date" /></Form.Item></Col>
                        <Col span={8}><Form.Item name="workEndDate" label="Work End"><Input type="date" /></Form.Item></Col>
                    </Row>
                    <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
                </Form>
            </Modal>

            {/* Expense */}
            <Modal title="Add Expense / Accessory" open={expenseModal} onCancel={() => setExpenseModal(false)} onOk={addExpense}
                okButtonProps={{ style: { background: TEAL, borderColor: TEAL } }}>
                <Form form={expenseForm} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item name="expenseName" label="Expense Name" rules={[{ required: true }]}>
                        <Input placeholder="e.g. Buttons, Zipper, Visline..." />
                    </Form.Item>
                    <Form.Item name="stockSupplyId" label="Link to Supply (optional)">
                        <Select allowClear showSearch optionFilterProp="label" placeholder="Select supply..."
                            options={stockSupplies.map(s => ({ value: s.id, label: `${s.item_name}${s.category ? ` (${s.category})` : ''} — ${parseFloat(s.price_per_unit)} MAD` }))}
                        />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="unitCost" label="Unit Cost (MAD)" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} min={0} step={0.5} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="qtyPerPiece" label="Qty per Piece" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} min={0} step={0.5} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
}
