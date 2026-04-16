import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Table, Button, Card, Row, Col, Typography, Tag, Input, Space, Modal,
    Tabs, message, Statistic, Tooltip, Descriptions,
} from 'antd';
import {
    CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
    SearchOutlined, ReloadOutlined, ScanOutlined, CameraOutlined,
} from '@ant-design/icons';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../api/client';

const { Title, Text } = Typography;

export default function ReturnsPage() {
    const [returns, setReturns] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<any>({});
    const [verified, setVerified] = useState(false);
    const [search, setSearch] = useState('');

    // Verify modal
    const [verifyOrder, setVerifyOrder] = useState<any>(null);
    const [verifyResult, setVerifyResult] = useState<'ok' | 'damaged' | 'wrong_package'>('ok');
    const [verifyNote, setVerifyNote] = useState('');
    const [verifyLoading, setVerifyLoading] = useState(false);

    // QR/tracking search
    const [trackingSearch, setTrackingSearch] = useState('');
    const [trackingResult, setTrackingResult] = useState<any>(null);
    const [trackingLoading, setTrackingLoading] = useState(false);

    // QR Camera Scanner
    const [scannerOpen, setScannerOpen] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    const stopScanner = useCallback(() => {
        if (scannerRef.current) {
            scannerRef.current.stop().then(() => {
                scannerRef.current?.clear();
                scannerRef.current = null;
            }).catch(() => {
                scannerRef.current = null;
            });
        }
    }, []);

    const startScanner = useCallback(() => {
        setTimeout(() => {
            const el = document.getElementById('qr-reader');
            if (!el) return;
            const scanner = new Html5Qrcode('qr-reader');
            scannerRef.current = scanner;
            scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    // QR code detected — auto-search
                    setTrackingSearch(decodedText);
                    setScannerOpen(false);
                    stopScanner();
                    // Auto-trigger search
                    (async () => {
                        setTrackingLoading(true);
                        try {
                            const res = await api.get('/returns/search', { params: { tracking: decodedText } });
                            setTrackingResult(res.data.data);
                            message.success(`Found order: #${res.data.data?.order_number}`);
                        } catch {
                            message.error('Order not found for this QR code');
                            setTrackingResult(null);
                        }
                        setTrackingLoading(false);
                    })();
                },
                () => { /* ignore scan failures */ }
            ).catch((err: any) => {
                message.error('Camera access denied or not available');
                console.error('QR Scanner error:', err);
            });
        }, 300);
    }, [stopScanner]);

    const fetchReturns = async () => {
        setLoading(true);
        try {
            const params: any = { verified: verified ? 'true' : 'false', pageSize: 50 };
            if (search) params.search = search;
            const res = await api.get('/returns', { params });
            setReturns(res.data.data || []);
        } catch { message.error('Failed to load returns'); }
        setLoading(false);
    };

    const fetchStats = async () => {
        try {
            const res = await api.get('/returns/stats');
            setStats(res.data.data || {});
        } catch { }
    };

    useEffect(() => { fetchStats(); }, []);
    useEffect(() => { fetchReturns(); }, [verified, search]);

    const handleVerify = async () => {
        if (!verifyOrder) return;
        setVerifyLoading(true);
        try {
            const res = await api.post(`/returns/${verifyOrder.id}/verify`, { result: verifyResult, note: verifyNote });
            message.success(res.data?.message || `Return verified as: ${verifyResult.replace('_', ' ')}`);
            setVerifyOrder(null);
            setVerifyResult('ok');
            setVerifyNote('');
            fetchReturns();
            fetchStats();
        } catch (err: any) { message.error(err.response?.data?.error?.message || 'Verify failed'); }
        setVerifyLoading(false);
    };

    const handleTrackingSearch = async () => {
        if (!trackingSearch.trim()) return;
        setTrackingLoading(true);
        try {
            const res = await api.get('/returns/search', { params: { tracking: trackingSearch } });
            setTrackingResult(res.data.data);
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Order not found');
            setTrackingResult(null);
        }
        setTrackingLoading(false);
    };

    const formatAmount = (v: any) => parseFloat(String(v || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' MAD';
    const formatDate = (d: string) => {
        if (!d) return '—';
        const dt = new Date(d);
        return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    };

    const RESULT_OPTIONS = [
        { value: 'ok', label: '✅ Product OK', desc: 'Stock will be restored', color: '#52c41a' },
        { value: 'damaged', label: '⚠️ Damaged', desc: 'Stock will NOT be restored', color: '#faad14' },
        { value: 'wrong_package', label: '❌ Wrong Package', desc: 'Will be flagged for investigation', color: '#ff4d4f' },
    ];

    const columns = [
        {
            title: 'ORDER', dataIndex: 'order_number', key: 'order_number', width: 90,
            render: (v: string) => <Text strong style={{ fontSize: 12 }}>{v}</Text>,
        },
        {
            title: 'CUSTOMER', key: 'customer', width: 140,
            render: (_: any, r: any) => (
                <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{r.customer_name}</div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{r.courier_name || '—'}</div>
                </div>
            ),
        },
        {
            title: 'TRACKING', dataIndex: 'tracking_number', key: 'tracking', width: 130,
            render: (v: string) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v || '—'}</Text>,
        },
        {
            title: 'AMOUNT', key: 'amount', width: 100,
            render: (_: any, r: any) => <Text strong style={{ fontSize: 12 }}>{formatAmount(r.final_amount)}</Text>,
        },
        {
            title: 'RETURNED', key: 'returnedAt', width: 90,
            render: (_: any, r: any) => <Text style={{ fontSize: 11 }}>{formatDate(r.returned_at)}</Text>,
        },
        ...(verified ? [{
            title: 'RESULT', key: 'result', width: 110,
            render: (_: any, r: any) => {
                const colors: Record<string, string> = { ok: 'green', damaged: 'gold', wrong_package: 'red' };
                return <Tag color={colors[r.return_result] || 'default'} style={{ borderRadius: 4, border: 'none', fontSize: 11 }}>
                    {r.return_result?.replace('_', ' ') || '—'}
                </Tag>;
            },
        }] : []),
        ...(!verified ? [{
            title: 'VERIFY', key: 'verify', width: 90, align: 'center' as const,
            render: (_: any, r: any) => (
                <Button type="primary" size="small" icon={<CheckCircleOutlined />}
                    onClick={() => { setVerifyOrder(r); setVerifyResult('ok'); setVerifyNote(''); }}>
                    Verify
                </Button>
            ),
        }] : []),
    ];

    const KPI_CARDS = [
        { label: 'Pending Verification', value: stats.pending_verification || 0, color: '#faad14', icon: <WarningOutlined /> },
        { label: 'Verified Today', value: stats.verified_today || 0, color: '#52c41a', icon: <CheckCircleOutlined /> },
        { label: 'Total Returned', value: stats.total_returned || 0, color: '#ff4d4f', icon: <CloseCircleOutlined /> },
        { label: 'Return Rate', value: `${stats.return_rate || 0}%`, color: '#8B5A2B', isText: true },
    ];

    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>📦 Returns Verification</Title>
                <Button icon={<ReloadOutlined />} onClick={() => { fetchReturns(); fetchStats(); }}>Refresh</Button>
            </div>

            {/* KPI Cards */}
            <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
                {KPI_CARDS.map((c, i) => (
                    <Col xs={12} sm={6} key={i}>
                        <Card styles={{ body: { padding: '12px 14px' } }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                {c.isText
                                    ? <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
                                    : <Statistic value={c.value as number} valueStyle={{ fontSize: 22, fontWeight: 700, color: c.color }} />
                                }
                                <div style={{ fontSize: 20, color: c.color, opacity: 0.7 }}>{c.icon}</div>
                            </div>
                            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2, textTransform: 'uppercase' }}>{c.label}</div>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* Tracking Search */}
            <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '10px 14px' } }}>
                <Row gutter={8} align="middle">
                    <Col><ScanOutlined style={{ fontSize: 16, color: '#8B5A2B' }} /></Col>
                    <Col flex={1}>
                        <Input
                            placeholder="Scan QR or enter tracking number..."
                            value={trackingSearch}
                            onChange={e => setTrackingSearch(e.target.value)}
                            onPressEnter={handleTrackingSearch}
                            size="small"
                        />
                    </Col>
                    <Col>
                        <Button size="small" icon={<SearchOutlined />} loading={trackingLoading} onClick={handleTrackingSearch}>Search</Button>
                    </Col>
                    <Col>
                        <Button size="small" type="primary" icon={<CameraOutlined />}
                            style={{ background: '#8B5A2B', borderColor: '#8B5A2B' }}
                            onClick={() => { setScannerOpen(true); startScanner(); }}>
                            📷 Scan QR
                        </Button>
                    </Col>
                    {trackingResult && (
                        <Col>
                            <Button
                                size="small" type="primary" icon={<CheckCircleOutlined />}
                                onClick={() => { setVerifyOrder(trackingResult); setTrackingResult(null); setTrackingSearch(''); }}
                            >
                                Verify #{trackingResult.order_number}
                            </Button>
                        </Col>
                    )}
                </Row>
                {trackingResult && (
                    <Descriptions size="small" style={{ marginTop: 8 }} column={3}>
                        <Descriptions.Item label="Customer">{trackingResult.customer_name}</Descriptions.Item>
                        <Descriptions.Item label="Amount">{formatAmount(trackingResult.final_amount)}</Descriptions.Item>
                        <Descriptions.Item label="Courier">{trackingResult.courier_name}</Descriptions.Item>
                    </Descriptions>
                )}
            </Card>

            {/* Tabs */}
            <Card styles={{ body: { padding: 0 } }}>
                <Tabs
                    activeKey={verified ? 'verified' : 'pending'}
                    onChange={k => setVerified(k === 'verified')}
                    style={{ padding: '0 14px' }}
                    items={[
                        { key: 'pending', label: `⏳ Pending Verification (${stats.pending_verification || 0})` },
                        { key: 'verified', label: '✅ Verified' },
                    ]}
                />
                <div style={{ padding: '0 14px 14px' }}>
                    <Input.Search
                        placeholder="Search by order #, customer, tracking..."
                        allowClear size="small" style={{ maxWidth: 320, marginBottom: 10 }}
                        onSearch={v => setSearch(v)}
                    />
                    <Table
                        columns={columns as any} dataSource={returns} rowKey="id"
                        loading={loading} size="small"
                        pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                </div>
            </Card>

            {/* Verify Modal */}
            <Modal
                title={`Verify Return — ${verifyOrder?.order_number}`}
                open={!!verifyOrder}
                onCancel={() => { setVerifyOrder(null); }}
                onOk={handleVerify}
                okText="Confirm Verification"
                confirmLoading={verifyLoading}
                okButtonProps={{ danger: verifyResult !== 'ok' }}
            >
                {verifyOrder && (
                    <div>
                        <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
                            <Descriptions.Item label="Customer">{verifyOrder.customer_name}</Descriptions.Item>
                            <Descriptions.Item label="Amount">{formatAmount(verifyOrder.final_amount)}</Descriptions.Item>
                            <Descriptions.Item label="Courier">{verifyOrder.courier_name || '—'}</Descriptions.Item>
                            <Descriptions.Item label="Tracking">{verifyOrder.tracking_number || '—'}</Descriptions.Item>
                        </Descriptions>

                        {/* Show order items */}
                        {verifyOrder.items && Array.isArray(verifyOrder.items) && verifyOrder.items.length > 0 && (
                            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>📦 Order Items:</Text>
                                {verifyOrder.items.map((item: any, idx: number) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                                        <span>{item.productName} {item.size ? `(${item.size})` : ''} {item.color ? `— ${item.color}` : ''}</span>
                                        <span style={{ fontWeight: 600 }}>×{item.quantity}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <Text strong>Inspection Result:</Text>
                        <div style={{ marginTop: 8, marginBottom: 12 }}>
                            {RESULT_OPTIONS.map(opt => (
                                <Card
                                    key={opt.value}
                                    size="small"
                                    style={{
                                        marginBottom: 8, cursor: 'pointer',
                                        borderColor: verifyResult === opt.value ? opt.color : undefined,
                                        background: verifyResult === opt.value ? `${opt.color}10` : undefined,
                                    }}
                                    onClick={() => setVerifyResult(opt.value as any)}
                                >
                                    <div style={{ fontWeight: 600 }}>{opt.label}</div>
                                    <div style={{ fontSize: 11, opacity: 0.6 }}>{opt.desc}</div>
                                </Card>
                            ))}
                        </div>

                        {/* Stock restoration notice */}
                        {verifyResult === 'ok' && verifyOrder.items && verifyOrder.items.length > 0 && (
                            <div style={{ padding: '8px 12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
                                ✅ <strong>Stock will be restored</strong> — {verifyOrder.items.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0)} unit(s) will be added back to inventory.
                            </div>
                        )}

                        <Text style={{ fontSize: 12 }}>Notes (optional):</Text>
                        <Input.TextArea
                            rows={2} style={{ marginTop: 4 }}
                            value={verifyNote} onChange={e => setVerifyNote(e.target.value)}
                            placeholder="Any additional notes..."
                        />
                    </div>
                )}
            </Modal>

            {/* QR Scanner Modal */}
            <Modal
                title="📷 Scan QR Code / Barcode"
                open={scannerOpen}
                onCancel={() => { setScannerOpen(false); stopScanner(); }}
                footer={[
                    <Button key="cancel" onClick={() => { setScannerOpen(false); stopScanner(); }}>Cancel</Button>,
                ]}
                width={420}
                destroyOnClose
            >
                <div style={{ textAlign: 'center' }}>
                    <div id="qr-reader" style={{ width: '100%', minHeight: 300, borderRadius: 8, overflow: 'hidden' }} />
                    <Text style={{ fontSize: 12, opacity: 0.6, marginTop: 8, display: 'block' }}>
                        Point your camera at a QR code or barcode on the return package
                    </Text>
                </div>
            </Modal>
        </div>
    );
}
