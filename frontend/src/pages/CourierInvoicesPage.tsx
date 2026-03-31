import { useState, useEffect, useRef } from 'react';
import {
    Table, Button, Card, Typography, Tag, Space, Row, Col, Statistic,
    message, Select, Popconfirm, Alert,
} from 'antd';
import {
    CheckOutlined, CloseOutlined, FileExcelOutlined,
    LinkOutlined, DisconnectOutlined, WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/client';

const { Title, Text } = Typography;

interface InvoiceRow {
    id: string;
    tracking_number: string;
    invoice_amount: number;
    invoice_date: string;
    courier_name: string;
    order_id: string | null;
    order_number: string | null;
    order_amount: number | null;
    matched: boolean;
    amount_mismatch: boolean;
    status: string;
    created_at: string;
}

export default function CourierInvoicesPage() {
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const fileRef = useRef<HTMLInputElement>(null);

    const fetchInvoices = async () => {
        setLoading(true);
        try {
            const params = statusFilter ? `?status=${statusFilter}` : '';
            const res = await api.get(`/courier-invoices${params}`);
            setInvoices(res.data.data || []);
        } catch { message.error('Failed to load invoices'); }
        setLoading(false);
    };

    useEffect(() => { fetchInvoices(); }, [statusFilter]);

    const parseCSV = (text: string): Array<{ tracking_number: string; amount: number; date: string }> => {
        const lines = text.trim().split('\n');
        const rows = [];
        for (let i = 1; i < lines.length; i++) { // skip header
            const cols = lines[i].split(/[,;\t]/);
            if (cols.length >= 2) {
                rows.push({
                    tracking_number: cols[0]?.trim(),
                    amount: parseFloat(cols[1]?.trim()) || 0,
                    date: cols[2]?.trim() || new Date().toISOString().split('T')[0],
                });
            }
        }
        return rows;
    };

    const handleFileUpload = async (file: File) => {
        const text = await file.text();
        const rows = parseCSV(text);

        if (rows.length === 0) {
            message.error('No valid rows found in CSV');
            return;
        }

        setUploading(true);
        try {
            const res = await api.post('/courier-invoices/import', {
                rows, courier_name: 'Coliix',
            });
            const data = res.data.data;
            message.success(`Imported ${data.total} rows: ${data.matched} matched, ${data.unmatched} unmatched`);
            fetchInvoices();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Import failed');
        }
        setUploading(false);
    };

    const handleApprove = async (id: string) => {
        try {
            await api.put(`/courier-invoices/${id}/approve`);
            message.success('Approved & expense created');
            fetchInvoices();
        } catch { message.error('Approval failed'); }
    };

    const handleReject = async (id: string) => {
        try {
            await api.put(`/courier-invoices/${id}/reject`, { reason: 'Rejected by admin' });
            message.success('Rejected');
            fetchInvoices();
        } catch { message.error('Rejection failed'); }
    };

    const pending = invoices.filter(i => i.status === 'pending').length;
    const approved = invoices.filter(i => i.status === 'approved').length;
    const unmatched = invoices.filter(i => !i.matched).length;

    const columns = [
        {
            title: 'TRACKING #', dataIndex: 'tracking_number', key: 'tracking',
            render: (v: string) => <Text copyable style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</Text>,
        },
        {
            title: 'INVOICE AMT', dataIndex: 'invoice_amount', key: 'inv_amt', width: 110,
            render: (v: number) => <Text strong>{Number(v).toFixed(0)} MAD</Text>,
        },
        {
            title: 'ORDER', key: 'order', width: 120,
            render: (_: any, r: InvoiceRow) => r.matched
                ? <Tag color="green" icon={<LinkOutlined />}>{r.order_number}</Tag>
                : <Tag color="red" icon={<DisconnectOutlined />}>No match</Tag>,
        },
        {
            title: 'ORDER AMT', key: 'order_amt', width: 110,
            render: (_: any, r: InvoiceRow) => r.order_amount
                ? <Space>
                    <Text>{Number(r.order_amount).toFixed(0)} MAD</Text>
                    {r.amount_mismatch && <WarningOutlined style={{ color: '#fa8c16' }} />}
                </Space>
                : <Text style={{ opacity: 0.3 }}>—</Text>,
        },
        {
            title: 'STATUS', dataIndex: 'status', key: 'status', width: 100,
            render: (v: string) => {
                const colors: Record<string, string> = { pending: 'gold', approved: 'green', rejected: 'red' };
                return <Tag color={colors[v]}>{v}</Tag>;
            },
        },
        {
            title: 'DATE', dataIndex: 'invoice_date', key: 'date', width: 100,
            render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
        },
        {
            title: 'ACTIONS', key: 'actions', width: 100,
            render: (_: any, r: InvoiceRow) => r.status === 'pending' ? (
                <Space size={0}>
                    <Button type="text" size="small" style={{ color: '#52c41a' }} icon={<CheckOutlined />} onClick={() => handleApprove(r.id)} />
                    <Popconfirm title="Reject this invoice?" onConfirm={() => handleReject(r.id)}>
                        <Button type="text" size="small" danger icon={<CloseOutlined />} />
                    </Popconfirm>
                </Space>
            ) : null,
        },
    ];

    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>🧾 Courier Invoices</Title>
                <Space>
                    <input
                        type="file" accept=".csv,.txt" ref={fileRef} style={{ display: 'none' }}
                        onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    />
                    <Button type="primary" size="small" icon={<FileExcelOutlined />}
                        loading={uploading} onClick={() => fileRef.current?.click()}>
                        Upload CSV
                    </Button>
                </Space>
            </div>

            <Row gutter={12} style={{ marginBottom: 16 }}>
                <Col xs={8}>
                    <Card size="small" style={{ borderLeft: '3px solid #faad14' }}>
                        <Statistic title="Pending Review" value={pending} valueStyle={{ fontSize: 18, color: '#faad14' }} />
                    </Card>
                </Col>
                <Col xs={8}>
                    <Card size="small" style={{ borderLeft: '3px solid #52c41a' }}>
                        <Statistic title="Approved" value={approved} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
                    </Card>
                </Col>
                <Col xs={8}>
                    <Card size="small" style={{ borderLeft: '3px solid #ff4d4f' }}>
                        <Statistic title="Unmatched" value={unmatched} valueStyle={{ fontSize: 18, color: '#ff4d4f' }} />
                    </Card>
                </Col>
            </Row>

            <Alert
                message="CSV Format: tracking_number, amount, date (one row per line, header row expected)"
                type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }}
            />

            <div style={{ marginBottom: 12 }}>
                <Select placeholder="Filter by status" allowClear value={statusFilter || undefined}
                    onChange={v => setStatusFilter(v || '')} style={{ width: 150 }}
                    options={[
                        { value: 'pending', label: 'Pending' },
                        { value: 'approved', label: 'Approved' },
                        { value: 'rejected', label: 'Rejected' },
                    ]}
                />
            </div>

            <Table columns={columns} dataSource={invoices} rowKey="id" loading={loading} size="small"
                pagination={{ pageSize: 50 }} />
        </div>
    );
}
