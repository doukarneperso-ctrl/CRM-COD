import { useState, useEffect } from 'react';
import {
    Table, Button, Modal, Form, Input, Select, Space, Typography,
    Tag, Popconfirm, message, Card, Row, Col, Badge, Drawer, Divider,
    List, DatePicker,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
    PhoneOutlined, EnvironmentOutlined, SendOutlined,
} from '@ant-design/icons';
import api from '../api/client';
import { useAuthStore } from '../stores/authStore';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const TAG_COLORS: Record<string, string> = {
    VIP: 'gold', blacklist: 'red', wholesale: 'blue', repeat: 'green',
    influencer: 'purple', problematic: 'orange', new: 'cyan',
};
const PREDEFINED_TAGS = Object.keys(TAG_COLORS);

export default function CustomersPage() {
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editCustomer, setEditCustomer] = useState<any>(null);
    const [drawerCustomer, setDrawerCustomer] = useState<any>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [form] = Form.useForm();
    const [noteText, setNoteText] = useState('');
    const [customerNotes, setCustomerNotes] = useState<any[]>([]);
    const [customerOrders, setCustomerOrders] = useState<any[]>([]);
    const [filters, setFilters] = useState({ search: '', city: '', tag: '', dateFrom: '', dateTo: '' });
    const { hasPermission } = useAuthStore();

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const params: any = { pageSize: 20 };
            Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
            const res = await api.get('/customers', { params });
            setCustomers(res.data.data);
        } catch { message.error('Failed to load customers'); }
        setLoading(false);
    };

    useEffect(() => { fetchCustomers(); }, [filters]);

    const handleCreate = async (values: any) => {
        try {
            await api.post('/customers', values);
            message.success('Customer created');
            setModalOpen(false);
            form.resetFields();
            fetchCustomers();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Create failed');
        }
    };

    const handleUpdate = async (values: any) => {
        if (!editCustomer) return;
        try {
            await api.put(`/customers/${editCustomer.id}`, values);
            message.success('Customer updated');
            setModalOpen(false);
            setEditCustomer(null);
            form.resetFields();
            fetchCustomers();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Update failed');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/customers/${id}`);
            message.success('Customer deleted');
            fetchCustomers();
            if (drawerCustomer?.id === id) { setDrawerOpen(false); setDrawerCustomer(null); }
        } catch { message.error('Delete failed'); }
    };

    const addTag = async (customerId: string, tag: string) => {
        try {
            await api.post(`/customers/${customerId}/tags`, { tag });
            message.success(`Tag "${tag}" added`);
            fetchCustomers();
            if (drawerCustomer?.id === customerId) viewCustomer(customerId);
        } catch (err: any) { message.error(err.response?.data?.error?.message || 'Add tag failed'); }
    };

    const removeTag = async (customerId: string, tag: string) => {
        try {
            await api.delete(`/customers/${customerId}/tags/${tag}`);
            message.success(`Tag removed`);
            fetchCustomers();
            if (drawerCustomer?.id === customerId) viewCustomer(customerId);
        } catch { message.error('Remove tag failed'); }
    };

    const viewCustomer = async (id: string) => {
        try {
            const res = await api.get(`/customers/${id}`);
            setDrawerCustomer(res.data.data);

            // Fetch notes
            try {
                const notesRes = await api.get(`/customers/${id}/notes`);
                setCustomerNotes(notesRes.data.data || []);
            } catch { setCustomerNotes([]); }

            // Fetch customer orders
            try {
                const ordersRes = await api.get('/orders', { params: { search: res.data.data.phone, pageSize: 10 } });
                setCustomerOrders(ordersRes.data.data || []);
            } catch { setCustomerOrders([]); }

            setDrawerOpen(true);
        } catch { message.error('Failed to load customer'); }
    };

    const addNote = async () => {
        if (!drawerCustomer || !noteText.trim()) return;
        try {
            await api.post(`/customers/${drawerCustomer.id}/notes`, { note: noteText.trim() });
            message.success('Note added');
            setNoteText('');
            const notesRes = await api.get(`/customers/${drawerCustomer.id}/notes`);
            setCustomerNotes(notesRes.data.data || []);
        } catch { message.error('Add note failed'); }
    };

    const openEdit = (c: any) => {
        setEditCustomer(c);
        form.setFieldsValue({
            fullName: c.full_name, phone: c.phone,
            email: c.email, address: c.address, city: c.city,
        });
        setModalOpen(true);
    };

    // Extract unique cities from current customer list for filter
    const cities = [...new Set(customers.map(c => c.city).filter(Boolean))];

    const columns = [
        {
            title: 'Customer', key: 'name', ellipsis: true,
            render: (_: any, r: any) => (
                <div>
                    <Text style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{r.full_name}</Text>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        <PhoneOutlined /> {r.phone}
                    </div>
                </div>
            ),
        },
        {
            title: 'City', dataIndex: 'city', key: 'city', width: 120, responsive: ['md' as const],
            render: (v: string) => v ? (
                <span style={{ color: 'var(--text-secondary)' }}><EnvironmentOutlined /> {v}</span>
            ) : '—',
        },
        {
            title: 'Tags', key: 'tags', width: 180, responsive: ['lg' as const],
            render: (_: any, r: any) => {
                const tags = Array.isArray(r.tags) ? r.tags : [];
                return (
                    <Space wrap size={4}>
                        {tags.map((t: string) => (
                            <Tag key={t} color={TAG_COLORS[t] || 'default'} closable
                                onClose={(e: any) => { e.preventDefault(); removeTag(r.id, t); }}
                                style={{ borderRadius: 6, border: 'none' }}>
                                {t}
                            </Tag>
                        ))}
                    </Space>
                );
            },
        },
        {
            title: 'Orders', key: 'orders', width: 80, align: 'center' as const,
            render: (_: any, r: any) => (
                <Badge count={r.total_orders || 0} style={{ backgroundColor: '#C18E53' }} showZero />
            ),
        },
        {
            title: 'Actions', key: 'actions', width: 130, fixed: 'right' as const,
            render: (_: any, r: any) => (
                <Space size={4}>
                    <Button type="text" icon={<EyeOutlined />} onClick={() => viewCustomer(r.id)} style={{ color: '#C18E53' }} />
                    <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} style={{ color: '#C18E53' }} />
                    {hasPermission('edit_customers') && (
                        <Popconfirm title="Delete customer?" onConfirm={() => handleDelete(r.id)}>
                            <Button type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <Title level={4} style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>Customers</Title>
                {hasPermission('create_customers') && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setEditCustomer(null); setModalOpen(true); }}
                        style={{ background: 'linear-gradient(135deg, #8B5A2B, #A0693B)', border: 'none', borderRadius: 8, height: 38 }}>
                        Add Customer
                    </Button>
                )}
            </div>

            {/* Filter bar */}
            <Card style={{ background: 'rgba(30,22,12,0.6)', border: '1px solid rgba(139,90,43,0.1)', borderRadius: 10, marginBottom: 16 }}
                styles={{ body: { padding: '12px 16px' } }}>
                <Row gutter={[12, 12]} align="middle">
                    <Col xs={24} sm={12} md={7}>
                        <Input.Search placeholder="Name or phone..." onSearch={(v) => setFilters(f => ({ ...f, search: v }))} allowClear />
                    </Col>
                    <Col xs={12} sm={6} md={4}>
                        <Select placeholder="City" allowClear style={{ width: '100%' }}
                            onChange={(v) => setFilters(f => ({ ...f, city: v || '' }))}
                            options={cities.map(c => ({ value: c, label: c }))} />
                    </Col>
                    <Col xs={12} sm={6} md={4}>
                        <Select placeholder="Tag" allowClear style={{ width: '100%' }}
                            onChange={(v) => setFilters(f => ({ ...f, tag: v || '' }))}
                            options={PREDEFINED_TAGS.map(t => ({ value: t, label: t }))} />
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <RangePicker size="middle" style={{ width: '100%' }}
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

            {/* Table */}
            <Card style={{ background: 'rgba(30,22,12,0.8)', border: '1px solid rgba(139,90,43,0.15)', borderRadius: 12 }}
                styles={{ body: { padding: 0 } }}>
                <Table columns={columns} dataSource={customers} rowKey="id" loading={loading}
                    pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }}
                    scroll={{ x: 700 }} />
            </Card>

            {/* Create/Edit Modal */}
            <Modal title={editCustomer ? 'Edit Customer' : 'Add Customer'} open={modalOpen}
                onCancel={() => { setModalOpen(false); setEditCustomer(null); }}
                footer={null} destroyOnClose width={520}>
                <Form form={form} layout="vertical" onFinish={editCustomer ? handleUpdate : handleCreate}
                    style={{ marginTop: 16 }}>
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="fullName" label="Full Name" rules={[{ required: true }]}>
                                <Input placeholder="Full name" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="phone" label="Phone" rules={[{ required: true, min: 5 }]}>
                                <Input placeholder="06XXXXXXXX" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="email" label="Email"><Input placeholder="email@example.com" /></Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="city" label="City"><Input placeholder="City" /></Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="address" label="Address"><Input.TextArea rows={2} placeholder="Full address" /></Form.Item>
                    <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
                        <Space>
                            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit"
                                style={{ background: 'linear-gradient(135deg, #8B5A2B, #A0693B)', border: 'none' }}>
                                {editCustomer ? 'Save Changes' : 'Create Customer'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Customer Detail Drawer */}
            <Drawer title="Customer Profile" open={drawerOpen}
                onClose={() => { setDrawerOpen(false); setDrawerCustomer(null); }}
                width={500} styles={{ body: { background: 'var(--bg-elevated)' } }}>
                {drawerCustomer && (
                    <div>
                        {/* Info card */}
                        <Card size="small" style={{ background: 'rgba(139,90,43,0.08)', border: '1px solid rgba(139,90,43,0.15)', borderRadius: 10, marginBottom: 16 }}>
                            <Title level={5} style={{ color: 'var(--text-primary)', margin: 0 }}>{drawerCustomer.full_name}</Title>
                            <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
                                <div><PhoneOutlined /> {drawerCustomer.phone}</div>
                                {drawerCustomer.email && <div style={{ marginTop: 4 }}>✉️ {drawerCustomer.email}</div>}
                                {drawerCustomer.city && <div style={{ marginTop: 4 }}><EnvironmentOutlined /> {drawerCustomer.city}</div>}
                                {drawerCustomer.address && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>{drawerCustomer.address}</div>}
                            </div>
                            <div style={{ marginTop: 12 }}>
                                <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Total Orders: </Text>
                                <Badge count={drawerCustomer.total_orders || 0} style={{ backgroundColor: '#C18E53' }} showZero />
                            </div>
                        </Card>

                        {/* Tags */}
                        <Divider style={{ borderColor: 'rgba(139,90,43,0.15)' }}>Tags</Divider>
                        <Space wrap style={{ marginBottom: 12 }}>
                            {(Array.isArray(drawerCustomer.tags) ? drawerCustomer.tags : []).map((t: string) => (
                                <Tag key={t} color={TAG_COLORS[t] || 'default'} closable
                                    onClose={(e: any) => { e.preventDefault(); removeTag(drawerCustomer.id, t); }}
                                    style={{ borderRadius: 6, border: 'none' }}>
                                    {t}
                                </Tag>
                            ))}
                        </Space>
                        <div>
                            <Select placeholder="Add tag..." style={{ width: 160 }} size="small"
                                onChange={(v) => { addTag(drawerCustomer.id, v); }}
                                options={PREDEFINED_TAGS.filter(t => !(drawerCustomer.tags || []).includes(t))
                                    .map(t => ({ value: t, label: t }))} />
                        </div>

                        {/* Notes */}
                        <Divider style={{ borderColor: 'rgba(139,90,43,0.15)' }}>Notes</Divider>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            <Input placeholder="Add a note..." value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                onPressEnter={addNote} />
                            <Button type="primary" icon={<SendOutlined />} onClick={addNote}
                                style={{ background: '#8B5A2B', border: 'none' }} />
                        </div>
                        {customerNotes.length > 0 ? (
                            <List dataSource={customerNotes} size="small"
                                renderItem={(note: any) => (
                                    <List.Item style={{ borderBottom: '1px solid rgba(139,90,43,0.08)', padding: '8px 0' }}>
                                        <div>
                                            <Paragraph style={{ color: 'var(--text-primary)', marginBottom: 2, fontSize: 13 }}>{note.note}</Paragraph>
                                            <Text style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                                                {note.created_by_name} — {new Date(note.created_at).toLocaleString()}
                                            </Text>
                                        </div>
                                    </List.Item>
                                )} />
                        ) : (
                            <Text style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>No notes yet</Text>
                        )}

                        {/* Order History */}
                        <Divider style={{ borderColor: 'rgba(139,90,43,0.15)' }}>Order History</Divider>
                        {customerOrders.length > 0 ? (
                            <List dataSource={customerOrders} size="small"
                                renderItem={(order: any) => (
                                    <List.Item style={{ borderBottom: '1px solid rgba(139,90,43,0.08)', padding: '8px 0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                            <div>
                                                <Text style={{ color: '#C18E53', fontWeight: 600, fontSize: 13 }}>{order.order_number}</Text>
                                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                                    {new Date(order.created_at).toLocaleDateString()}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <Tag color={order.confirmation_status === 'confirmed' ? 'green' : order.confirmation_status === 'cancelled' ? 'red' : 'gold'}
                                                    style={{ borderRadius: 6, border: 'none', fontSize: 11 }}>
                                                    {order.confirmation_status}
                                                </Tag>
                                                <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 13 }}>
                                                    {parseFloat(order.final_amount || 0).toFixed(0)} MAD
                                                </div>
                                            </div>
                                        </div>
                                    </List.Item>
                                )} />
                        ) : (
                            <Text style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>No orders found</Text>
                        )}
                    </div>
                )}
            </Drawer>
        </div>
    );
}
