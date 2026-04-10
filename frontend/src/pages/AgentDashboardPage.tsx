import { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Table, Tag, Progress, Badge } from 'antd';
import {
    CheckCircleOutlined, ClockCircleOutlined,
    PhoneOutlined, TrophyOutlined, TruckOutlined,
    CloseCircleOutlined, StopOutlined, WarningOutlined, RiseOutlined,
} from '@ant-design/icons';
import api from '../api/client';
import { useAuthStore } from '../stores/authStore';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// ─── Theme ───
const T = {
    bg: '#1a1208',
    bgCard: '#231a0e',
    bgInner: '#2a1f12',
    border: 'rgba(193,142,83,0.15)',
    accent: '#C18E53',
    accentLight: '#d4a76a',
    text: '#f5f0e8',
    textSec: '#a89478',
    textDim: '#6b5e4e',
    success: '#52c41a',
    danger: '#ff4d4f',
    warning: '#faad14',
    blue: '#1890ff',
    purple: '#722ed1',
};

const confirmColor: Record<string, string> = {
    pending: T.warning, confirmed: T.success, cancelled: T.danger,
    unreachable: T.purple, fake: T.danger, reported: T.blue, out_of_stock: '#fa8c16',
};

// ─── Mini stat chip ───
const MiniStat = ({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }) => (
    <div style={{
        background: T.bgInner, border: `1px solid ${T.border}`, borderRadius: 10,
        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 auto', minWidth: 200,
    }}>
        <div style={{
            width: 36, height: 36, borderRadius: 8, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: `${color}18`, color, fontSize: 16,
        }}>
            {icon}
        </div>
        <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.textSec, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{value}</div>
            {sub && <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>{sub}</div>}
        </div>
    </div>
);

// ─── Period card (Assigned / Confirmed) ───
const PeriodCard = ({ label, total, confirmed, pending, rate, color }: { label: string; total: number; confirmed: number; pending: number; rate: number; color: string }) => (
    <div style={{
        background: T.bgInner, border: `1px solid ${T.border}`, borderRadius: 10,
        padding: '10px 12px', textAlign: 'center' as const, flex: '1 1 auto', minWidth: 110,
    }}>
        <div style={{ fontSize: 9, color: T.textSec, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>assigned</div>
        <div style={{ margin: '6px 0', height: 1, background: T.border }} />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color }}>{confirmed}</span>
            <span style={{ fontSize: 10, color: T.textDim }}>confirmed</span>
        </div>
        <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
            {pending} pending gap
        </div>
        <div style={{
            display: 'inline-block', marginTop: 4, padding: '1px 8px', borderRadius: 10,
            background: `${color}18`, fontSize: 11, fontWeight: 600, color,
        }}>
            {rate}%
        </div>
    </div>
);

// ─── Delivery status item ───
const DeliveryItem = ({ label, count, color, icon }: { label: string; count: number; color: string; icon: React.ReactNode }) => (
    <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        borderRadius: 8, background: `${color}08`, border: `1px solid ${color}20`,
    }}>
        <div style={{ color, fontSize: 14 }}>{icon}</div>
        <div style={{ flex: 1, fontSize: 12, color: T.text }}>{label}</div>
        <div style={{
            fontSize: 13, fontWeight: 700, color,
            background: `${color}15`, padding: '1px 8px', borderRadius: 6,
        }}>{count}</div>
    </div>
);

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
        const interval = setInterval(fetch, 60000);
        return () => clearInterval(interval);
    }, []);

    if (loading || !data) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: T.textSec }}>
                Loading your dashboard...
            </div>
        );
    }

    const today = data.today || {};
    const week = data.week || {};
    const month = data.month || {};
    const allTime = data.allTime || {};
    const rates = data.confirmation_rates || {};
    const comm = data.commissions || {};
    const queue = data.queue_stats || {};
    const courierStatuses = data.courier_statuses || [];

    const p = (v: any) => parseInt(v) || 0;
    const f = (v: any) => (parseFloat(v) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0 });
    const rateColor = (r: number) => r >= 70 ? T.success : r >= 40 ? T.warning : T.danger;

    const cardStyle = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12 };
    const sectionTitle = (emoji: string, txt: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 14 }}>{emoji}</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: T.accentLight, textTransform: 'uppercase', letterSpacing: 0.5 }}>{txt}</span>
        </div>
    );

    return (
        <div style={{ padding: '16px 20px', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0, color: T.text }}>
                    👋 Welcome, {user?.fullName || user?.username}
                </Title>
                <Text style={{ color: T.textSec, fontSize: 12 }}>
                    Your personal performance overview • {dayjs().format('dddd, DD MMMM YYYY')}
                </Text>
            </div>

            {/* ═══ ROW 1: Quick Stats ═══ */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <MiniStat label="Pending Calls" value={p(queue.pending)} sub={`${p(queue.rescheduled)} rescheduled`}
                    icon={<PhoneOutlined />} color={T.warning} />
                <MiniStat label="Today's Orders" value={p(today.total_orders)} sub={`${p(today.confirmed)} confirmed`}
                    icon={<ClockCircleOutlined />} color={T.blue} />
                <MiniStat label="Commissions Paid" value={`${f(comm.paid)} MAD`} sub={`${f(comm.pending)} MAD pending`}
                    icon={<TrophyOutlined />} color={T.purple} />
            </div>

            {/* ═══ ROW 2: Orders Assigned + Confirmation Rate ═══ */}
            <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                {/* Orders Assigned (Today / Week / Month / All Time) */}
                <Col xs={24} md={14}>
                    <Card style={cardStyle} styles={{ body: { padding: '14px 16px' } }}>
                        {sectionTitle('📊', 'Orders & Confirmation Rate')}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <PeriodCard label="Today" total={p(today.total_orders)} confirmed={p(today.confirmed)} pending={p(today.pending)} rate={rates.today} color={rateColor(rates.today)} />
                            <PeriodCard label="This Week" total={p(week.total_orders)} confirmed={p(week.confirmed)} pending={p(week.pending)} rate={rates.week} color={rateColor(rates.week)} />
                            <PeriodCard label="This Month" total={p(month.total_orders)} confirmed={p(month.confirmed)} pending={p(month.pending)} rate={rates.month} color={rateColor(rates.month)} />
                            <PeriodCard label="All Time" total={p(allTime.total_orders)} confirmed={p(allTime.confirmed)} pending={p(allTime.pending)} rate={rates.allTime} color={rateColor(rates.allTime)} />
                        </div>
                    </Card>
                </Col>

                {/* Commission Breakdown */}
                <Col xs={24} md={10}>
                    <Card style={{ ...cardStyle, height: '100%' }} styles={{ body: { padding: '14px 16px' } }}>
                        {sectionTitle('💰', 'Commissions')}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[
                                { label: 'Paid', value: comm.paid, color: T.success, icon: <CheckCircleOutlined /> },
                                { label: 'Pending', value: comm.pending, color: T.warning, icon: <ClockCircleOutlined />, badge: comm.pending_count },
                                { label: 'Deducted', value: comm.deducted, color: T.danger, icon: <CloseCircleOutlined /> },
                            ].map((item, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                    borderRadius: 8, background: T.bgInner, border: `1px solid ${T.border}`,
                                }}>
                                    <div style={{
                                        width: 28, height: 28, borderRadius: 6, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                        background: `${item.color}15`, color: item.color, fontSize: 13,
                                    }}>{item.icon}</div>
                                    <div style={{ flex: 1, fontSize: 12, color: T.textSec }}>{item.label}</div>
                                    {item.badge ? <Badge count={item.badge} size="small" style={{ backgroundColor: item.color }} /> : null}
                                    <div style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{f(item.value)} MAD</div>
                                </div>
                            ))}
                            <div style={{
                                marginTop: 2, padding: '6px 10px', borderRadius: 8,
                                background: `${T.accent}12`, border: `1px solid ${T.accent}25`,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: T.accentLight, textTransform: 'uppercase' }}>Total Earned</span>
                                <span style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>{f(comm.total)} MAD</span>
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* ═══ ROW 3: Today's Breakdown + Delivery Pipeline ═══ */}
            <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                {/* Today's Confirmation Breakdown */}
                <Col xs={24} md={10}>
                    <Card style={{ ...cardStyle, height: '100%' }} styles={{ body: { padding: '14px 16px' } }}>
                        {sectionTitle('📋', "Today's Breakdown")}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {[
                                { label: 'Confirmed', value: p(today.confirmed), color: T.success, icon: <CheckCircleOutlined /> },
                                { label: 'Pending', value: p(today.pending), color: T.warning, icon: <ClockCircleOutlined /> },
                                { label: 'Cancelled', value: p(today.cancelled), color: T.danger, icon: <CloseCircleOutlined /> },
                                { label: 'Unreachable', value: p(today.unreachable), color: T.purple, icon: <PhoneOutlined /> },
                                { label: 'Reported', value: p(today.reported), color: T.blue, icon: <RiseOutlined /> },
                                { label: 'Fake', value: p(today.fake), color: T.danger, icon: <StopOutlined /> },
                                { label: 'No Stock', value: p(today.out_of_stock), color: '#fa8c16', icon: <WarningOutlined /> },
                            ].map((item, i) => {
                                const total = p(today.total_orders) || 1;
                                const pct = Math.round((item.value / total) * 100);
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ color: item.color, fontSize: 12, width: 16, textAlign: 'center' }}>{item.icon}</div>
                                        <div style={{ width: 80, fontSize: 11, color: T.textSec }}>{item.label}</div>
                                        <Progress percent={pct} showInfo={false} strokeColor={item.color}
                                            trailColor={`${T.accent}08`} strokeWidth={6}
                                            style={{ flex: 1, margin: 0 }} />
                                        <div style={{ width: 30, textAlign: 'right', fontSize: 12, fontWeight: 600, color: item.value > 0 ? item.color : T.textDim }}>
                                            {item.value}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </Col>

                {/* Delivery Pipeline */}
                <Col xs={24} md={14}>
                    <Card style={{ ...cardStyle, height: '100%' }} styles={{ body: { padding: '14px 16px' } }}>
                        {sectionTitle('🚚', 'Delivery Pipeline')}
                        <Row gutter={[8, 8]} style={{ marginBottom: 10 }}>
                            {[
                                { label: 'Delivered', value: p(allTime.delivered), color: T.success, icon: <CheckCircleOutlined /> },
                                { label: 'In Transit', value: p(allTime.in_transit), color: T.blue, icon: <TruckOutlined /> },
                                { label: 'Returned', value: p(allTime.returned), color: T.danger, icon: <CloseCircleOutlined /> },
                            ].map((item, i) => (
                                <Col span={8} key={i}>
                                    <div style={{
                                        textAlign: 'center', padding: '10px 8px', borderRadius: 10,
                                        background: T.bgInner, border: `1px solid ${item.color}20`,
                                    }}>
                                        <div style={{ color: item.color, fontSize: 18, marginBottom: 4 }}>{item.icon}</div>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.value}</div>
                                        <div style={{ fontSize: 9, color: T.textDim, marginTop: 2, textTransform: 'uppercase' }}>{item.label}</div>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                        {courierStatuses.length > 0 && (
                            <>
                                <div style={{ fontSize: 10, color: T.textSec, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                                    Coliix Live Statuses
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {courierStatuses.map((cs: any, i: number) => (
                                        <DeliveryItem key={i}
                                            label={cs.courier_status}
                                            count={parseInt(cs.count)}
                                            color={T.blue}
                                            icon={<TruckOutlined />}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                        {courierStatuses.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '20px 0', color: T.textDim, fontSize: 12 }}>
                                <TruckOutlined style={{ fontSize: 24, marginBottom: 6, display: 'block' }} />
                                No active shipments
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* ═══ ROW 4: Callbacks + Recent Orders ═══ */}
            <Row gutter={[12, 12]}>
                {/* Callbacks Due */}
                <Col xs={24} md={8}>
                    <Card style={cardStyle} styles={{ body: { padding: '12px 14px' } }}>
                        {sectionTitle('📞', 'My Callbacks')}
                        {(data.callbacks || []).length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {data.callbacks.map((cb: any) => (
                                    <div key={cb.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 10px', borderRadius: 8, background: 'rgba(255,122,69,0.06)',
                                        border: `1px solid rgba(255,122,69,0.12)`,
                                    }}>
                                        <div>
                                            <Text style={{ fontSize: 12, fontWeight: 500, color: T.text }}>
                                                {cb.customer_name || cb.order_number}
                                            </Text>
                                            <div style={{ fontSize: 10, color: T.textDim }}>{cb.order_number}</div>
                                        </div>
                                        <Tag color="orange" style={{ fontSize: 10, borderRadius: 4, border: 'none', margin: 0 }}>
                                            {cb.updated_at ? dayjs(cb.updated_at).format('DD/MM HH:mm') : 'Now'}
                                        </Tag>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '24px 0', color: T.textDim, fontSize: 12 }}>
                                <PhoneOutlined style={{ fontSize: 20, marginBottom: 6, display: 'block' }} />
                                No callbacks due
                            </div>
                        )}
                    </Card>
                </Col>

                {/* Recent Orders */}
                <Col xs={24} md={16}>
                    <Card style={cardStyle} styles={{ body: { padding: 0 } }}>
                        <div style={{ padding: '12px 16px 8px' }}>{sectionTitle('🛒', 'Recent Orders')}</div>
                        <Table
                            dataSource={data.recent_orders || []}
                            rowKey="id"
                            pagination={false}
                            size="small"
                            scroll={{ x: 500 }}
                            columns={[
                                {
                                    title: 'ORDER', key: 'order', width: 110,
                                    render: (_: any, r: any) => (
                                        <div>
                                            <Text style={{ color: T.accent, fontWeight: 600, fontSize: 11 }}>{r.order_number}</Text>
                                            <div style={{ fontSize: 10, color: T.textDim }}>
                                                {dayjs(r.created_at).format('DD/MM HH:mm')}
                                            </div>
                                        </div>
                                    ),
                                },
                                {
                                    title: 'CUSTOMER', key: 'customer',
                                    render: (_: any, r: any) => (
                                        <div>
                                            <Text style={{ fontSize: 11, color: T.text }}>{r.customer_name}</Text>
                                            <div style={{ fontSize: 10, color: T.textDim }}>{r.customer_city || '—'}</div>
                                        </div>
                                    ),
                                },
                                {
                                    title: 'STATUS', key: 'status', width: 120,
                                    render: (_: any, r: any) => (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <Tag color={confirmColor[r.confirmation_status] || 'default'}
                                                style={{ borderRadius: 4, border: 'none', fontSize: 10, margin: 0, padding: '0 6px' }}>
                                                {r.confirmation_status}
                                            </Tag>
                                            {r.courier_status && (
                                                <Tag color="blue" style={{ borderRadius: 4, border: 'none', fontSize: 9, margin: 0, padding: '0 5px' }}>
                                                    🚚 {r.courier_status}
                                                </Tag>
                                            )}
                                        </div>
                                    ),
                                },
                                {
                                    title: 'AMOUNT', key: 'amount', width: 90, align: 'right' as const,
                                    render: (_: any, r: any) => (
                                        <Text style={{ fontWeight: 600, fontSize: 12, color: T.text }}>
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
