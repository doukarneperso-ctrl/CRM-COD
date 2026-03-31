import { useState, useEffect } from 'react';
import {
    Table, Typography, Card, Row, Col, Button, Modal, Form, Input, InputNumber, Select, message, Space, Tag, Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import api from '../api/client';

const { Title, Text } = Typography;

const TEAL = '#0d9488';
const TEAL_BG = 'rgba(13,148,136,0.06)';
const TEAL_BORDER = 'rgba(13,148,136,0.18)';

interface Tissu { id: string; tissu_name: string; color: string; largeur: number | null; quantity: number; unit: string; price_per_unit: number; }
interface Supply { id: string; item_name: string; category: string; quantity: number; unit: string; price_per_unit: number; }

export default function StockAtelierPage() {
    const [tab, setTab] = useState<'tissus' | 'supplies'>('tissus');

    // ─── Tissus State ────────────────────────────────
    const [tissus, setTissus] = useState<Tissu[]>([]);
    const [tissuModal, setTissuModal] = useState(false);
    const [editingTissu, setEditingTissu] = useState<Tissu | null>(null);
    const [tissuForm] = Form.useForm();

    // ─── Supplies State ──────────────────────────────
    const [supplies, setSupplies] = useState<Supply[]>([]);
    const [supplyModal, setSupplyModal] = useState(false);
    const [editingSupply, setEditingSupply] = useState<Supply | null>(null);
    const [supplyForm] = Form.useForm();

    const fetchTissus = async () => {
        try {
            const res = await api.get('/stock/tissus');
            setTissus(res.data.data || []);
        } catch { message.error('Failed to load tissus'); }
    };

    const fetchSupplies = async () => {
        try {
            const res = await api.get('/stock/supplies');
            setSupplies(res.data.data || []);
        } catch { message.error('Failed to load supplies'); }
    };

    useEffect(() => { fetchTissus(); fetchSupplies(); }, []);

    // ─── Tissu Handlers ──────────────────────────────
    const openTissuModal = (record?: Tissu) => {
        if (record) {
            setEditingTissu(record);
            tissuForm.setFieldsValue({ tissuName: record.tissu_name, color: record.color, largeur: record.largeur ? parseFloat(String(record.largeur)) : null, quantity: parseFloat(String(record.quantity)), unit: record.unit, pricePerUnit: parseFloat(String(record.price_per_unit)) });
        } else {
            setEditingTissu(null);
            tissuForm.resetFields();
            tissuForm.setFieldsValue({ unit: 'M', quantity: 0, pricePerUnit: 0 });
        }
        setTissuModal(true);
    };

    const saveTissu = async () => {
        try {
            const values = await tissuForm.validateFields();
            if (editingTissu) {
                await api.put(`/stock/tissus/${editingTissu.id}`, values);
                message.success('Tissu updated');
            } else {
                await api.post('/stock/tissus', values);
                message.success('Tissu added');
            }
            setTissuModal(false);
            fetchTissus();
        } catch (err: any) {
            if (err.response) message.error(err.response.data?.error?.message || 'Failed');
        }
    };

    const deleteTissu = async (id: string) => {
        try {
            await api.delete(`/stock/tissus/${id}`);
            message.success('Tissu deleted');
            fetchTissus();
        } catch { message.error('Failed to delete'); }
    };

    // ─── Supply Handlers ─────────────────────────────
    const openSupplyModal = (record?: Supply) => {
        if (record) {
            setEditingSupply(record);
            supplyForm.setFieldsValue({ itemName: record.item_name, category: record.category, quantity: parseFloat(String(record.quantity)), unit: record.unit, pricePerUnit: parseFloat(String(record.price_per_unit)) });
        } else {
            setEditingSupply(null);
            supplyForm.resetFields();
            supplyForm.setFieldsValue({ unit: 'pcs', quantity: 0, pricePerUnit: 0 });
        }
        setSupplyModal(true);
    };

    const saveSupply = async () => {
        try {
            const values = await supplyForm.validateFields();
            if (editingSupply) {
                await api.put(`/stock/supplies/${editingSupply.id}`, values);
                message.success('Supply updated');
            } else {
                await api.post('/stock/supplies', values);
                message.success('Supply added');
            }
            setSupplyModal(false);
            fetchSupplies();
        } catch (err: any) {
            if (err.response) message.error(err.response.data?.error?.message || 'Failed');
        }
    };

    const deleteSupply = async (id: string) => {
        try {
            await api.delete(`/stock/supplies/${id}`);
            message.success('Supply deleted');
            fetchSupplies();
        } catch { message.error('Failed to delete'); }
    };

    // ─── Table Columns ───────────────────────────────
    const tissuColumns = [
        { title: 'Tissu Name', dataIndex: 'tissu_name', key: 'name', render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
        { title: 'Color', dataIndex: 'color', key: 'color', render: (v: string) => v ? <Tag style={{ background: TEAL_BG, color: TEAL, border: `1px solid ${TEAL_BORDER}`, borderRadius: 6 }}>{v}</Tag> : '—' },
        { title: 'Largeur (cm)', dataIndex: 'largeur', key: 'largeur', width: 110, render: (v: number) => v ? <span style={{ fontWeight: 600 }}>{parseFloat(String(v))} cm</span> : '—' },
        { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 90, render: (v: number) => <span style={{ fontWeight: 600, color: parseFloat(String(v)) > 0 ? TEAL : '#ff4d4f' }}>{parseFloat(String(v))}</span> },
        { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 60 },
        { title: 'Price/Unit', dataIndex: 'price_per_unit', key: 'price', width: 100, render: (v: number) => `${parseFloat(String(v))} MAD` },
        {
            title: '', key: 'actions', width: 80,
            render: (_: any, r: Tissu) => (
                <Space size={4}>
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openTissuModal(r)} style={{ color: TEAL }} />
                    <Popconfirm title="Delete this tissu?" onConfirm={() => deleteTissu(r.id)} okText="Delete" okButtonProps={{ danger: true }}>
                        <Button type="text" size="small" icon={<DeleteOutlined />} style={{ color: '#ff4d4f' }} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const supplyColumns = [
        { title: 'Item Name', dataIndex: 'item_name', key: 'name', render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
        { title: 'Category', dataIndex: 'category', key: 'category', render: (v: string) => v ? <Tag style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 6 }}>{v}</Tag> : '—' },
        { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 90, render: (v: number) => <span style={{ fontWeight: 600, color: parseFloat(String(v)) > 0 ? TEAL : '#ff4d4f' }}>{parseFloat(String(v))}</span> },
        { title: 'Unit', dataIndex: 'unit', key: 'unit', width: 70 },
        { title: 'Price/Unit', dataIndex: 'price_per_unit', key: 'price', width: 100, render: (v: number) => `${parseFloat(String(v))} MAD` },
        {
            title: '', key: 'actions', width: 80,
            render: (_: any, r: Supply) => (
                <Space size={4}>
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openSupplyModal(r)} style={{ color: TEAL }} />
                    <Popconfirm title="Delete this supply?" onConfirm={() => deleteSupply(r.id)} okText="Delete" okButtonProps={{ danger: true }}>
                        <Button type="text" size="small" icon={<DeleteOutlined />} style={{ color: '#ff4d4f' }} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const totalTissuValue = tissus.reduce((s, t) => s + parseFloat(String(t.quantity)) * parseFloat(String(t.price_per_unit)), 0);
    const totalSupplyValue = supplies.reduce((s, t) => s + parseFloat(String(t.quantity)) * parseFloat(String(t.price_per_unit)), 0);

    const tabBtnStyle = (active: boolean): React.CSSProperties => ({
        padding: '8px 20px',
        borderRadius: 8,
        border: `1px solid ${active ? TEAL : TEAL_BORDER}`,
        background: active ? TEAL : 'transparent',
        color: active ? '#fff' : TEAL,
        fontWeight: 600,
        fontSize: 13,
        cursor: 'pointer',
        transition: 'all 0.2s',
    });

    return (
        <div style={{ padding: '16px 20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <Title level={4} style={{ margin: 0, fontWeight: 700, color: TEAL }}>
                        🧵 Atelier Stock
                    </Title>
                    <Text style={{ color: '#6b7280', fontSize: 13 }}>
                        {tissus.length} tissu items · {supplies.length} supplies · Total value: {Math.round(totalTissuValue + totalSupplyValue).toLocaleString()} MAD
                    </Text>
                </div>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={() => { fetchTissus(); fetchSupplies(); }}>Refresh</Button>
                    <Button type="primary" icon={<PlusOutlined />}
                        style={{ background: TEAL, borderColor: TEAL }}
                        onClick={() => tab === 'tissus' ? openTissuModal() : openSupplyModal()}>
                        Add {tab === 'tissus' ? 'Tissu' : 'Supply'}
                    </Button>
                </Space>
            </div>

            {/* KPIs */}
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                {[
                    { title: 'Tissu Items', value: tissus.length, color: TEAL },
                    { title: 'Tissu Value', value: `${Math.round(totalTissuValue).toLocaleString()} MAD`, color: '#059669' },
                    { title: 'Supply Items', value: supplies.length, color: '#d97706' },
                    { title: 'Supply Value', value: `${Math.round(totalSupplyValue).toLocaleString()} MAD`, color: '#b45309' },
                ].map((s, i) => (
                    <Col xs={12} sm={6} key={i}>
                        <Card style={{ borderRadius: 10, border: `1px solid ${TEAL_BORDER}`, borderLeft: `3px solid ${s.color}` }}
                            styles={{ body: { padding: '14px 16px' } }}>
                            <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{s.title}</div>
                            <div style={{ color: '#111827', fontSize: 22, fontWeight: 700 }}>{s.value}</div>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* Tab Toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <div style={tabBtnStyle(tab === 'tissus')} onClick={() => setTab('tissus')}>🧵 Tissu Stock</div>
                <div style={tabBtnStyle(tab === 'supplies')} onClick={() => setTab('supplies')}>🔩 Supplies</div>
            </div>

            {/* Table */}
            <Card style={{ borderRadius: 10, border: `1px solid ${TEAL_BORDER}` }} styles={{ body: { padding: 0 } }}>
                {tab === 'tissus' ? (
                    <Table dataSource={tissus} columns={tissuColumns} rowKey="id" pagination={false} size="small" />
                ) : (
                    <Table dataSource={supplies} columns={supplyColumns} rowKey="id" pagination={false} size="small" />
                )}
            </Card>

            {/* Tissu Modal */}
            <Modal title={editingTissu ? 'Edit Tissu' : 'Add Tissu'} open={tissuModal} onCancel={() => setTissuModal(false)} onOk={saveTissu}
                okButtonProps={{ style: { background: TEAL, borderColor: TEAL } }}>
                <Form form={tissuForm} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item name="tissuName" label="Tissu Name" rules={[{ required: true }]}>
                        <Input placeholder="e.g. Coton, Satin..." />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={8}>
                            <Form.Item name="color" label="Color">
                                <Input placeholder="e.g. Noir, Blanc..." />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="largeur" label="Largeur (cm)">
                                <InputNumber style={{ width: '100%' }} min={0} step={0.01} placeholder="e.g. 1.56" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="unit" label="Unit" rules={[{ required: true }]}>
                                <Select options={[{ value: 'M', label: 'Meters (M)' }, { value: 'kg', label: 'Kilograms (kg)' }]} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} min={0} step={0.5} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="pricePerUnit" label="Price / Unit (MAD)" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} min={0} step={0.5} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            {/* Supply Modal */}
            <Modal title={editingSupply ? 'Edit Supply' : 'Add Supply'} open={supplyModal} onCancel={() => setSupplyModal(false)} onOk={saveSupply}
                okButtonProps={{ style: { background: TEAL, borderColor: TEAL } }}>
                <Form form={supplyForm} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item name="itemName" label="Item Name" rules={[{ required: true }]}>
                        <Input placeholder="e.g. Buttons, Zippers..." />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="category" label="Category">
                                <Input placeholder="e.g. Accessories, Threading..." />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="unit" label="Unit">
                                <Input placeholder="e.g. pcs, meters, rolls..." />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} min={0} step={1} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="pricePerUnit" label="Price / Unit (MAD)" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} min={0} step={0.5} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
}
