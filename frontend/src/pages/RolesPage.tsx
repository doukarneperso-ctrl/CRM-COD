import { useState, useEffect } from 'react';
import {
    Table, Button, Modal, Form, Input, Card, Typography, Tag, Space,
    Checkbox, Popconfirm, message, Row, Col, Divider, Tooltip,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, SafetyOutlined,
} from '@ant-design/icons';
import api from '../api/client';

const { Title, Text } = Typography;

interface Permission {
    id: string;
    slug: string;
    name: string;
    module?: string;
}

interface Role {
    id: string;
    name: string;
    description: string;
    is_system: boolean;
    user_count: number;
    permissions: Array<{ id: string; slug: string; name: string; module: string }>;
    created_at: string;
}

export default function RolesPage() {
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Role | null>(null);
    const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
    const [form] = Form.useForm();

    const fetchRoles = async () => {
        setLoading(true);
        try {
            const res = await api.get('/roles');
            setRoles(res.data.data || []);
        } catch { message.error('Failed to load roles'); }
        setLoading(false);
    };

    const fetchPermissions = async () => {
        try {
            const res = await api.get('/roles/permissions');
            setPermissions(res.data.data || []);
        } catch { }
    };

    useEffect(() => { fetchRoles(); fetchPermissions(); }, []);

    const openCreate = () => {
        setEditing(null);
        setSelectedPerms([]);
        form.resetFields();
        setModalOpen(true);
    };

    const openEdit = (role: Role) => {
        setEditing(role);
        // Extract permission IDs from the permission objects returned by API
        const permIds = (role.permissions || []).map(p => typeof p === 'string' ? p : p.id);
        setSelectedPerms(permIds);
        form.setFieldsValue({ name: role.name, description: role.description || '' });
        setModalOpen(true);
    };

    const handleSave = async (values: any) => {
        try {
            const payload = { ...values, permissionIds: selectedPerms };
            if (editing) {
                await api.put(`/roles/${editing.id}`, payload);
                message.success('Role updated');
            } else {
                await api.post('/roles', payload);
                message.success('Role created');
            }
            setModalOpen(false);
            fetchRoles();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Save failed');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/roles/${id}`);
            message.success('Role deleted');
            fetchRoles();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Delete failed');
        }
    };

    // Group permissions by module
    const grouped = permissions.reduce((acc, p) => {
        const mod = p.module || 'General';
        if (!acc[mod]) acc[mod] = [];
        acc[mod].push(p);
        return acc;
    }, {} as Record<string, Permission[]>);

    const togglePerm = (permId: string, checked: boolean) => {
        setSelectedPerms(prev => checked
            ? [...prev, permId]
            : prev.filter(id => id !== permId)
        );
    };

    const toggleModule = (modulePerms: Permission[], checked: boolean) => {
        const ids = modulePerms.map(p => p.id);
        setSelectedPerms(prev => {
            const without = prev.filter(id => !ids.includes(id));
            return checked ? [...without, ...ids] : without;
        });
    };

    const roleColors: Record<string, string> = {
        admin: '#8B5A2B', manager: '#1890ff', agent: '#52c41a', call_centre_agent: '#52c41a',
    };

    const columns = [
        {
            title: 'ROLE', dataIndex: 'name', key: 'name',
            render: (v: string, r: Role) => (
                <Space>
                    <Tag
                        color={roleColors[v.toLowerCase()] || '#722ed1'}
                        style={{ borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 600 }}
                    >
                        {v}
                    </Tag>
                    {r.is_system && <Tag style={{ fontSize: 9, borderRadius: 3 }}>System</Tag>}
                </Space>
            ),
        },
        {
            title: 'DESCRIPTION', dataIndex: 'description', key: 'desc',
            render: (v: string) => <Text style={{ fontSize: 12, opacity: 0.7 }}>{v || '—'}</Text>,
        },
        {
            title: 'USERS', dataIndex: 'user_count', key: 'users', width: 80,
            render: (v: number) => <Tag style={{ borderRadius: 10, fontSize: 11 }}>{v}</Tag>,
        },
        {
            title: 'PERMISSIONS', dataIndex: 'permissions', key: 'perms', width: 120,
            render: (v: string[]) => (
                <Text style={{ fontSize: 12, fontWeight: 600, color: '#8B5A2B' }}>
                    {(v || []).length} permissions
                </Text>
            ),
        },
        {
            title: 'ACTIONS', key: 'actions', width: 100,
            render: (_: any, r: Role) => (
                <Space size={0}>
                    <Tooltip title="Edit permissions">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                    </Tooltip>
                    {!r.is_system && (
                        <Popconfirm title="Delete this role?" onConfirm={() => handleDelete(r.id)}>
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
                <Title level={4} style={{ margin: 0 }}>🔐 Roles & Permissions</Title>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
                    Create Role
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={roles}
                rowKey="id"
                loading={loading}
                size="small"
                pagination={false}
            />

            <Modal
                title={editing ? `Edit Role: ${editing.name}` : 'Create New Role'}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                footer={null}
                width={720}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Row gutter={12}>
                        <Col xs={12}>
                            <Form.Item name="name" label="Role Name" rules={[{ required: true }]}>
                                <Input placeholder="e.g. Senior Agent" disabled={editing?.is_system} />
                            </Form.Item>
                        </Col>
                        <Col xs={12}>
                            <Form.Item name="description" label="Description">
                                <Input placeholder="Brief description" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider style={{ margin: '8px 0 12px' }}>
                        <Space><SafetyOutlined /> Permissions ({selectedPerms.length} selected)</Space>
                    </Divider>

                    <div style={{ maxHeight: 350, overflowY: 'auto', paddingRight: 8 }}>
                        {Object.entries(grouped).map(([module, perms]) => {
                            const allChecked = perms.every(p => selectedPerms.includes(p.id));
                            const someChecked = perms.some(p => selectedPerms.includes(p.id));
                            return (
                                <Card
                                    key={module}
                                    size="small"
                                    title={
                                        <Checkbox
                                            checked={allChecked}
                                            indeterminate={someChecked && !allChecked}
                                            onChange={e => toggleModule(perms, e.target.checked)}
                                        >
                                            <Text strong style={{ fontSize: 12, textTransform: 'capitalize' }}>
                                                {module}
                                            </Text>
                                        </Checkbox>
                                    }
                                    style={{ marginBottom: 8 }}
                                    styles={{ body: { padding: '6px 12px' } }}
                                >
                                    <Row gutter={[8, 4]}>
                                        {perms.map(p => (
                                            <Col xs={12} sm={8} key={p.id}>
                                                <Checkbox
                                                    checked={selectedPerms.includes(p.id)}
                                                    onChange={e => togglePerm(p.id, e.target.checked)}
                                                >
                                                    <Text style={{ fontSize: 11 }}>{p.name || p.slug}</Text>
                                                </Checkbox>
                                            </Col>
                                        ))}
                                    </Row>
                                </Card>
                            );
                        })}
                    </div>

                    <Row justify="end" style={{ marginTop: 16 }}>
                        <Space>
                            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit">
                                {editing ? 'Update Role' : 'Create Role'}
                            </Button>
                        </Space>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
}
