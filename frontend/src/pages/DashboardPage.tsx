import { useState, useEffect, useMemo } from 'react';
import {
    Card, Row, Col, Typography, Table, Tag, Space, Progress, Badge, List,
    DatePicker, Select,
} from 'antd';
import {
    ShoppingCartOutlined, CheckCircleOutlined, TruckOutlined,
    DollarOutlined,
    WarningOutlined, AppstoreOutlined, CrownOutlined,
    EnvironmentOutlined, ShoppingOutlined, UserOutlined,
    ArrowUpOutlined, ArrowDownOutlined, PhoneOutlined, InboxOutlined,
} from '@ant-design/icons';
import {
    XAxis, YAxis, CartesianGrid,
    ResponsiveContainer, PieChart, Pie, Cell,
    Tooltip as RTooltip, Area, AreaChart,
} from 'recharts';
import api from '../api/client';
import { useRealtimeRefresh } from '../hooks/useSocket';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const confirmColor: Record<string, string> = {
    pending: '#faad14', confirmed: '#52c41a', cancelled: '#ff4d4f',
    unreachable: '#722ed1', fake: '#ff4d4f', reported: '#ff7a45',
    out_of_stock: '#8c8c8c',
};

const DONUT_COLORS = ['#faad14', '#52c41a', '#ff4d4f', '#722ed1', '#ff7a45', '#8c8c8c', '#1890ff'];

const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 12,
};

function deltaPercent(current: number, previous: number): { value: string; positive: boolean } {
    if (previous === 0) return { value: current > 0 ? '+100%' : '0%', positive: current >= 0 };
    const delta = ((current - previous) / previous) * 100;
    return { value: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`, positive: delta >= 0 };
}

export default function DashboardPage() {
    const [dashData, setDashData] = useState<any>(null);
    const [revenueTrend, setRevenueTrend] = useState<any[]>([]);
    const [topAgents, setTopAgents] = useState<any[]>([]);
    const [topCities, setTopCities] = useState<any[]>([]);
    const [topProducts, setTopProducts] = useState<any[]>([]);
    const [stockAlerts, setStockAlerts] = useState<any[]>([]);
    const [recentOrders, setRecentOrders] = useState<any[]>([]);
    const [allProducts, setAllProducts] = useState<any[]>([]);
    const [allAgents, setAllAgents] = useState<any[]>([]);
    const [callbacks, setCallbacks] = useState<any[]>([]);
    const [packingList, setPackingList] = useState<any[]>([]);

    // Filters
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs(), dayjs(),
    ]);
    const [selectedProduct, setSelectedProduct] = useState<string | undefined>(undefined);
    const [selectedAgent, setSelectedAgent] = useState<string | undefined>(undefined);
    const [selectedCity, setSelectedCity] = useState<string | undefined>(undefined);

    const dateParams = useMemo(() => ({
        from: dateRange[0].format('YYYY-MM-DD'),
        to: dateRange[1].format('YYYY-MM-DD'),
        ...(selectedProduct ? { product_id: selectedProduct } : {}),
        ...(selectedAgent ? { agent_id: selectedAgent } : {}),
        ...(selectedCity ? { city: selectedCity } : {}),
    }), [dateRange, selectedProduct, selectedAgent, selectedCity]);

    // Fetch products + agents for filters
    useEffect(() => {
        api.get('/products', { params: { pageSize: 200 } }).then(res => {
            setAllProducts(res.data.data || []);
        }).catch(() => { });
        api.get('/users', { params: { pageSize: 100 } }).then(res => {
            setAllAgents(res.data.data || []);
        }).catch(() => { });
    }, []);

    const fetchAll = async () => {
        const params = dateParams;
        try {
            const [dash, trend, agents, cities, products, stock, orders, cbs, packing] = await Promise.allSettled([
                api.get('/orders/stats/dashboard', { params }),
                api.get('/orders/stats/revenue-trend', { params }),
                api.get('/orders/stats/top-agents', { params }),
                api.get('/orders/stats/top-cities', { params }),
                api.get('/orders/stats/top-products', { params }),
                api.get('/products/stock/overview'),
                api.get('/orders', { params: { pageSize: 6, ...(selectedProduct ? { product_id: selectedProduct } : {}) } }),
                api.get('/orders/callbacks/upcoming'),
                api.get('/orders', { params: { pageSize: 10, confirmationStatus: 'confirmed', shippingStatus: 'not_shipped' } }),
            ]);

            if (dash.status === 'fulfilled') setDashData(dash.value.data.data);
            if (trend.status === 'fulfilled') setRevenueTrend(trend.value.data.data || []);
            if (agents.status === 'fulfilled') setTopAgents(agents.value.data.data || []);
            if (cities.status === 'fulfilled') setTopCities(cities.value.data.data || []);
            if (products.status === 'fulfilled') setTopProducts(products.value.data.data || []);
            if (stock.status === 'fulfilled') {
                const alerts = (stock.value.data.data || [])
                    .filter((v: any) => v.stock_status === 'low_stock' || v.stock_status === 'out_of_stock')
                    .slice(0, 6);
                setStockAlerts(alerts);
            }
            if (orders.status === 'fulfilled') setRecentOrders(orders.value.data.data || []);
            if (cbs.status === 'fulfilled') setCallbacks((cbs.value.data.data || []).slice(0, 5));
            if (packing.status === 'fulfilled') setPackingList((packing.value.data.data || []).slice(0, 8));
        } catch { /* handled per-request */ }
    };

    useEffect(() => { fetchAll(); }, [dateParams]);

    // Real-time auto-refresh via Socket.IO
    useRealtimeRefresh(fetchAll);

    // Extract data
    const cur = dashData?.current || {};
    const prev = dashData?.previous || {};
    const statusBreakdown = (dashData?.status_breakdown || []).map((s: any) => ({
        name: s.confirmation_status?.replace(/_/g, ' ') || 'unknown',
        value: parseInt(s.count) || 0,
        status: s.confirmation_status,
    }));

    const totalOrders = parseInt(cur.total_orders) || 0;
    const pending = parseInt(cur.pending) || 0;
    const confirmed = parseInt(cur.confirmed) || 0;
    const delivered = parseInt(cur.delivered) || 0;
    const returned = parseInt(cur.returned) || 0;
    const revenue = parseFloat(cur.total_revenue) || 0;
    const processedOrders = Math.max(0, totalOrders - pending);
    const confirmRate = processedOrders > 0 ? Math.round((confirmed / processedOrders) * 100) : 0;
    const deliveryRate = confirmed > 0 ? Math.round((delivered / confirmed) * 100) : 0;
    const returnRate = confirmed > 0 ? Math.round((returned / confirmed) * 100) : 0;

    const prevTotal = parseInt(prev.total_orders) || 0;
    const prevPending = parseInt(prev.pending) || 0;
    const prevConfirmed = parseInt(prev.confirmed) || 0;
    const prevDelivered = parseInt(prev.delivered) || 0;
    const prevReturned = parseInt(prev.returned) || 0;
    const prevRevenue = parseFloat(prev.total_revenue) || 0;
    const prevProcessed = Math.max(0, prevTotal - prevPending);
    const prevConfirmRate = prevProcessed > 0 ? Math.round((prevConfirmed / prevProcessed) * 100) : 0;
    const prevDeliveryRate = prevConfirmed > 0 ? Math.round((prevDelivered / prevConfirmed) * 100) : 0;
    const prevReturnRate = prevConfirmed > 0 ? Math.round((prevReturned / prevConfirmed) * 100) : 0;

    // Chart data formatting
    const chartData = revenueTrend.map((d: any) => ({
        date: dayjs(d.date).format('DD/MM'),
        revenue: parseFloat(d.revenue) || 0,
        orders: parseInt(d.orders) || 0,
    }));

    // KPI Cards
    const kpis = [
        {
            title: 'Total Orders', value: totalOrders,
            icon: <ShoppingCartOutlined />, color: '#C18E53',
            delta: deltaPercent(totalOrders, prevTotal),
        },
        {
            title: 'Revenue', value: `${revenue.toLocaleString()} MAD`,
            icon: <DollarOutlined />, color: '#52c41a',
            delta: deltaPercent(revenue, prevRevenue),
        },
        {
            title: 'Confirm Rate', value: `${confirmRate}%`,
            icon: <CheckCircleOutlined />, color: '#1890ff',
            delta: deltaPercent(confirmRate, prevConfirmRate),
        },
        {
            title: 'Delivery Rate', value: `${deliveryRate}%`,
            icon: <TruckOutlined />, color: '#722ed1',
            delta: deltaPercent(deliveryRate, prevDeliveryRate),
        },
        {
            title: 'Return Rate', value: `${returnRate}%`,
            icon: <WarningOutlined />, color: '#ff4d4f',
            delta: deltaPercent(returnRate, prevReturnRate), invertColor: true,
        },
    ];

    const presetRanges: Record<string, [dayjs.Dayjs, dayjs.Dayjs]> = {
        'Today': [dayjs(), dayjs()],
        'Yesterday': [dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')],
        'Last 7 days': [dayjs().subtract(7, 'day'), dayjs()],
        'Last 14 days': [dayjs().subtract(14, 'day'), dayjs()],
        'Last 30 days': [dayjs().subtract(30, 'day'), dayjs()],
        'This month': [dayjs().startOf('month'), dayjs()],
        'Last month': [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')],
    };

    return (
        <div>
            {/* ── Row 0: Title + Filter Bar ─── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <Title level={4} style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>Dashboard</Title>
                <Space wrap size={8}>
                    <Select
                        allowClear showSearch
                        placeholder="All Products"
                        value={selectedProduct}
                        onChange={(v) => setSelectedProduct(v || undefined)}
                        optionFilterProp="label"
                        style={{ minWidth: 160, borderRadius: 8 }}
                        size="small"
                        options={allProducts.map((p: any) => ({ value: p.id, label: p.name }))}
                    />
                    <Select
                        allowClear showSearch
                        placeholder="All Agents"
                        value={selectedAgent}
                        onChange={(v) => setSelectedAgent(v || undefined)}
                        optionFilterProp="label"
                        style={{ minWidth: 150, borderRadius: 8 }}
                        size="small"
                        options={allAgents.map((a: any) => ({ value: a.id, label: a.full_name }))}
                    />
                    <Select
                        allowClear showSearch
                        placeholder="All Cities"
                        value={selectedCity}
                        onChange={(v) => setSelectedCity(v || undefined)}
                        style={{ minWidth: 140, borderRadius: 8 }}
                        size="small"
                        options={topCities.map((c: any) => ({ value: c.city, label: c.city }))}
                    />
                    <RangePicker
                        value={dateRange}
                        onChange={(dates) => { if (dates?.[0] && dates?.[1]) setDateRange([dates[0], dates[1]]); }}
                        presets={Object.entries(presetRanges).map(([label, value]) => ({ label, value }))}
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', borderRadius: 8 }}
                        format="DD/MM/YYYY"
                        size="small"
                    />
                </Space>
            </div>

            {/* ── Row 1: KPI Cards ─── */}
            <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                {kpis.map((kpi, i) => {
                    const isPositiveGood = !kpi.invertColor;
                    const deltaColor = kpi.delta.positive
                        ? (isPositiveGood ? '#52c41a' : '#ff4d4f')
                        : (isPositiveGood ? '#ff4d4f' : '#52c41a');
                    return (
                        <Col xs={12} sm={8} md={4} lg={4} xl={4} key={i} style={{ minWidth: 150 }}>
                            <Card style={{ ...cardStyle, borderColor: `${kpi.color}22` }}
                                styles={{ body: { padding: '16px 18px' } }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            {kpi.title}
                                        </div>
                                        <div style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{kpi.value}</div>
                                        <div style={{ marginTop: 6, fontSize: 11, color: deltaColor, fontWeight: 600 }}>
                                            {kpi.delta.positive ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {kpi.delta.value}
                                            <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 4 }}>vs prev</span>
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
                    );
                })}
            </Row>

            {/* ── Row 2: Charts ─── */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                {/* Revenue Trend */}
                <Col xs={24} lg={14}>
                    <Card title={<Text style={{ color: 'var(--text-primary)', fontWeight: 600 }}>📈 Revenue Trend</Text>}
                        style={{ ...cardStyle, height: '100%' }} styles={{ body: { padding: '12px 8px 8px 0' } }}>
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#C18E53" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#C18E53" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,90,43,0.08)" />
                                    <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={10} tick={{ fill: 'var(--text-tertiary)' }} />
                                    <YAxis stroke="var(--text-tertiary)" fontSize={10} tick={{ fill: 'var(--text-tertiary)' }} />
                                    <RTooltip
                                        contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid rgba(139,90,43,0.3)', borderRadius: 8, color: 'var(--text-primary)' }}
                                        labelStyle={{ color: '#C18E53' }}
                                        formatter={(value: any) => [`${parseFloat(value).toLocaleString()} MAD`, 'Revenue']}
                                    />
                                    <Area type="monotone" dataKey="revenue" stroke="#C18E53" strokeWidth={2}
                                        fill="url(#revenueGrad)" dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
                                No data for selected period
                            </div>
                        )}
                    </Card>
                </Col>

                {/* Orders by Status Donut */}
                <Col xs={24} lg={10}>
                    <Card title={<Text style={{ color: 'var(--text-primary)', fontWeight: 600 }}>📋 Orders by Status</Text>}
                        style={{ ...cardStyle, height: '100%' }} styles={{ body: { padding: '12px 16px' } }}>
                        {statusBreakdown.length > 0 ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie data={statusBreakdown} cx="50%" cy="50%"
                                        innerRadius={55} outerRadius={90}
                                        paddingAngle={3} dataKey="value"
                                        label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        labelLine={false}
                                    >
                                        {statusBreakdown.map((entry: any, i: number) => (
                                            <Cell key={i} fill={confirmColor[entry.status] || DONUT_COLORS[i % DONUT_COLORS.length]}
                                                stroke="transparent" />
                                        ))}
                                    </Pie>
                                    <RTooltip
                                        contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid rgba(139,90,43,0.3)', borderRadius: 8, color: 'var(--text-primary)' }}
                                        formatter={(value: any, name: any) => [value, name]}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
                                No orders in selected period
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* ── Row 3: Rankings ─── */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                {/* Top Agents */}
                <Col xs={24} md={8}>
                    <Card title={<Text style={{ color: 'var(--text-primary)', fontWeight: 600 }}><CrownOutlined style={{ color: '#faad14' }} /> Top Agents</Text>}
                        style={{ ...cardStyle, height: '100%' }} styles={{ body: { padding: '8px 16px' } }}>
                        {topAgents.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {topAgents.map((a: any, i: number) => {
                                    const medals = ['🥇', '🥈', '🥉'];
                                    return (
                                        <div key={a.id} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '8px 10px', borderRadius: 8,
                                            background: i === 0 ? 'rgba(250,173,20,0.08)' : 'transparent',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 16 }}>{medals[i] || `${i + 1}.`}</span>
                                                <div>
                                                    <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 13 }}>{a.name}</div>
                                                    <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                                                        {a.confirmed} confirmed · {a.delivered} delivered
                                                    </div>
                                                </div>
                                            </div>
                                            <Tag color="#52c41a" style={{ borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600 }}>
                                                {parseFloat(a.revenue).toLocaleString()} MAD
                                            </Tag>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-tertiary)' }}>
                                <UserOutlined style={{ fontSize: 24, marginBottom: 8, display: 'block' }} />
                                No agent data
                            </div>
                        )}
                    </Card>
                </Col>

                {/* Best Cities */}
                <Col xs={24} md={8}>
                    <Card title={<Text style={{ color: 'var(--text-primary)', fontWeight: 600 }}><EnvironmentOutlined style={{ color: '#1890ff' }} /> Best Cities</Text>}
                        style={{ ...cardStyle, height: '100%' }} styles={{ body: { padding: '8px 16px' } }}>
                        {topCities.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {topCities.map((c: any, i: number) => (
                                    <div key={c.city} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 10px', borderRadius: 8,
                                        background: i === 0 ? 'rgba(24,144,255,0.06)' : 'transparent',
                                        cursor: 'pointer',
                                    }}
                                        onClick={() => setSelectedCity(c.city)}
                                        title={`Click to filter by ${c.city}`}
                                    >
                                        <div>
                                            <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 13 }}>
                                                {i + 1}. {c.city}
                                            </div>
                                            <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                                                {c.delivered} delivered · {c.confirmed} confirmed
                                            </div>
                                        </div>
                                        <Tag color={parseFloat(c.delivery_rate) >= 80 ? '#52c41a' : parseFloat(c.delivery_rate) >= 50 ? '#faad14' : '#ff4d4f'}
                                            style={{ borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600 }}>
                                            {c.delivery_rate || 0}%
                                        </Tag>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-tertiary)' }}>
                                <EnvironmentOutlined style={{ fontSize: 24, marginBottom: 8, display: 'block' }} />
                                No city data
                            </div>
                        )}
                    </Card>
                </Col>

                {/* Best Products */}
                <Col xs={24} md={8}>
                    <Card title={<Text style={{ color: 'var(--text-primary)', fontWeight: 600 }}><ShoppingOutlined style={{ color: '#722ed1' }} /> Best Products</Text>}
                        style={{ ...cardStyle, height: '100%' }} styles={{ body: { padding: '8px 16px' } }}>
                        {topProducts.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {topProducts.map((p: any, i: number) => (
                                    <div key={p.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 10px', borderRadius: 8,
                                        background: i === 0 ? 'rgba(114,46,209,0.06)' : 'transparent',
                                        cursor: 'pointer',
                                    }}
                                        onClick={() => setSelectedProduct(p.id)}
                                        title={`Click to filter by ${p.name}`}
                                    >
                                        <div>
                                            <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 13 }}>
                                                {i + 1}. {p.name}
                                            </div>
                                            <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                                                {p.total_qty} units · {p.delivered_orders} delivered
                                            </div>
                                        </div>
                                        <Tag color="#722ed1" style={{ borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600 }}>
                                            {parseFloat(p.revenue).toLocaleString()} MAD
                                        </Tag>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-tertiary)' }}>
                                <ShoppingOutlined style={{ fontSize: 24, marginBottom: 8, display: 'block' }} />
                                No product data
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* ── Row 4: Callbacks + Low Stock + Packing ─── */}
            <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                {/* Callbacks Due */}
                <Col xs={24} md={8}>
                    <Card title={<Text style={{ color: '#ff7a45', fontWeight: 600, fontSize: 13 }}><PhoneOutlined /> Callbacks Due</Text>}
                        style={{ ...cardStyle, height: '100%' }} styles={{ body: { padding: '4px 12px' } }} size="small">
                        {callbacks.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {callbacks.map((cb: any) => (
                                    <div key={cb.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '5px 8px', borderRadius: 6, background: 'rgba(255,122,69,0.06)',
                                    }}>
                                        <div>
                                            <Text style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>
                                                {cb.customer_name || cb.order_number || 'Order'}
                                            </Text>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                {cb.agent_name || 'Unassigned'}
                                            </div>
                                        </div>
                                        <Tag color="orange" style={{ fontSize: 10, borderRadius: 4, border: 'none', margin: 0 }}>
                                            {cb.scheduled_at ? dayjs(cb.scheduled_at).format('HH:mm') : 'N/A'}
                                        </Tag>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-tertiary)', fontSize: 11 }}>
                                <PhoneOutlined style={{ fontSize: 18, marginBottom: 4, display: 'block' }} />
                                No callbacks due
                            </div>
                        )}
                    </Card>
                </Col>

                {/* Low Stock Alerts */}
                <Col xs={24} md={8}>
                    <Card title={<Text style={{ color: '#faad14', fontWeight: 600, fontSize: 13 }}><WarningOutlined /> Low Stock</Text>}
                        style={{ ...cardStyle, height: '100%' }} styles={{ body: { padding: '4px 12px' } }} size="small">
                        {stockAlerts.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {stockAlerts.slice(0, 5).map((item: any, idx: number) => (
                                    <div key={idx} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '5px 8px', borderRadius: 6,
                                        background: parseInt(item.stock) === 0 ? 'rgba(255,77,79,0.06)' : 'rgba(250,173,20,0.06)',
                                    }}>
                                        <div>
                                            <Text style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>
                                                {item.product_name}
                                            </Text>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                {[item.size, item.color].filter(Boolean).join(' / ') || 'Standard'}
                                            </div>
                                        </div>
                                        <Badge count={`${item.stock}`}
                                            style={{
                                                backgroundColor: parseInt(item.stock) === 0 ? '#ff4d4f' : '#faad14',
                                                fontSize: 10, fontWeight: 600, borderRadius: 4,
                                            }} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-tertiary)', fontSize: 11 }}>
                                <AppstoreOutlined style={{ fontSize: 18, marginBottom: 4, display: 'block' }} />
                                All stock healthy
                            </div>
                        )}
                    </Card>
                </Col>

                {/* Today's Packing List */}
                <Col xs={24} md={8}>
                    <Card title={<Text style={{ color: '#1890ff', fontWeight: 600, fontSize: 13 }}><InboxOutlined /> Packing List</Text>}
                        style={{ ...cardStyle, height: '100%' }} styles={{ body: { padding: '4px 12px' } }} size="small"
                        extra={<Tag color="blue" style={{ fontSize: 10, borderRadius: 4, border: 'none' }}>{packingList.length}</Tag>}>
                        {packingList.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {packingList.slice(0, 6).map((o: any) => (
                                    <div key={o.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '5px 8px', borderRadius: 6, background: 'rgba(24,144,255,0.04)',
                                    }}>
                                        <div>
                                            <Text style={{ fontSize: 11, fontWeight: 600, color: '#C18E53' }}>
                                                {o.order_number}
                                            </Text>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                {o.customer_name} · {o.customer_city || 'N/A'}
                                            </div>
                                        </div>
                                        <Text style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>
                                            {parseFloat(o.final_amount || 0).toFixed(0)} MAD
                                        </Text>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-tertiary)', fontSize: 11 }}>
                                <InboxOutlined style={{ fontSize: 18, marginBottom: 4, display: 'block' }} />
                                Nothing to pack
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* ── Row 5: Operational ─── */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                {/* Recent Orders */}
                <Col xs={24} lg={14}>
                    <Card title={<Text style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Recent Orders</Text>}
                        style={cardStyle} styles={{ body: { padding: 0 } }}>
                        <Table
                            dataSource={recentOrders}
                            rowKey="id"
                            pagination={false}
                            size="small"
                            scroll={{ x: 480 }}
                            columns={[
                                {
                                    title: 'Order', key: 'order', width: 100,
                                    render: (_: any, r: any) => (
                                        <div>
                                            <Text style={{ color: '#C18E53', fontWeight: 600, fontSize: 12 }}>{r.order_number}</Text>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                {new Date(r.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    ),
                                },
                                {
                                    title: 'Customer', key: 'customer', responsive: ['md' as const],
                                    render: (_: any, r: any) => (
                                        <Text style={{ color: 'var(--text-primary)', fontSize: 12 }}>{r.customer_name}</Text>
                                    ),
                                },
                                {
                                    title: 'Status', key: 'status', width: 100,
                                    render: (_: any, r: any) => (
                                        <Tag color={confirmColor[r.confirmation_status] || 'default'}
                                            style={{ borderRadius: 6, border: 'none', fontSize: 10 }}>
                                            {r.confirmation_status}
                                        </Tag>
                                    ),
                                },
                                {
                                    title: 'Amount', key: 'amount', width: 90, align: 'right' as const,
                                    render: (_: any, r: any) => (
                                        <Text style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 12 }}>
                                            {parseFloat(r.final_amount || 0).toFixed(0)} MAD
                                        </Text>
                                    ),
                                },
                            ]}
                        />
                    </Card>
                </Col>

                {/* Stock Alerts + Pipeline */}
                <Col xs={24} lg={10}>
                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                        {/* Stock Alerts */}
                        <Card title={<Text style={{ color: '#faad14', fontWeight: 600 }}><WarningOutlined /> Stock Alerts</Text>}
                            style={cardStyle} styles={{ body: { padding: '6px 14px' } }}>
                            {stockAlerts.length > 0 ? (
                                <List dataSource={stockAlerts} size="small"
                                    renderItem={(item: any) => (
                                        <List.Item style={{ borderBottom: '1px solid rgba(139,90,43,0.06)', padding: '6px 0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                <div>
                                                    <Text style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 12 }}>{item.product_name}</Text>
                                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                        {[item.size, item.color].filter(Boolean).join(' / ') || 'Standard'}
                                                    </div>
                                                </div>
                                                <Badge count={`${item.stock} left`}
                                                    style={{
                                                        backgroundColor: parseInt(item.stock) === 0 ? '#ff4d4f' : '#faad14',
                                                        fontSize: 10, fontWeight: 600, borderRadius: 6,
                                                    }} />
                                            </div>
                                        </List.Item>
                                    )} />
                            ) : (
                                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-tertiary)', fontSize: 12 }}>
                                    <AppstoreOutlined style={{ fontSize: 22, marginBottom: 6, display: 'block' }} />
                                    All stock levels healthy
                                </div>
                            )}
                        </Card>

                        {/* Order Pipeline */}
                        <Card title={<Text style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Order Pipeline</Text>}
                            style={cardStyle} styles={{ body: { padding: '12px 18px' } }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[
                                    { label: 'Pending', value: parseInt(cur.pending) || 0, color: '#faad14' },
                                    { label: 'Confirmed', value: confirmed, color: '#52c41a' },
                                    { label: 'In Transit', value: parseInt(cur.in_transit) || 0, color: '#722ed1' },
                                    { label: 'Delivered', value: delivered, color: '#52c41a' },
                                    { label: 'Returned', value: returned, color: '#ff4d4f' },
                                ].map((item, i) => (
                                    <div key={i}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                            <Text style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{item.label}</Text>
                                            <Text style={{ color: item.color, fontWeight: 600, fontSize: 12 }}>{item.value}</Text>
                                        </div>
                                        <Progress
                                            percent={totalOrders > 0 ? Math.round((item.value / totalOrders) * 100) : 0}
                                            showInfo={false} strokeColor={item.color}
                                            trailColor="rgba(139,90,43,0.06)" strokeWidth={5}
                                        />
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </Space>
                </Col>
            </Row>
        </div>
    );
}
