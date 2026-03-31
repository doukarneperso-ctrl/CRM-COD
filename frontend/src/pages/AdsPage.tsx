import { useState, useEffect } from 'react';
import {
    Table, Button, Modal, Form, Input, InputNumber, Select, Card, Typography,
    Tag, Space, DatePicker, Row, Col, Statistic, message, Popconfirm,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, DollarOutlined,
    RiseOutlined, CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/client';

const { Title, Text } = Typography;

interface Campaign {
    id: string;
    name: string;
    platform: string;
    budget: number;
    total_spent: number;
    cost_entries: number;
    is_active: boolean;
    start_date: string;
    end_date: string;
    created_at: string;
}

interface DailyCost {
    id: string;
    date: string;
    amount: number;
    impressions: number;
    clicks: number;
    conversions: number;
    notes: string;
}

const platformColors: Record<string, string> = {
    facebook: '#1877F2', instagram: '#E4405F', google: '#4285F4',
    tiktok: '#000000', snapchat: '#FFFC00', other: '#8c8c8c',
};

export default function AdsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [costModalOpen, setCostModalOpen] = useState(false);
    const [editing, setEditing] = useState<Campaign | null>(null);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [dailyCosts, setDailyCosts] = useState<DailyCost[]>([]);
    const [form] = Form.useForm();
    const [costForm] = Form.useForm();

    const fetchCampaigns = async () => {
        setLoading(true);
        try {
            const res = await api.get('/ads/campaigns');
            setCampaigns(res.data.data || []);
        } catch { message.error('Failed to load campaigns'); }
        setLoading(false);
    };

    useEffect(() => { fetchCampaigns(); }, []);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        setModalOpen(true);
    };

    const openEdit = (c: Campaign) => {
        setEditing(c);
        form.setFieldsValue({
            name: c.name, platform: c.platform, budget: c.budget,
            dates: c.start_date && c.end_date ? [dayjs(c.start_date), dayjs(c.end_date)] : undefined,
        });
        setModalOpen(true);
    };

    const handleSave = async (values: any) => {
        try {
            const payload = {
                name: values.name, platform: values.platform, budget: values.budget || 0,
                start_date: values.dates?.[0]?.format('YYYY-MM-DD'),
                end_date: values.dates?.[1]?.format('YYYY-MM-DD'),
            };
            if (editing) {
                await api.put(`/ads/campaigns/${editing.id}`, payload);
                message.success('Campaign updated');
            } else {
                await api.post('/ads/campaigns', payload);
                message.success('Campaign created');
            }
            setModalOpen(false);
            fetchCampaigns();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Save failed');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/ads/campaigns/${id}`);
            message.success('Campaign deleted');
            fetchCampaigns();
        } catch { message.error('Delete failed'); }
    };

    const openCosts = async (c: Campaign) => {
        setSelectedCampaign(c);
        try {
            const res = await api.get(`/ads/campaigns/${c.id}/costs`);
            setDailyCosts(res.data.data || []);
        } catch { setDailyCosts([]); }
        setCostModalOpen(true);
    };

    const addCost = async (values: any) => {
        if (!selectedCampaign) return;
        try {
            await api.post(`/ads/campaigns/${selectedCampaign.id}/costs`, {
                date: values.date.format('YYYY-MM-DD'),
                amount: values.amount, impressions: values.impressions || 0,
                clicks: values.clicks || 0, conversions: values.conversions || 0,
            });
            message.success('Cost added');
            costForm.resetFields();
            const res = await api.get(`/ads/campaigns/${selectedCampaign.id}/costs`);
            setDailyCosts(res.data.data || []);
            fetchCampaigns();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Failed to add cost');
        }
    };

    const totalSpend = campaigns.reduce((s, c) => s + parseFloat(String(c.total_spent)), 0);
    const activeCampaigns = campaigns.filter(c => c.is_active).length;

    const columns = [
        {
            title: 'CAMPAIGN', dataIndex: 'name', key: 'name',
            render: (v: string, r: Campaign) => (
                <Space direction="vertical" size={0}>
                    <Text strong style={{ fontSize: 13 }}>{v}</Text>
                    <Tag color={platformColors[r.platform]} style={{ fontSize: 10, borderRadius: 3, border: 'none', color: r.platform === 'snapchat' ? '#000' : '#fff' }}>
                        {r.platform}
                    </Tag>
                </Space>
            ),
        },
        {
            title: 'BUDGET', dataIndex: 'budget', key: 'budget', width: 110,
            render: (v: number) => <Text style={{ fontWeight: 600 }}>{Number(v).toFixed(0)} MAD</Text>,
        },
        {
            title: 'SPENT', dataIndex: 'total_spent', key: 'spent', width: 110,
            render: (v: number) => <Text style={{ fontWeight: 600, color: '#cf1322' }}>{Number(v).toFixed(0)} MAD</Text>,
        },
        {
            title: 'ENTRIES', dataIndex: 'cost_entries', key: 'entries', width: 80,
            render: (v: number) => <Tag style={{ borderRadius: 10 }}>{v} days</Tag>,
        },
        {
            title: 'STATUS', dataIndex: 'is_active', key: 'status', width: 80,
            render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Active' : 'Paused'}</Tag>,
        },
        {
            title: 'ACTIONS', key: 'actions', width: 130,
            render: (_: any, r: Campaign) => (
                <Space size={0}>
                    <Button type="text" size="small" icon={<DollarOutlined />} onClick={() => openCosts(r)} />
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                    <Popconfirm title="Delete campaign?" onConfirm={() => handleDelete(r.id)}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const costColumns = [
        {
            title: 'DATE', dataIndex: 'date', key: 'date',
            render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
        },
        { title: 'AMOUNT', dataIndex: 'spend', key: 'spend', render: (v: number) => `${Number(v).toFixed(0)} MAD` },
        { title: 'IMPRESSIONS', dataIndex: 'impressions', key: 'imp', render: (v: number) => (v || 0).toLocaleString() },
        { title: 'CLICKS', dataIndex: 'clicks', key: 'clicks' },
        { title: 'CONVERSIONS', dataIndex: 'conversions', key: 'conv' },
    ];

    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>📢 Ad Campaigns</Title>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
                    New Campaign
                </Button>
            </div>

            <Row gutter={12} style={{ marginBottom: 16 }}>
                <Col xs={8}>
                    <Card size="small" style={{ borderLeft: '3px solid #cf1322' }}>
                        <Statistic title="Total Spend" value={totalSpend} suffix="MAD" precision={0}
                            prefix={<DollarOutlined />} valueStyle={{ fontSize: 18, color: '#cf1322' }} />
                    </Card>
                </Col>
                <Col xs={8}>
                    <Card size="small" style={{ borderLeft: '3px solid #52c41a' }}>
                        <Statistic title="Active Campaigns" value={activeCampaigns}
                            prefix={<RiseOutlined />} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
                    </Card>
                </Col>
                <Col xs={8}>
                    <Card size="small" style={{ borderLeft: '3px solid #1890ff' }}>
                        <Statistic title="Total Campaigns" value={campaigns.length}
                            prefix={<CalendarOutlined />} valueStyle={{ fontSize: 18, color: '#1890ff' }} />
                    </Card>
                </Col>
            </Row>

            <Table columns={columns} dataSource={campaigns} rowKey="id" loading={loading} size="small" pagination={false} />

            {/* Create/Edit Modal */}
            <Modal title={editing ? 'Edit Campaign' : 'New Campaign'} open={modalOpen}
                onCancel={() => setModalOpen(false)} footer={null} width={500} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="name" label="Campaign Name" rules={[{ required: true }]}>
                        <Input placeholder="e.g. Summer Sale Facebook" />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col xs={12}>
                            <Form.Item name="platform" label="Platform" rules={[{ required: true }]}>
                                <Select options={[
                                    { value: 'facebook', label: 'Facebook' },
                                    { value: 'instagram', label: 'Instagram' },
                                    { value: 'google', label: 'Google' },
                                    { value: 'tiktok', label: 'TikTok' },
                                    { value: 'snapchat', label: 'Snapchat' },
                                    { value: 'other', label: 'Other' },
                                ]} />
                            </Form.Item>
                        </Col>
                        <Col xs={12}>
                            <Form.Item name="budget" label="Budget (MAD)">
                                <InputNumber style={{ width: '100%' }} min={0} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="dates" label="Date Range">
                        <DatePicker.RangePicker style={{ width: '100%' }} />
                    </Form.Item>
                    <Row justify="end">
                        <Space>
                            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit">{editing ? 'Update' : 'Create'}</Button>
                        </Space>
                    </Row>
                </Form>
            </Modal>

            {/* Daily Costs Modal */}
            <Modal title={`Daily Costs — ${selectedCampaign?.name}`} open={costModalOpen}
                onCancel={() => setCostModalOpen(false)} footer={null} width={700} destroyOnClose>
                <Form form={costForm} layout="inline" onFinish={addCost} style={{ marginBottom: 12 }}>
                    <Form.Item name="date" rules={[{ required: true }]}>
                        <DatePicker placeholder="Date" />
                    </Form.Item>
                    <Form.Item name="amount" rules={[{ required: true }]}>
                        <InputNumber placeholder="Amount" min={0} />
                    </Form.Item>
                    <Form.Item name="impressions">
                        <InputNumber placeholder="Impressions" min={0} />
                    </Form.Item>
                    <Form.Item name="clicks">
                        <InputNumber placeholder="Clicks" min={0} />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" size="small" icon={<PlusOutlined />}>Add</Button>
                    </Form.Item>
                </Form>
                <Table columns={costColumns} dataSource={dailyCosts} rowKey="id" size="small" pagination={false} />
            </Modal>
        </div>
    );
}
