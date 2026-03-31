import { useState, useEffect } from 'react';
import {
    Table, Button, Card, Row, Col, Typography, Tag, Input, Space, Modal,
    Form, Select, InputNumber, Popconfirm, message, Tabs,
    Tooltip,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
    CheckOutlined, CloseOutlined, DollarOutlined, SettingOutlined,
} from '@ant-design/icons';
import api from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { DatePicker } from 'antd';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const statusColors: Record<string, string> = {
    new: 'gold', approved: 'blue', rejected: 'red', paid: 'green',
};

const ruleTypeLabels: Record<string, string> = {
    fixed: 'Fixed MAD', percentage_sale: '% of Sale', percentage_margin: '% of Margin',
};

export default function CommissionsPage() {
    // Commissions list
    const [commissions, setCommissions] = useState<any[]>([]);
    const [stats, setStats] = useState<any>({});
    const [loading, setLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');

    // Commission rules
    const [rules, setRules] = useState<any[]>([]);
    const [ruleModalOpen, setRuleModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<any>(null);
    const [ruleForm] = Form.useForm();
    const [agents, setAgents] = useState<any[]>([]);

    const { hasPermission, isAgent, user } = useAuthStore();

    const fetchCommissions = async () => {
        setLoading(true);
        try {
            const params: any = { pageSize: 50 };
            if (filterStatus) params.status = filterStatus;
            if (filterFrom) params.from = filterFrom;
            if (filterTo) params.to = filterTo;
            // Agent sees only own commissions
            if (isAgent() && user) params.agentId = user.id;
            const res = await api.get('/commissions', { params });
            setCommissions(res.data.data || []);
            setStats(res.data.stats || {});
        } catch { message.error('Failed to load commissions'); }
        setLoading(false);
    };

    const fetchRules = async () => {
        try { const res = await api.get('/commissions/rules'); setRules(res.data.data || []); } catch { }
    };

    const fetchAgents = async () => {
        try { const res = await api.get('/users', { params: { pageSize: 100 } }); setAgents(res.data.data || []); } catch { }
    };

    useEffect(() => { fetchCommissions(); fetchRules(); fetchAgents(); }, []);
    useEffect(() => { fetchCommissions(); }, [filterStatus, filterFrom, filterTo]);

    const handleApprove = async (id: string) => {
        try { await api.post(`/commissions/${id}/approve`); message.success('Commission approved'); fetchCommissions(); }
        catch (err: any) { message.error(err.response?.data?.error?.message || 'Failed'); }
    };

    const handleReject = async (id: string) => {
        const note = await new Promise<string>(resolve => {
            Modal.confirm({
                title: 'Reject Commission',
                content: <Input.TextArea id="reject-note" placeholder="Reason for rejection..." rows={3} />,
                onOk: () => resolve((document.getElementById('reject-note') as HTMLTextAreaElement)?.value || 'Rejected'),
                onCancel: () => resolve(''),
            });
        });
        if (!note) return;
        try { await api.post(`/commissions/${id}/reject`, { note }); message.success('Commission rejected'); fetchCommissions(); }
        catch (err: any) { message.error(err.response?.data?.error?.message || 'Failed'); }
    };

    const handlePay = async (id: string) => {
        try { await api.post(`/commissions/${id}/pay`); message.success('Marked as paid'); fetchCommissions(); }
        catch (err: any) { message.error(err.response?.data?.error?.message || 'Failed'); }
    };

    const openRuleCreate = () => { setEditingRule(null); ruleForm.resetFields(); setRuleModalOpen(true); };
    const openRuleEdit = (r: any) => {
        setEditingRule(r);
        ruleForm.setFieldsValue({ agentId: r.agent_id, ruleType: r.rule_type, rate: parseFloat(r.rate), isActive: r.is_active, notes: r.notes || '' });
        setRuleModalOpen(true);
    };

    const handleSaveRule = async (values: any) => {
        try {
            if (editingRule) {
                await api.put(`/commissions/rules/${editingRule.id}`, values);
                message.success('Rule updated');
            } else {
                await api.post('/commissions/rules', values);
                message.success('Rule created');
            }
            setRuleModalOpen(false);
            fetchRules();
        } catch (err: any) { message.error(err.response?.data?.error?.message || 'Save failed'); }
    };

    const handleDeleteRule = async (id: string) => {
        try { await api.delete(`/commissions/rules/${id}`); message.success('Rule deleted'); fetchRules(); }
        catch { message.error('Delete failed'); }
    };

    const formatAmount = (v: any) => parseFloat(String(v || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' MAD';
    const formatDate = (d: string) => {
        if (!d) return '—';
        const dt = new Date(d); return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    };

    const KPI_CARDS = [
        { label: 'Total Paid', value: formatAmount(stats.total_paid), color: '#52c41a' },
        { label: 'Pending', value: formatAmount(stats.total_pending), color: '#faad14' },
        { label: 'Rejected', value: formatAmount(stats.total_rejected), color: '#ff4d4f' },
    ];

    const commissionColumns = [
        {
            title: 'AGENT', key: 'agent', width: 120,
            render: (_: any, r: any) => <Text style={{ fontSize: 12 }}>{r.agent_name}</Text>,
        },
        {
            title: 'ORDER', key: 'order', width: 90,
            render: (_: any, r: any) => <Text style={{ fontSize: 12 }}>{r.order_number || '—'}</Text>,
        },
        {
            title: 'PRODUCT', key: 'product', width: 120,
            render: (_: any, r: any) => <Text style={{ fontSize: 12 }}>{r.product_name || '—'}</Text>,
        },
        {
            title: 'AMOUNT', dataIndex: 'amount', key: 'amount', width: 110,
            render: (v: any) => <Text strong style={{ fontSize: 12, color: '#8B5A2B' }}>{formatAmount(v)}</Text>,
        },
        {
            title: 'STATUS', dataIndex: 'status', key: 'status', width: 90,
            render: (v: string) => <Tag color={statusColors[v] || 'default'} style={{ borderRadius: 4, border: 'none', fontSize: 11 }}>{v}</Tag>,
        },
        { title: 'DATE', key: 'date', width: 90, render: (_: any, r: any) => <Text style={{ fontSize: 11 }}>{formatDate(r.created_at)}</Text> },
        ...(hasPermission('manage_settings') ? [{
            title: 'ACTIONS', key: 'actions', width: 130,
            render: (_: any, r: any) => (
                <Space size={0}>
                    {r.status === 'new' && (
                        <>
                            <Tooltip title="Approve"><Button type="text" size="small" icon={<CheckOutlined />} style={{ color: '#52c41a' }} onClick={() => handleApprove(r.id)} /></Tooltip>
                            <Tooltip title="Reject"><Button type="text" size="small" icon={<CloseOutlined />} danger onClick={() => handleReject(r.id)} /></Tooltip>
                        </>
                    )}
                    {r.status === 'approved' && (
                        <Tooltip title="Mark as Paid">
                            <Button type="text" size="small" icon={<DollarOutlined />} style={{ color: '#52c41a' }} onClick={() => handlePay(r.id)} />
                        </Tooltip>
                    )}
                </Space>
            ),
        }] : []),
    ];

    const ruleColumns = [
        {
            title: 'AGENT', key: 'agent',
            render: (_: any, r: any) => <Text>{r.agent_name || '— (All agents)'}</Text>,
        },
        {
            title: 'TYPE', dataIndex: 'rule_type', key: 'type', width: 140,
            render: (v: string) => <Tag>{ruleTypeLabels[v] || v}</Tag>,
        },
        {
            title: 'RATE', key: 'rate', width: 100,
            render: (_: any, r: any) => (
                <Text strong>
                    {r.rule_type === 'fixed' ? formatAmount(r.rate) : `${parseFloat(r.rate)}%`}
                </Text>
            ),
        },
        {
            title: 'ACTIVE', dataIndex: 'is_active', key: 'active', width: 70,
            render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Yes' : 'No'}</Tag>,
        },
        {
            title: 'ACTIONS', key: 'actions', width: 100,
            render: (_: any, r: any) => (
                <Space size={0}>
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openRuleEdit(r)} />
                    <Popconfirm title="Delete rule?" onConfirm={() => handleDeleteRule(r.id)}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const tabItems = [
        {
            key: 'commissions',
            label: '💰 Commissions',
            children: (
                <div>
                    <Card styles={{ body: { padding: '10px 14px' } }} style={{ marginBottom: 12 }}>
                        <Row gutter={[8, 8]}>
                            <Col xs={12} sm={6} md={4}>
                                <Select placeholder="Status" allowClear style={{ width: '100%' }} size="small"
                                    onChange={v => setFilterStatus(v || '')}
                                    options={['new', 'approved', 'rejected', 'paid'].map(s => ({ value: s, label: s }))} />
                            </Col>
                            <Col xs={24} sm={14} md={10}>
                                <RangePicker size="small" style={{ width: '100%' }}
                                    onChange={dates => {
                                        setFilterFrom(dates?.[0]?.format('YYYY-MM-DD') || '');
                                        setFilterTo(dates?.[1]?.format('YYYY-MM-DD') || '');
                                    }} />
                            </Col>
                        </Row>
                    </Card>
                    <Table columns={commissionColumns as any} dataSource={commissions} rowKey="id"
                        loading={loading} size="small" pagination={{ pageSize: 20 }} />
                </div>
            ),
        },
        ...(hasPermission('manage_settings') ? [{
            key: 'rules',
            label: <span><SettingOutlined /> Commission Rules</span>,
            children: (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openRuleCreate}>Add Rule</Button>
                    </div>
                    <Table columns={ruleColumns} dataSource={rules} rowKey="id" size="small" pagination={{ pageSize: 20 }} />
                </div>
            ),
        }] : []),
    ];

    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>💰 Commissions</Title>
                <Button icon={<ReloadOutlined />} onClick={() => { fetchCommissions(); fetchRules(); }}>Refresh</Button>
            </div>

            {/* KPI */}
            <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
                {KPI_CARDS.map((c, i) => (
                    <Col xs={24} sm={8} key={i}>
                        <Card styles={{ body: { padding: '12px 14px' } }} style={{ borderLeft: `3px solid ${c.color}` }}>
                            <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>{c.label}</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
                        </Card>
                    </Col>
                ))}
            </Row>

            <Tabs items={tabItems} />

            {/* Rule Modal */}
            <Modal title={editingRule ? 'Edit Rule' : 'Add Commission Rule'}
                open={ruleModalOpen} onCancel={() => setRuleModalOpen(false)} footer={null} destroyOnClose>
                <Form form={ruleForm} layout="vertical" onFinish={handleSaveRule}
                    initialValues={{ isActive: true, ruleType: 'percentage_sale', rate: 5 }}>
                    <Form.Item name="agentId" label="Agent (leave blank for all agents)">
                        <Select allowClear showSearch optionFilterProp="label" placeholder="All agents"
                            options={agents.map((a: any) => ({ value: a.id, label: a.full_name }))} />
                    </Form.Item>
                    <Row gutter={10}>
                        <Col xs={12}>
                            <Form.Item name="ruleType" label="Commission Type" rules={[{ required: true }]}>
                                <Select options={Object.entries(ruleTypeLabels).map(([v, l]) => ({ value: v, label: l }))} />
                            </Form.Item>
                        </Col>
                        <Col xs={12}>
                            <Form.Item name="rate" label="Rate" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} min={0} step={0.5} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="notes" label="Notes">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Row justify="end">
                        <Space>
                            <Button onClick={() => setRuleModalOpen(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit">Save</Button>
                        </Space>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
}
