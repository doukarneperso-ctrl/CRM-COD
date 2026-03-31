import { useState, useEffect } from 'react';
import {
    Table, Button, Modal, Form, Input, Select, Space, Typography,
    Tag, Popconfirm, message, Card, InputNumber, Divider,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined, MinusCircleOutlined, DollarOutlined,
} from '@ant-design/icons';
import api from '../api/client';
import { useAuthStore } from '../stores/authStore';

const { Title } = Typography;

interface User {
    id: string;
    username: string;
    full_name: string;
    email: string;
    phone: string;
    status: string;
    role_id: string;
    role_name: string;
    created_at: string;
}

interface Role {
    id: string;
    name: string;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [form] = Form.useForm();
    const { hasPermission } = useAuthStore();
    const [products, setProducts] = useState<any[]>([]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await api.get('/users');
            setUsers(res.data.data);
        } catch (err) {
            message.error('Failed to load users');
        }
        setLoading(false);
    };

    const fetchRoles = async () => {
        try {
            const res = await api.get('/roles');
            setRoles(res.data.data);
        } catch { }
    };

    useEffect(() => {
        fetchUsers();
        fetchRoles();
        // Fetch products for commission rule product selection
        api.get('/products').then(r => setProducts(r.data.data || [])).catch(() => {});
    }, []);

    const handleSubmit = async (values: any) => {
        try {
            if (editingUser) {
                await api.put(`/users/${editingUser.id}`, {
                    fullName: values.fullName,
                    email: values.email || undefined,
                    phone: values.phone || undefined,
                    roleId: values.roleId,
                    status: values.status,
                });
                message.success('User updated');
            } else {
                await api.post('/users', {
                    username: values.username,
                    password: values.password,
                    fullName: values.fullName,
                    email: values.email || undefined,
                    phone: values.phone || undefined,
                    roleId: values.roleId,
                    commissionRules: values.commissionRules || [],
                });
                message.success('User created');
            }
            setModalOpen(false);
            form.resetFields();
            setEditingUser(null);
            fetchUsers();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Operation failed');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/users/${id}`);
            message.success('User deleted');
            fetchUsers();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Delete failed');
        }
    };

    const handleResetPassword = async (id: string) => {
        try {
            await api.post(`/users/${id}/reset-password`, { password: 'changeme123' });
            message.success('Password reset to: changeme123');
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Reset failed');
        }
    };

    const openEdit = (user: User) => {
        setEditingUser(user);
        form.setFieldsValue({
            fullName: user.full_name,
            email: user.email,
            phone: user.phone,
            roleId: user.role_id,
            status: user.status,
        });
        setModalOpen(true);
    };

    const openCreate = () => {
        setEditingUser(null);
        form.resetFields();
        setModalOpen(true);
    };

    const columns = [
        {
            title: 'User',
            key: 'user',
            render: (_: any, record: User) => (
                <div>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{record.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>@{record.username}</div>
                </div>
            ),
        },
        {
            title: 'Role',
            dataIndex: 'role_name',
            key: 'role',
            render: (role: string) => (
                <Tag
                    color={role === 'Admin' ? 'gold' : role === 'Manager' ? 'blue' : 'default'}
                    style={{ borderRadius: 6, border: 'none' }}
                >
                    {role}
                </Tag>
            ),
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            render: (v: string) => v || '—',
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <Tag
                    color={status === 'active' ? 'success' : 'error'}
                    style={{ borderRadius: 6, border: 'none', textTransform: 'capitalize' }}
                >
                    {status}
                </Tag>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 150,
            render: (_: any, record: User) => (
                <Space>
                    {hasPermission('edit_users') && (
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => openEdit(record)}
                            style={{ color: '#C18E53' }}
                        />
                    )}
                    {hasPermission('edit_users') && (
                        <Popconfirm
                            title="Reset password to 'changeme123'?"
                            onConfirm={() => handleResetPassword(record.id)}
                        >
                            <Button type="text" icon={<KeyOutlined />} style={{ color: '#faad14' }} />
                        </Popconfirm>
                    )}
                    {hasPermission('delete_users') && (
                        <Popconfirm
                            title="Delete this user?"
                            onConfirm={() => handleDelete(record.id)}
                        >
                            <Button type="text" icon={<DeleteOutlined />} danger />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Title level={4} style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>
                    User Management
                </Title>
                {hasPermission('create_users') && (
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={openCreate}
                        style={{
                            background: 'linear-gradient(135deg, #8B5A2B, #A0693B)',
                            border: 'none',
                            borderRadius: 8,
                            height: 38,
                        }}
                    >
                        Add User
                    </Button>
                )}
            </div>

            <Card
                style={{
                    background: 'rgba(30,22,12,0.8)',
                    border: '1px solid rgba(139,90,43,0.15)',
                    borderRadius: 12,
                }}
                styles={{ body: { padding: 0 } }}
            >
                <Table
                    columns={columns}
                    dataSource={users}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    style={{ background: 'transparent' }}
                />
            </Card>

            {/* Create / Edit Modal */}
            <Modal
                title={editingUser ? 'Edit User' : 'Create User'}
                open={modalOpen}
                onCancel={() => { setModalOpen(false); setEditingUser(null); form.resetFields(); }}
                footer={null}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 16 }}>
                    {!editingUser && (
                        <>
                            <Form.Item name="username" label="Username" rules={[{ required: true, min: 3 }]}>
                                <Input placeholder="e.g. omar_agent" />
                            </Form.Item>
                            <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}>
                                <Input.Password placeholder="At least 6 characters" />
                            </Form.Item>
                        </>
                    )}
                    <Form.Item name="fullName" label="Full Name" rules={[{ required: true }]}>
                        <Input placeholder="Full name" />
                    </Form.Item>
                    <Form.Item name="email" label="Email">
                        <Input placeholder="email@example.com" />
                    </Form.Item>
                    <Form.Item name="phone" label="Phone">
                        <Input placeholder="06XXXXXXXX" />
                    </Form.Item>
                    <Form.Item name="roleId" label="Role" rules={[{ required: true }]}>
                        <Select placeholder="Select role">
                            {roles.map(r => (
                                <Select.Option key={r.id} value={r.id}>{r.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    {editingUser && (
                        <Form.Item name="status" label="Status">
                            <Select>
                                <Select.Option value="active">Active</Select.Option>
                                <Select.Option value="inactive">Inactive</Select.Option>
                            </Select>
                        </Form.Item>
                    )}

                    {/* Commission Rules — only on create */}
                    {!editingUser && (
                        <>
                            <Divider style={{ margin: '12px 0 16px' }}>
                                <Space><DollarOutlined /> Commission Rules</Space>
                            </Divider>
                            <Form.List name="commissionRules">
                                {(fields, { add, remove }) => (
                                    <>
                                        {fields.map(({ key, name, ...restField }) => (
                                            <div key={key} style={{
                                                display: 'flex', gap: 8, alignItems: 'flex-start',
                                                marginBottom: 8, padding: '10px 12px',
                                                background: 'var(--bg-secondary, rgba(139,90,43,0.04))',
                                                borderRadius: 8, border: '1px solid var(--border-secondary, rgba(139,90,43,0.1))',
                                            }}>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'ruleType']}
                                                    rules={[{ required: true, message: 'Type?' }]}
                                                    style={{ flex: 1, margin: 0 }}
                                                >
                                                    <Select placeholder="Type" size="small">
                                                        <Select.Option value="fixed">Fixed (MAD)</Select.Option>
                                                        <Select.Option value="percentage_sale">% of Sale</Select.Option>
                                                        <Select.Option value="percentage_margin">% of Margin</Select.Option>
                                                    </Select>
                                                </Form.Item>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'rate']}
                                                    rules={[{ required: true, message: 'Rate?' }]}
                                                    style={{ width: 90, margin: 0 }}
                                                >
                                                    <InputNumber placeholder="Rate" size="small" min={0} style={{ width: '100%' }} />
                                                </Form.Item>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'productId']}
                                                    style={{ flex: 1, margin: 0 }}
                                                >
                                                    <Select placeholder="All Products" size="small" allowClear>
                                                        {products.map((p: any) => (
                                                            <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                                                        ))}
                                                    </Select>
                                                </Form.Item>
                                                <MinusCircleOutlined
                                                    onClick={() => remove(name)}
                                                    style={{ color: '#ff4d4f', cursor: 'pointer', marginTop: 6 }}
                                                />
                                            </div>
                                        ))}
                                        <Button
                                            type="dashed"
                                            onClick={() => add()}
                                            block
                                            icon={<PlusOutlined />}
                                            size="small"
                                            style={{ borderColor: 'rgba(139,90,43,0.3)', color: '#8B5A2B', marginBottom: 16 }}
                                        >
                                            Add Commission Rule
                                        </Button>
                                    </>
                                )}
                            </Form.List>
                        </>
                    )}
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => { setModalOpen(false); setEditingUser(null); }}>Cancel</Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                style={{ background: 'linear-gradient(135deg, #8B5A2B, #A0693B)', border: 'none' }}
                            >
                                {editingUser ? 'Update' : 'Create'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
