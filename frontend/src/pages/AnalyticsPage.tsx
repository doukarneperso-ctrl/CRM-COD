import { useState, useEffect } from 'react';
import {
    Card, Row, Col, Typography, Table, Tabs, Statistic, DatePicker, Button, Select, Tag, Space,
} from 'antd';
import {
    BarChartOutlined, ReloadOutlined, ShopOutlined, UserOutlined, TeamOutlined,
    RiseOutlined, FallOutlined, DollarOutlined,
} from '@ant-design/icons';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
    AreaChart, Area, Legend,
} from 'recharts';
import api from '../api/client';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const formatAmount = (v: any) => parseFloat(String(v || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' MAD';
const pct = (v: any) => `${parseFloat(String(v || 0)).toFixed(1)}%`;

export default function AnalyticsPage() {
    const [dateRange, setDateRange] = useState<[string, string] | null>(null);
    const [loading, setLoading] = useState(false);

    // Data states
    const [dashboard, setDashboard] = useState<any>(null);
    const [charts, setCharts] = useState<any[]>([]);
    const [cities, setCities] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [agents, setAgents] = useState<any[]>([]);
    const [profitability, setProfitability] = useState<any>(null);

    const params = () => {
        const p: any = {};
        if (dateRange) { p.from = dateRange[0]; p.to = dateRange[1]; }
        return p;
    };

    const fetchAll = async () => {
        setLoading(true);
        const p = params();
        try {
            const [dashRes, chartRes, cityRes, prodRes, agentRes, profRes] = await Promise.all([
                api.get('/analytics/dashboard', { params: p }),
                api.get('/analytics/charts', { params: { ...p, groupBy: 'day' } }),
                api.get('/analytics/cities', { params: p }),
                api.get('/analytics/products', { params: p }),
                api.get('/analytics/agents', { params: p }),
                api.get('/analytics/profitability', { params: p }),
            ]);
            setDashboard(dashRes.data.data);
            setCharts(chartRes.data.data || []);
            setCities(cityRes.data.data || []);
            setProducts(prodRes.data.data || []);
            setAgents(agentRes.data.data || []);
            setProfitability(profRes.data.data || null);
        } catch { }
        setLoading(false);
    };

    useEffect(() => { fetchAll(); }, []);

    const kpis = dashboard?.kpis || {};
    const prof = profitability || {};

    // ── Overview Tab ──
    const overviewTab = (
        <div>
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                {[
                    { label: 'Total Orders', value: kpis.total_orders || 0, color: '#8B5A2B', icon: <BarChartOutlined /> },
                    { label: 'Confirmed', value: kpis.confirmed_orders || 0, suffix: pct(kpis.confirmation_rate), color: '#52c41a', icon: <RiseOutlined /> },
                    { label: 'Delivered', value: kpis.delivered_orders || 0, suffix: pct(kpis.delivery_rate), color: '#1890ff', icon: <ShopOutlined /> },
                    { label: 'Revenue', value: formatAmount(kpis.total_revenue), color: '#C18E53', isText: true, icon: <DollarOutlined /> },
                    { label: 'Gross Profit', value: formatAmount(prof.gross_profit), color: '#52c41a', isText: true, icon: <RiseOutlined /> },
                    { label: 'Net Profit', value: formatAmount(prof.net_profit), color: parseFloat(prof.net_profit || 0) >= 0 ? '#52c41a' : '#ff4d4f', isText: true, icon: parseFloat(prof.net_profit || 0) >= 0 ? <RiseOutlined /> : <FallOutlined /> },
                ].map((c, i) => (
                    <Col xs={12} sm={8} md={4} key={i}>
                        <Card styles={{ body: { padding: '12px 14px' } }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                {c.isText
                                    ? <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</div>
                                    : <Statistic value={c.value as number} valueStyle={{ fontSize: 18, fontWeight: 700, color: c.color }} />
                                }
                                <div style={{ fontSize: 18, color: c.color, opacity: 0.5 }}>{c.icon}</div>
                            </div>
                            <div style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase', marginTop: 2 }}>
                                {c.label} {c.suffix && <Tag style={{ fontSize: 10, padding: '0 4px', marginLeft: 4, borderRadius: 4, border: 'none' }} color="green">{c.suffix}</Tag>}
                            </div>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* Revenue + Orders chart */}
            <Card size="small" title="Revenue & Orders Trend" style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
                <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={charts.map(c => ({
                        ...c,
                        date: new Date(c.period).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                        revenue: parseFloat(c.revenue || 0),
                        orders: parseInt(c.orders || 0),
                        delivered: parseInt(c.delivered || 0),
                    }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,90,43,0.1)" />
                        <XAxis dataKey="date" fontSize={10} />
                        <YAxis yAxisId="left" fontSize={10} />
                        <YAxis yAxisId="right" orientation="right" fontSize={10} />
                        <RTooltip
                            contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 12 }}
                            formatter={(v: number, name: string) => [name === 'revenue' ? formatAmount(v) : v, name]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#C18E53" fill="rgba(193,142,83,0.15)" strokeWidth={2} name="Revenue" />
                        <Area yAxisId="right" type="monotone" dataKey="orders" stroke="#1890ff" fill="rgba(24,144,255,0.1)" strokeWidth={2} name="Orders" />
                    </AreaChart>
                </ResponsiveContainer>
            </Card>

            {/* Profitability breakdown */}
            {profitability && (
                <Card size="small" title="Profitability Breakdown" styles={{ body: { padding: 12 } }}>
                    <Row gutter={[8, 8]}>
                        {[
                            { label: 'Gross Revenue', value: prof.gross_revenue, color: '#8B5A2B' },
                            { label: 'COGS', value: prof.cogs, color: '#ff7a45', neg: true },
                            { label: 'Shipping', value: prof.shipping_costs, color: '#fa8c16', neg: true },
                            { label: 'Expenses', value: prof.expenses, color: '#ff4d4f', neg: true },
                            { label: 'Ad Spend', value: prof.ad_spend, color: '#eb2f96', neg: true },
                            { label: 'Commissions', value: prof.commissions, color: '#722ed1', neg: true },
                        ].map((item, i) => (
                            <Col xs={12} sm={8} md={4} key={i}>
                                <div style={{ padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 8, borderLeft: `3px solid ${item.color}` }}>
                                    <div style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase' }}>{item.label}</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: item.color }}>
                                        {item.neg ? '−' : ''}{formatAmount(item.value)}
                                    </div>
                                </div>
                            </Col>
                        ))}
                    </Row>
                    <div style={{ marginTop: 12, padding: '8px 12px', background: parseFloat(prof.net_profit || 0) >= 0 ? 'rgba(82,196,26,0.08)' : 'rgba(255,77,79,0.08)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong style={{ fontSize: 13 }}>Net Profit</Text>
                        <Text strong style={{ fontSize: 16, color: parseFloat(prof.net_profit || 0) >= 0 ? '#52c41a' : '#ff4d4f' }}>{formatAmount(prof.net_profit)}</Text>
                    </div>
                </Card>
            )}
        </div>
    );

    // ── By City Tab ──
    const cityColumns = [
        { title: 'CITY', dataIndex: 'city', key: 'city', render: (v: string) => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
        { title: 'ORDERS', dataIndex: 'total_orders', key: 'orders', width: 80, sorter: (a: any, b: any) => a.total_orders - b.total_orders, render: (v: number) => <Text style={{ fontSize: 12 }}>{v}</Text> },
        { title: 'DELIVERED', dataIndex: 'delivered', key: 'delivered', width: 90, render: (v: number) => <Tag color="blue" style={{ border: 'none', borderRadius: 4, fontSize: 11 }}>{v}</Tag> },
        { title: 'RETURNED', dataIndex: 'returned', key: 'returned', width: 90, render: (v: number) => <Tag color={v > 0 ? 'red' : 'default'} style={{ border: 'none', borderRadius: 4, fontSize: 11 }}>{v}</Tag> },
        {
            title: 'DELIVERY %', key: 'rate', width: 100,
            render: (_: any, r: any) => {
                const rate = r.total_orders > 0 ? ((r.delivered / r.total_orders) * 100).toFixed(1) : 0;
                return <Text style={{ fontSize: 12, fontWeight: 600 }}>{rate}%</Text>;
            },
        },
        { title: 'REVENUE', dataIndex: 'revenue', key: 'revenue', width: 120, sorter: (a: any, b: any) => a.revenue - b.revenue, render: (v: any) => <Text strong style={{ fontSize: 12, color: '#8B5A2B' }}>{formatAmount(v)}</Text> },
    ];

    const cityTab = (
        <div>
            <Card size="small" title="Orders by City" style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
                <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={cities.slice(0, 12).map(c => ({ ...c, revenue: parseFloat(c.revenue || 0), total_orders: parseInt(c.total_orders || 0) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,90,43,0.1)" />
                        <XAxis dataKey="city" fontSize={10} angle={-30} textAnchor="end" height={60} />
                        <YAxis fontSize={10} />
                        <RTooltip contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="total_orders" fill="#C18E53" name="Orders" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="delivered" fill="#52c41a" name="Delivered" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="returned" fill="#ff4d4f" name="Returned" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </Card>
            <Table columns={cityColumns} dataSource={cities} rowKey="city" size="small" pagination={{ pageSize: 15 }} loading={loading} />
        </div>
    );

    // ── By Product Tab ──
    const productColumns = [
        { title: 'PRODUCT', dataIndex: 'product', key: 'product', render: (v: string) => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
        { title: 'CATEGORY', dataIndex: 'category', key: 'category', width: 100, render: (v: string) => <Tag style={{ fontSize: 10, borderRadius: 4, border: 'none' }}>{v}</Tag> },
        { title: 'ORDERS', dataIndex: 'order_count', key: 'orders', width: 80, sorter: (a: any, b: any) => a.order_count - b.order_count, render: (v: number) => <Text style={{ fontSize: 12 }}>{v}</Text> },
        { title: 'UNITS SOLD', dataIndex: 'units_sold', key: 'units', width: 90, render: (v: number) => <Text style={{ fontSize: 12 }}>{v}</Text> },
        { title: 'REVENUE', dataIndex: 'revenue', key: 'revenue', width: 120, sorter: (a: any, b: any) => a.revenue - b.revenue, render: (v: any) => <Text strong style={{ fontSize: 12, color: '#8B5A2B' }}>{formatAmount(v)}</Text> },
        { title: 'PROFIT', dataIndex: 'profit', key: 'profit', width: 110, render: (v: any) => <Text style={{ fontSize: 12, color: parseFloat(v) >= 0 ? '#52c41a' : '#ff4d4f' }}>{formatAmount(v)}</Text> },
        { title: 'RETURNED', dataIndex: 'returned', key: 'returned', width: 80, render: (v: number) => v > 0 ? <Tag color="red" style={{ border: 'none', borderRadius: 4, fontSize: 11 }}>{v}</Tag> : <Text style={{ fontSize: 11, opacity: 0.4 }}>0</Text> },
    ];

    const productTab = (
        <div>
            <Card size="small" title="Revenue by Product" style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
                <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={products.slice(0, 10).map(p => ({ ...p, revenue: parseFloat(p.revenue || 0), profit: parseFloat(p.profit || 0) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,90,43,0.1)" />
                        <XAxis dataKey="product" fontSize={10} angle={-15} textAnchor="end" height={60} />
                        <YAxis fontSize={10} />
                        <RTooltip contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatAmount(v)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="revenue" fill="#C18E53" name="Revenue" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="profit" fill="#52c41a" name="Profit" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </Card>
            <Table columns={productColumns as any} dataSource={products} rowKey="id" size="small" pagination={{ pageSize: 15 }} loading={loading} />
        </div>
    );

    // ── By Agent Tab ──
    const agentColumns = [
        { title: 'AGENT', dataIndex: 'agent', key: 'agent', render: (v: string) => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
        { title: 'ASSIGNED', dataIndex: 'total_orders', key: 'assigned', width: 80, sorter: (a: any, b: any) => a.total_orders - b.total_orders, render: (v: number) => <Text style={{ fontSize: 12 }}>{v}</Text> },
        { title: 'CONFIRMED', dataIndex: 'confirmed', key: 'confirmed', width: 90, render: (v: number) => <Tag color="blue" style={{ border: 'none', borderRadius: 4, fontSize: 11 }}>{v}</Tag> },
        { title: 'DELIVERED', dataIndex: 'delivered', key: 'delivered', width: 90, render: (v: number) => <Tag color="green" style={{ border: 'none', borderRadius: 4, fontSize: 11 }}>{v}</Tag> },
        { title: 'CONFIRM %', dataIndex: 'confirmation_rate', key: 'rate', width: 90, sorter: (a: any, b: any) => a.confirmation_rate - b.confirmation_rate, render: (v: any) => <Text style={{ fontSize: 12, fontWeight: 600, color: parseFloat(v) >= 50 ? '#52c41a' : '#faad14' }}>{pct(v)}</Text> },
        { title: 'REVENUE', dataIndex: 'revenue', key: 'revenue', width: 120, sorter: (a: any, b: any) => a.revenue - b.revenue, render: (v: any) => <Text strong style={{ fontSize: 12, color: '#8B5A2B' }}>{formatAmount(v)}</Text> },
        { title: 'COMMISSIONS', dataIndex: 'commissions_earned', key: 'commissions', width: 110, render: (v: any) => <Text style={{ fontSize: 12, color: '#722ed1' }}>{formatAmount(v)}</Text> },
    ];

    const agentTab = (
        <div>
            <Card size="small" title="Performance by Agent" style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
                <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={agents.map(a => ({ ...a, revenue: parseFloat(a.revenue || 0), confirmed: parseInt(a.confirmed || 0), delivered: parseInt(a.delivered || 0) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,90,43,0.1)" />
                        <XAxis dataKey="agent" fontSize={10} />
                        <YAxis fontSize={10} />
                        <RTooltip contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="confirmed" fill="#1890ff" name="Confirmed" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="delivered" fill="#52c41a" name="Delivered" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </Card>
            <Table columns={agentColumns as any} dataSource={agents} rowKey="id" size="small" pagination={{ pageSize: 15 }} loading={loading} />
        </div>
    );

    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <Title level={4} style={{ margin: 0 }}>📊 Analytics</Title>
                <Space>
                    <RangePicker
                        size="small"
                        onChange={dates => {
                            if (dates?.[0] && dates?.[1]) {
                                setDateRange([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
                            } else {
                                setDateRange(null);
                            }
                        }}
                    />
                    <Button size="small" icon={<ReloadOutlined />} onClick={fetchAll} loading={loading}>Refresh</Button>
                </Space>
            </div>

            <Tabs
                defaultActiveKey="overview"
                onChange={() => fetchAll()}
                items={[
                    {
                        key: 'overview',
                        label: <span><BarChartOutlined /> Overview</span>,
                        children: overviewTab,
                    },
                    {
                        key: 'cities',
                        label: <span><ShopOutlined /> By City</span>,
                        children: cityTab,
                    },
                    {
                        key: 'products',
                        label: <span><BarChartOutlined /> By Product</span>,
                        children: productTab,
                    },
                    {
                        key: 'agents',
                        label: <span><TeamOutlined /> By Agent</span>,
                        children: agentTab,
                    },
                ]}
            />
        </div>
    );
}
