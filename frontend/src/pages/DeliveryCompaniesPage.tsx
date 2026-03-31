import { useState, useEffect } from 'react';
import {
    Table, Button, Card, Row, Col, Typography, Tag, Input, Space, Modal,
    Form, Switch, Popconfirm, message, Tabs, InputNumber, Divider, Tooltip, Alert,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, TruckOutlined,
    UploadOutlined, ReloadOutlined, ApiOutlined,
    CheckCircleOutlined, DisconnectOutlined,
} from '@ant-design/icons';
import api from '../api/client';

const { Title, Text } = Typography;



export default function DeliveryCompaniesPage() {
    const [couriers, setCouriers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCourier, setEditingCourier] = useState<any>(null);
    const [form] = Form.useForm();

    // City fees sub-section
    const [selectedCourier, setSelectedCourier] = useState<any>(null);
    const [cities, setCities] = useState<any[]>([]);
    const [citiesLoading, setCitiesLoading] = useState(false);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importCsv, setImportCsv] = useState('');
    const [editingCity, setEditingCity] = useState<Record<string, number>>({});

    // Active tab
    const [activeTab, setActiveTab] = useState('couriers');

    // Testing connection
    const [testingId, setTestingId] = useState<string | null>(null);

    const fetchCouriers = async () => {
        setLoading(true);
        try {
            const res = await api.get('/delivery/companies');
            setCouriers(res.data.data || []);
        } catch { message.error('Failed to load couriers'); }
        setLoading(false);
    };

    const fetchCities = async (courierId: string) => {
        setCitiesLoading(true);
        try {
            const res = await api.get(`/delivery/cities/${courierId}`);
            setCities(res.data.data || []);
        } catch { message.error('Failed to load cities'); }
        setCitiesLoading(false);
    };



    useEffect(() => { fetchCouriers(); }, []);

    const openCreate = () => { setEditingCourier(null); form.resetFields(); form.setFieldsValue({ isActive: true }); setModalOpen(true); };
    const openEdit = (c: any) => {
        setEditingCourier(c);
        form.setFieldsValue({
            name: c.name, apiEndpoint: c.api_endpoint || '',
            apiKey: c.api_key || '', isActive: c.is_active, notes: c.notes || '',
        });
        setModalOpen(true);
    };

    const handleSave = async (values: any) => {
        try {
            if (editingCourier) {
                await api.put(`/delivery/companies/${editingCourier.id}`, values);
                message.success('Courier updated');
            } else {
                await api.post('/delivery/companies', values);
                message.success('Courier created');
            }
            setModalOpen(false);
            fetchCouriers();
        } catch (err: any) { message.error(err.response?.data?.error?.message || 'Save failed'); }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/delivery/companies/${id}`);
            message.success('Courier deleted');
            fetchCouriers();
            if (selectedCourier?.id === id) setSelectedCourier(null);
        } catch { message.error('Delete failed'); }
    };

    const handleTestConnection = async (courier: any) => {
        if (!courier.api_key) {
            message.warning('No API key configured. Edit the courier to add one first.');
            return;
        }
        setTestingId(courier.id);
        try {
            const res = await api.post('/delivery/test-connection');
            if (res.data.success) {
                message.success(`✅ ${courier.name} — Connection successful!`);
            } else {
                message.error(`${courier.name} — ${res.data.error?.message || 'Connection failed'}`);
            }
        } catch {
            message.error(`Could not reach ${courier.name} API. Check your credentials.`);
        }
        setTestingId(null);
    };



    // --- City Fee Handlers ---
    const handleCityFeeUpdate = async (cityId: string, courierId: string, city: any) => {
        const fee = editingCity[cityId];
        if (fee === undefined) return;
        try {
            await api.put(`/delivery/cities/${courierId}/${cityId}`, {
                cityName: city.city_name, normalizedName: city.normalized_name,
                shippingFee: fee, isActive: city.is_active,
            });
            message.success('Fee updated');
            fetchCities(courierId);
            setEditingCity(prev => { const n = { ...prev }; delete n[cityId]; return n; });
        } catch { message.error('Update failed'); }
    };

    const handleCsvImport = async () => {
        if (!selectedCourier || !importCsv.trim()) return;
        try {
            const lines = importCsv.trim().split('\n').filter(l => l.trim());
            const cities = lines.map(line => {
                const [cityName, fee] = line.split(',').map(s => s.trim());
                return { cityName: cityName || '', shippingFee: parseFloat(fee) || 0 };
            }).filter(c => c.cityName && !isNaN(c.shippingFee));
            const res = await api.post('/delivery/cities/import', { courierId: selectedCourier.id, cities });
            message.success(`Imported: ${res.data.data.inserted} new, ${res.data.data.updated} updated`);
            setImportModalOpen(false);
            setImportCsv('');
            fetchCities(selectedCourier.id);
        } catch { message.error('Import failed'); }
    };

    // Determine if courier is "linked" (has API key)
    const isLinked = (c: any) => !!c.api_key;

    const courierColumns = [
        {
            title: 'NAME', dataIndex: 'name', key: 'name',
            render: (v: string, r: any) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text strong style={{ color: r.is_active ? undefined : '#bbb' }}>{v}</Text>
                    {!r.is_active && <Tag color="default">Inactive</Tag>}
                </div>
            ),
        },
        {
            title: 'STATUS', key: 'status', width: 120,
            render: (_: any, r: any) => isLinked(r) ? (
                <Tag icon={<CheckCircleOutlined />} color="success" style={{ borderRadius: 12 }}>
                    Linked
                </Tag>
            ) : (
                <Tag icon={<DisconnectOutlined />} color="default" style={{ borderRadius: 12 }}>
                    Not Linked
                </Tag>
            ),
        },
        {
            title: 'API', dataIndex: 'api_endpoint', key: 'api', width: 180,
            render: (v: string) => v ? (
                <Text style={{ fontSize: 11 }} type="secondary">{v.replace(/https?:\/\//, '')}</Text>
            ) : <Text type="secondary">—</Text>,
        },
        { title: 'CITIES', dataIndex: 'city_count', key: 'cities', width: 70, align: 'center' as const },
        {
            title: 'ACTIONS', key: 'actions', width: 280,
            render: (_: any, r: any) => (
                <Space size={4}>
                    <Button size="small" icon={<TruckOutlined />}
                        onClick={() => { setSelectedCourier(r); setActiveTab('cities'); fetchCities(r.id); }}>
                        Cities
                    </Button>
                    <Tooltip title="Test API Connection">
                        <Button size="small" icon={<ApiOutlined />}
                            loading={testingId === r.id}
                            onClick={() => handleTestConnection(r)}
                            disabled={!isLinked(r)} />
                    </Tooltip>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                    <Popconfirm title="Delete courier?" onConfirm={() => handleDelete(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const cityColumns = [
        { title: 'CITY', dataIndex: 'city_name', key: 'city_name' },
        {
            title: 'FEE (MAD)', key: 'fee', width: 160,
            render: (_: any, r: any) => (
                <Space>
                    <InputNumber
                        size="small" style={{ width: 90 }}
                        defaultValue={parseFloat(r.shipping_fee)}
                        value={editingCity[r.id] !== undefined ? editingCity[r.id] : parseFloat(r.shipping_fee)}
                        onChange={(v) => setEditingCity(prev => ({ ...prev, [r.id]: v as number }))}
                        min={0} step={5}
                    />
                    <Button size="small" type="primary" onClick={() => handleCityFeeUpdate(r.id, selectedCourier.id, r)}>Save</Button>
                </Space>
            ),
        },
        {
            title: 'ACTIVE', dataIndex: 'is_active', key: 'is_active', width: 80,
            render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Active' : 'Off'}</Tag>,
        },
    ];

    const tabItems = [
        {
            key: 'couriers',
            label: '🚚 Couriers',
            children: (
                <Table
                    columns={courierColumns} dataSource={couriers} rowKey="id"
                    loading={loading} size="small"
                    pagination={{ pageSize: 20 }}
                />
            ),
        },
        {
            key: 'detection',
            label: '🔄 Auto Status Detection',
            children: (
                <div style={{ maxWidth: 700 }}>
                    <Alert
                        type="success"
                        showIcon
                        message="Status detection is automatic"
                        description="No manual mapping is needed. The CRM automatically detects delivery statuses from any courier using smart keyword matching."
                        style={{ marginBottom: 16 }}
                    />
                    <Card size="small" style={{ marginBottom: 16 }}>
                        <Text strong style={{ fontSize: 14, marginBottom: 12, display: 'block' }}>
                            How it works
                        </Text>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', gap: '8px 12px', alignItems: 'center' }}>
                            <Text strong style={{ fontSize: 11, textTransform: 'uppercase', color: '#888' }}>Courier Status Contains</Text>
                            <div />
                            <Text strong style={{ fontSize: 11, textTransform: 'uppercase', color: '#888' }}>CRM Action</Text>

                            <Tag color="green" style={{ width: 'fit-content' }}>"livr" (Livré, Livre, Livrée...)</Tag>
                            <div style={{ textAlign: 'center' }}>→</div>
                            <div><Tag color="green">Delivered</Tag> <Text type="secondary" style={{ fontSize: 11 }}>+ commission + paid</Text></div>

                            <Tag color="red" style={{ width: 'fit-content' }}>"refus" / "retour" / "annul"</Tag>
                            <div style={{ textAlign: 'center' }}>→</div>
                            <div><Tag color="red">Returned</Tag> <Text type="secondary" style={{ fontSize: 11 }}>→ pending verification</Text></div>

                            <Tag color="blue" style={{ width: 'fit-content' }}>Anything else</Tag>
                            <div style={{ textAlign: 'center' }}>→</div>
                            <div><Tag color="blue">In Transit</Tag> <Text type="secondary" style={{ fontSize: 11 }}>still in progress</Text></div>
                        </div>
                    </Card>
                    <Card size="small" style={{ background: '#fafafa' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            <strong>💡</strong> The original courier status (e.g. "Ramassé", "En cours de livraison") is always
                            shown in the orders table as a 🚚 label. The CRM uses smart detection to trigger business logic
                            (commissions, return verification) without needing manual status mapping.
                        </Text>
                    </Card>
                </div>
            ),
        },
        ...(selectedCourier ? [{
            key: 'cities',
            label: `🏙️ Cities — ${selectedCourier.name}`,
            children: (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text strong>{cities.length} cities configured</Text>
                        <Space>
                            <Button icon={<UploadOutlined />} size="small" onClick={() => setImportModalOpen(true)}>CSV Import</Button>
                            <Button size="small" onClick={() => { setSelectedCourier(null); setActiveTab('couriers'); }}>← Back</Button>
                        </Space>
                    </div>
                    <Table
                        columns={cityColumns} dataSource={cities} rowKey="id"
                        loading={citiesLoading} size="small"
                        pagination={{ pageSize: 50 }}
                    />
                </div>
            ),
        }] : []),
    ];

    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>🚚 Delivery Companies</Title>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={fetchCouriers}>Refresh</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Courier</Button>
                </Space>
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={k => {
                    setActiveTab(k);
                    if (k === 'couriers') { setSelectedCourier(null); }
                }}
                items={tabItems}
            />

            {/* Add/Edit Courier Modal */}
            <Modal
                title={editingCourier ? 'Edit Courier' : 'Add Courier'}
                open={modalOpen} onCancel={() => setModalOpen(false)}
                footer={null} destroyOnClose width={520}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}
                    initialValues={{ isActive: true }}>
                    <Form.Item name="name" label="Company Name" rules={[{ required: true }]}>
                        <Input placeholder="e.g. Coliix" />
                    </Form.Item>

                    <Divider plain style={{ fontSize: 12, color: '#888' }}>API Credentials</Divider>

                    <Form.Item name="apiEndpoint" label="API Endpoint">
                        <Input placeholder="https://my.coliix.com/aga/seller/api-parcels" />
                    </Form.Item>
                    <Form.Item
                        name="apiKey"
                        label="API Key / Token"
                        extra={
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                Once saved with a valid API key, the courier will show as "Linked"
                            </Text>
                        }
                    >
                        <Input.Password placeholder="Paste your API token here" />
                    </Form.Item>

                    <Divider plain style={{ fontSize: 12, color: '#888' }}>Options</Divider>

                    <Form.Item name="notes" label="Notes">
                        <Input.TextArea rows={2} placeholder="Internal notes about this courier" />
                    </Form.Item>
                    <Form.Item name="isActive" label="Active" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                    <Row justify="end">
                        <Space>
                            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit">
                                {editingCourier ? 'Update' : 'Add'} Courier
                            </Button>
                        </Space>
                    </Row>
                </Form>
            </Modal>

            {/* CSV Import Modal */}
            <Modal
                title={`Import City Fees — ${selectedCourier?.name}`}
                open={importModalOpen} onCancel={() => { setImportModalOpen(false); setImportCsv(''); }}
                onOk={handleCsvImport} okText="Import"
            >
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Paste CSV data (one city per line): <code>CityName, Fee</code>
                </Text>
                <Input.TextArea
                    rows={10} style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
                    placeholder={'Casablanca, 25\nRabat, 25\nMarrakech, 30\nFes, 30'}
                    value={importCsv} onChange={e => setImportCsv(e.target.value)}
                />
            </Modal>
        </div>
    );
}
