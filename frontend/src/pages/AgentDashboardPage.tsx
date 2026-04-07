import { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Table, Tag, Progress } from 'antd';
import {
    ShoppingCartOutlined,
    ClockCircleOutlined, PhoneOutlined, TrophyOutlined,
} from '@ant-design/icons';
import api from '../api/client';
import { useAuthStore } from '../stores/authStore';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 12,
};

const confirmColor: Record<string, string> = {
    pending: '#faad14', confirmed: '#52c41a', cancelled: '#ff4d4f',
    unreachable: '#722ed1', fake: '#ff4d4f',
};

export default function AgentDashboardPage() {
    const { user } = useAuthStore();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch = async () => {
            try {
                const res = await api.get('/orders/stats/agent-dashboard');
                setData(res.data.data);
            } catch { /* silent */ }
            setLoading(false);
        };
        fetch();
        const interval = setInterval(fetch, 60000); // refresh every minute
        return () => clearInterval(interval);
    }, []);

    if (loading || !data) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                Loading your dashboard...
            </div>
        );
    }

    const today = data.today || {};
    const week = data.week || {};
    const month = data.month || {};
    const rates = data.confirmation_rates || {};
    const comm = data.commissions || {};

    const queue = data.queue_stats || {};

    const kpis = [
        {
            title: "My Work Queue", value: parseInt(queue.total_assigned) || 0,
            icon: <ShoppingCartOutlined />, color: '#C18E53',
            sub: 'total assigned orders',
        },
        {
            title: 'Pending Queue', value: parseInt(queue.pending) || 0,
            icon: <ClockCircleOutlined />, color: '#faad14',
            sub: 'needs confirmation',
        },
        {
            title: 'Commissions', value: `${comm.earned.toLocaleString()} MAD`,
            icon: <TrophyOutlined />, color: '#722ed1',
            sub: `${comm.pending.toLocaleString()} MAD pending`,
        },
    ];

    // Confirmation rate data for the 3 periods
    const periodRates = [
        { label: 'Yesterday', rate: rates.yesterday, stats: data.yesterday },
        { label: 'Last 7 Days', rate: rates.week, stats: week },
        { label: 'Last 30 Days', rate: rates.month, stats: month },
    ];

    const rateColor = (r: number) => r >= 70 ? '#52c41a' : r >= 40 ? '#faad14' : '#ff4d4f';

    return (
        <div style={{ padding: '16px 20px' }}>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
                <Title level={4} style={{ margin: 0, color: 'var(--text-primary)' }}>
                    👋 Welcome back, {user?.fullName || user?.username}
                </Title>
                <Text style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                    Here's your personal performance overview
                </Text>
            </div>

            {/* KPI Row */}
            <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                {kpis.map((kpi, i) => (
                    <Col xs={12} sm={8} md={8} key={i}>
                        <Card style={{ ...cardStyle, borderLeft: `3px solid ${kpi.color}` }}
                            styles={{ body: { padding: '14px 16px' } }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                        {kpi.title}
                                    </div>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                                        {kpi.value}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                                        {kpi.sub}
                                    </div>
                                </div>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 8,
                                    background: `${kpi.color}15`, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    color: kpi.color, fontSize: 16,
                                }}>
                                    {kpi.icon}
                                </div>
                            </div>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* Confirmation Rates + Today's Breakdown */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                {/* Confirmation Rates */}
                <Col xs={24} md={14}>
                    <Card title={<Text style={{ color: 'var(--text-primary)', fontWeight: 600 }}>📊 Confirmation Rate</Text>}
                        style={cardStyle} styles={{ body: { padding: '16px 20px' } }}>
                        <Row gutter={[16, 16]}>
                            {periodRates.map((p, i) => {
                                const total = parseInt(p.stats?.total_orders) || 0;
                                const confirmed = parseInt(p.stats?.confirmed) || 0;
                                const cancelled = parseInt(p.stats?.cancelled) || 0;
                                return (
                                    <Col xs={24} sm={8} key={i}>
                                        <div style={{
                                            textAlign: 'center', padding: '16px 12px', borderRadius: 10,
                                            background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                                        }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {p.label}
                                            </div>
                                            <Progress
                                                type="circle" size={80}
                                                percent={p.rate}
                                                strokeColor={rateColor(p.rate)}
                                                trailColor="rgba(139,90,43,0.08)"
                                                format={pct => <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 18 }}>{pct}%</span>}
                                            />
                                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                {confirmed}/{total} orders
                                            </div>
                                            {cancelled > 0 && (
                                                <div style={{ fontSize: 10, color: '#ff4d4f', marginTop: 2 }}>
                                                    {cancelled} cancelled
                                                </div>
                                            )}
                                        </div>
                                    </Col>
                                );
                            })}
                        </Row>
                    </Card>
                </Col>

                {/* Today's Breakdown */}
                <Col xs={24} md={10}>
                    <Card title={<Text style={{ color: 'var(--text-primary)', fontWeight: 600 }}>📋 Today's Breakdown</Text>}
                        style={{ ...cardStyle, height: '100%' }} styles={{ body: { padding: '12px 16px' } }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: 'Total Orders', value: parseInt(today.total_orders) || 0, color: '#C18E53' },
                                { label: 'Confirmed', value: parseInt(today.confirmed) || 0, color: '#52c41a' },
                                { label: 'Pending', value: parseInt(today.pending) || 0, color: '#faad14' },
                                { label: 'Cancelled', value: parseInt(today.cancelled) || 0, color: '#ff4d4f' },
                                { label: 'Unreachable', value: parseInt(today.unreachable) || 0, color: '#722ed1' },
                                { label: 'Delivered', value: parseInt(today.delivered) || 0, color: '#52c41a' },
                                { label: 'Returned', value: parseInt(today.returned) || 0, color: '#ff4d4f' },
                            ].map((item, i) => {
                                const total = parseInt(today.total_orders) || 1;
                                return (
                                    <div key={i}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                            <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{item.label}</Text>
                                            <Text style={{ color: item.color, fontWeight: 600, fontSize: 13 }}>{item.value}</Text>
                                        </div>
                                        <Progress
                                            percent={Math.round((item.value / total) * 100)}
                                            showInfo={false} strokeColor={item.color}
                                            trailColor="rgba(139,90,43,0.06)" strokeWidth={4}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* Callbacks + Recent Orders */}
            <Row gutter={[16, 16]}>
                {/* Callbacks Due */}
                <Col xs={24} md={8}>
                    <Card title={<Text style={{ color: '#ff7a45', fontWeight: 600 }}><PhoneOutlined /> My Callbacks</Text>}
                        style={cardStyle} styles={{ body: { padding: '8px 14px' } }}>
                        {(data.callbacks || []).length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {data.callbacks.map((cb: any) => (
                                    <div key={cb.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 10px', borderRadius: 8, background: 'rgba(255,122,69,0.06)',
                                    }}>
                                        <div>
                                            <Text style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                                                {cb.customer_name || cb.order_number}
                                            </Text>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{cb.order_number}</div>
                                        </div>
                                        <Tag color="orange" style={{ fontSize: 10, borderRadius: 4, border: 'none', margin: 0 }}>
                                            {cb.updated_at ? dayjs(cb.updated_at).format('DD/MM HH:mm') : 'Now'}
                                        </Tag>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-tertiary)', fontSize: 12 }}>
                                <PhoneOutlined style={{ fontSize: 20, marginBottom: 6, display: 'block' }} />
                                No callbacks due
                            </div>
                        )}
                    </Card>
                </Col>

                {/* Recent Orders Table */}
                <Col xs={24} md={16}>
                    <Card title={<Text style={{ color: 'var(--text-primary)', fontWeight: 600 }}>🛒 My Recent Orders</Text>}
                        style={cardStyle} styles={{ body: { padding: 0 } }}>
                        <Table
                            dataSource={data.recent_orders || []}
                            rowKey="id"
                            pagination={false}
                            size="small"
                            scroll={{ x: 500 }}
                            columns={[
                                {
                                    title: 'ORDER', key: 'order', width: 100,
                                    render: (_: any, r: any) => (
                                        <div>
                                            <Text style={{ color: '#C18E53', fontWeight: 600, fontSize: 12 }}>{r.order_number}</Text>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                {dayjs(r.created_at).format('DD/MM HH:mm')}
                                            </div>
                                        </div>
                                    ),
                                },
                                {
                                    title: 'CUSTOMER', key: 'customer',
                                    render: (_: any, r: any) => (
                                        <div>
                                            <Text style={{ fontSize: 12, color: 'var(--text-primary)' }}>{r.customer_name}</Text>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{r.customer_city || '—'}</div>
                                        </div>
                                    ),
                                },
                                {
                                    title: 'STATUS', key: 'status', width: 110,
                                    render: (_: any, r: any) => (
                                        <Tag color={confirmColor[r.confirmation_status] || 'default'}
                                            style={{ borderRadius: 6, border: 'none', fontSize: 10 }}>
                                            {r.confirmation_status}
                                        </Tag>
                                    ),
                                },
                                {
                                    title: 'AMOUNT', key: 'amount', width: 90, align: 'right' as const,
                                    render: (_: any, r: any) => (
                                        <Text style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
                                            {parseFloat(r.final_amount || 0).toFixed(0)} MAD
                                        </Text>
                                    ),
                                },
                            ]}
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    );
}
