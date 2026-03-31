import { useState, useEffect } from 'react';
import {
    Table, Button, Card, Row, Col, Typography, Tag, Input, Space,
    Modal, Form, Select, DatePicker, InputNumber, Popconfirm, message,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
    DollarOutlined, CheckCircleOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import api from '../api/client';
import { useAuthStore } from '../stores/authStore';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const statusColors: Record<string, string> = {
    pending: 'gold', approved: 'blue', paid: 'green',
};

export default function ExpensesPage() {
    const [expenses, setExpenses] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [stats, setStats] = useState<any>({});
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<any>(null);
    const [form] = Form.useForm();
    const [catModalOpen, setCatModalOpen] = useState(false);
    const [catForm] = Form.useForm();
    const [filters, setFilters] = useState({ search: '', status: '', categoryId: '', from: '', to: '' });
    const { hasPermission } = useAuthStore();

    const fetchExpenses = async () => {
        setLoading(true);
        try {
            const params: any = { pageSize: 50 };
            Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
            const res = await api.get('/expenses', { params });
            setExpenses(res.data.data || []);
            setStats(res.data.stats || {});
        } catch { message.error('Failed to load expenses'); }
        setLoading(false);
    };

    const fetchCategories = async () => {
        try { const res = await api.get('/expenses/categories'); setCategories(res.data.data || []); } catch { }
    };

    useEffect(() => { fetchCategories(); }, []);
    useEffect(() => { fetchExpenses(); }, [filters]);

    const openCreate = () => { setEditingExpense(null); form.resetFields(); setModalOpen(true); };
    const openEdit = (e: any) => {
        setEditingExpense(e);
        form.setFieldsValue({
            categoryId: e.category_id, description: e.description,
            amount: parseFloat(e.amount), status: e.status, notes: e.notes || '',
            isRecurring: e.is_recurring,
        });
        setModalOpen(true);
    };

    const handleSave = async (values: any) => {
        try {
            const payload = {
                ...values,
                expenseDate: values.expenseDate?.format('YYYY-MM-DD') || new Date().toISOString().slice(0, 10),
            };
            if (editingExpense) {
                await api.put(`/expenses/${editingExpense.id}`, payload);
                message.success('Expense updated');
            } else {
                await api.post('/expenses', payload);
                message.success('Expense added');
            }
            setModalOpen(false);
            fetchExpenses();
        } catch (err: any) { message.error(err.response?.data?.error?.message || 'Save failed'); }
    };

    const handleDelete = async (id: string) => {
        try { await api.delete(`/expenses/${id}`); message.success('Deleted'); fetchExpenses(); }
        catch { message.error('Delete failed'); }
    };

    const handleCreateCategory = async (values: any) => {
        try {
            await api.post('/expenses/categories', values);
            message.success('Category created');
            setCatModalOpen(false); catForm.resetFields();
            fetchCategories();
        } catch { message.error('Failed to create category'); }
    };

    const formatAmount = (v: any) => parseFloat(String(v || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' MAD';
    const formatDate = (d: string) => {
        if (!d) return '—';
        const dt = new Date(d);
        return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    };

    const KPI_CARDS = [
        { label: 'Total Paid', value: formatAmount(stats.total_paid), color: '#52c41a', icon: <CheckCircleOutlined /> },
        { label: 'Pending', value: formatAmount(stats.total_pending), color: '#faad14', icon: <ClockCircleOutlined /> },
        { label: 'Total All', value: formatAmount(stats.total_all), color: '#8B5A2B', icon: <DollarOutlined /> },
    ];

    const columns = [
        {
            title: 'DATE', dataIndex: 'expense_date', key: 'date', width: 90,
            render: (v: string) => <Text style={{ fontSize: 12 }}>{formatDate(v)}</Text>,
        },
        {
            title: 'DESCRIPTION', dataIndex: 'description', key: 'desc',
            render: (v: string, r: any) => (
                <div>
                    <Text style={{ fontSize: 12 }}>{v}</Text>
                    {r.is_recurring && <Tag style={{ marginLeft: 6, fontSize: 10 }} color="blue">Recurring</Tag>}
                    {r.notes && <div style={{ fontSize: 10, opacity: 0.5 }}>{r.notes}</div>}
                </div>
            ),
        },
        {
            title: 'CATEGORY', key: 'category', width: 110,
            render: (_: any, r: any) => r.category_name
                ? <Tag style={{ borderRadius: 4, border: 'none', background: `${r.category_color}22`, color: r.category_color || '#8B5A2B', fontSize: 11 }}>{r.category_name}</Tag>
                : <Text type="secondary">—</Text>,
        },
        {
            title: 'AMOUNT', dataIndex: 'amount', key: 'amount', width: 110,
            render: (v: any) => <Text strong style={{ fontSize: 12, color: '#8B5A2B' }}>{formatAmount(v)}</Text>,
        },
        {
            title: 'STATUS', dataIndex: 'status', key: 'status', width: 90,
            render: (v: string) => <Tag color={statusColors[v] || 'default'} style={{ borderRadius: 4, border: 'none', fontSize: 11 }}>{v}</Tag>,
        },
        {
            title: 'ADDED BY', key: 'by', width: 100,
            render: (_: any, r: any) => <Text style={{ fontSize: 11, opacity: 0.7 }}>{r.created_by_name}</Text>,
        },
        {
            title: 'ACTIONS', key: 'actions', width: 80,
            render: (_: any, r: any) => (
                <Space size={0}>
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                    {hasPermission('create_expenses') && (
                        <Popconfirm title="Delete expense?" onConfirm={() => handleDelete(r.id)}>
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>💸 Expenses</Title>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={fetchExpenses}>Refresh</Button>
                    {hasPermission('manage_settings') && (
                        <Button onClick={() => setCatModalOpen(true)}>+ Category</Button>
                    )}
                    {hasPermission('create_expenses') && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Expense</Button>
                    )}
                </Space>
            </div>

            {/* KPI Cards */}
            <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
                {KPI_CARDS.map((c, i) => (
                    <Col xs={24} sm={8} key={i}>
                        <Card styles={{ body: { padding: '12px 14px' } }} style={{ borderLeft: `3px solid ${c.color}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', marginBottom: 2 }}>{c.label}</div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</div>
                                </div>
                                <div style={{ fontSize: 22, color: c.color, opacity: 0.6 }}>{c.icon}</div>
                            </div>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* Filters */}
            <Card styles={{ body: { padding: '10px 14px' } }} style={{ marginBottom: 12 }}>
                <Row gutter={[8, 8]} align="middle">
                    <Col xs={24} sm={8} md={6}>
                        <Input.Search placeholder="Search description..." allowClear size="small"
                            onSearch={v => setFilters(f => ({ ...f, search: v }))} />
                    </Col>
                    <Col xs={12} sm={6} md={4}>
                        <Select placeholder="Status" allowClear style={{ width: '100%' }} size="small"
                            onChange={v => setFilters(f => ({ ...f, status: v || '' }))}
                            options={['pending', 'approved', 'paid'].map(s => ({ value: s, label: s }))} />
                    </Col>
                    <Col xs={12} sm={6} md={4}>
                        <Select placeholder="Category" allowClear style={{ width: '100%' }} size="small"
                            onChange={v => setFilters(f => ({ ...f, categoryId: v || '' }))}
                            options={categories.map((c: any) => ({ value: c.id, label: c.name }))} />
                    </Col>
                    <Col xs={24} sm={10} md={6}>
                        <RangePicker size="small" style={{ width: '100%' }}
                            onChange={dates => setFilters(f => ({
                                ...f,
                                from: dates?.[0]?.format('YYYY-MM-DD') || '',
                                to: dates?.[1]?.format('YYYY-MM-DD') || '',
                            }))} />
                    </Col>
                </Row>
            </Card>

            <Table columns={columns} dataSource={expenses} rowKey="id" loading={loading}
                size="small" pagination={{ pageSize: 20, showSizeChanger: true }} />

            {/* Add/Edit Expense Modal */}
            <Modal title={editingExpense ? 'Edit Expense' : 'Add Expense'}
                open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={handleSave}
                    initialValues={{ status: 'pending', isRecurring: false }}>
                    <Form.Item name="description" label="Description" rules={[{ required: true }]}>
                        <Input placeholder="Expense description" />
                    </Form.Item>
                    <Row gutter={10}>
                        <Col xs={12}>
                            <Form.Item name="amount" label="Amount (MAD)" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} min={0} step={10} />
                            </Form.Item>
                        </Col>
                        <Col xs={12}>
                            <Form.Item name="expenseDate" label="Date" rules={[{ required: true }]}>
                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={10}>
                        <Col xs={12}>
                            <Form.Item name="categoryId" label="Category">
                                <Select allowClear placeholder="Select..." options={categories.map((c: any) => ({ value: c.id, label: c.name }))} />
                            </Form.Item>
                        </Col>
                        <Col xs={12}>
                            <Form.Item name="status" label="Status">
                                <Select options={['pending', 'approved', 'paid'].map(s => ({ value: s, label: s }))} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="notes" label="Notes">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Row justify="end">
                        <Space>
                            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit">Save</Button>
                        </Space>
                    </Row>
                </Form>
            </Modal>

            {/* Create Category Modal */}
            <Modal title="New Expense Category" open={catModalOpen}
                onCancel={() => { setCatModalOpen(false); catForm.resetFields(); }} footer={null}>
                <Form form={catForm} layout="vertical" onFinish={handleCreateCategory}>
                    <Form.Item name="name" label="Category Name" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="color" label="Color (hex)" initialValue="#8B5E3C">
                        <Input placeholder="#8B5E3C" />
                    </Form.Item>
                    <Row justify="end">
                        <Space>
                            <Button onClick={() => { setCatModalOpen(false); catForm.resetFields(); }}>Cancel</Button>
                            <Button type="primary" htmlType="submit">Create</Button>
                        </Space>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
}
