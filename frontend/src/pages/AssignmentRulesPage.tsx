import { useState, useEffect } from 'react';
import {
    Button, Card, Row, Col, Typography, Tag, Switch, Select, InputNumber,
    Space, message, Table, Empty, Tooltip, Popconfirm, Statistic, Alert,
} from 'antd';
import {
    SyncOutlined, ShoppingOutlined, StarOutlined, UserOutlined,
    PlusOutlined, DeleteOutlined, ReloadOutlined, CheckCircleOutlined,
    ThunderboltOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import api from '../api/client';

const { Title, Text } = Typography;

const MODE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
    round_robin: {
        label: '🔄 Quota Round Robin',
        icon: <SyncOutlined />,
        color: '#1890ff',
        desc: 'Assign N orders to each agent in sequence. When quota is reached, move to the next agent and cycle.',
    },
    by_product: {
        label: '📦 By Product',
        icon: <ShoppingOutlined />,
        color: '#722ed1',
        desc: 'Route orders to specific agents based on the product. Map each product to an agent.',
    },
    by_performance: {
        label: '⭐ By Performance',
        icon: <StarOutlined />,
        color: '#fa8c16',
        desc: 'Like quota round robin, but best-performing agents (highest confirmation rate) get more orders.',
    },
    manual: {
        label: '✋ Manual',
        icon: <UserOutlined />,
        color: '#8c8c8c',
        desc: 'No auto-assignment. Admin assigns orders manually from the Orders page.',
    },
};

export default function AssignmentRulesPage() {
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [agents, setAgents] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [productMappings, setProductMappings] = useState<any[]>([]);
    const [runtimeState, setRuntimeState] = useState<any>(null);

    // Local editing state
    const [selectedMode, setSelectedMode] = useState<string>('manual');
    const [selectedAgents, setSelectedAgents] = useState<{ agent_id: string; quota: number }[]>([]);
    const [newMappingProduct, setNewMappingProduct] = useState<string | undefined>();
    const [newMappingAgent, setNewMappingAgent] = useState<string | undefined>();

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const res = await api.get('/assignment-config');
            const data = res.data.data;
            setConfig(data);
            if (data) {
                setSelectedMode(data.mode);
                setSelectedAgents(data.config?.agents || []);
            }
        } catch { message.error('Failed to load config'); }
        setLoading(false);
    };

    const fetchAgents = async () => {
        try {
            const res = await api.get('/assignment-config/agents');
            setAgents(res.data.data || []);
        } catch { }
    };

    const fetchProducts = async () => {
        try {
            const res = await api.get('/products', { params: { pageSize: 200 } });
            setProducts(res.data.data || []);
        } catch { }
    };

    const fetchMappings = async () => {
        try {
            const res = await api.get('/assignment-config/product-mappings');
            setProductMappings(res.data.data || []);
        } catch { }
    };

    const fetchState = async () => {
        try {
            const res = await api.get('/assignment-config/state');
            setRuntimeState(res.data.data);
        } catch { }
    };

    useEffect(() => { fetchConfig(); fetchAgents(); fetchProducts(); fetchMappings(); fetchState(); }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/assignment-config', {
                mode: selectedMode,
                is_active: config?.is_active ?? true,
                config: {
                    agents: (selectedMode === 'round_robin' || selectedMode === 'by_performance')
                        ? selectedAgents : undefined,
                },
            });
            message.success('Assignment config saved!');
            fetchConfig();
            fetchState();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Failed to save');
        }
        setSaving(false);
    };

    const handleToggle = async () => {
        try {
            await api.put('/assignment-config/toggle');
            fetchConfig();
        } catch { message.error('Failed to toggle'); }
    };

    const addAgent = (agentId: string) => {
        if (selectedAgents.find(a => a.agent_id === agentId)) return;
        setSelectedAgents([...selectedAgents, { agent_id: agentId, quota: 10 }]);
    };

    const removeAgent = (agentId: string) => {
        setSelectedAgents(selectedAgents.filter(a => a.agent_id !== agentId));
    };

    const updateQuota = (agentId: string, quota: number) => {
        setSelectedAgents(selectedAgents.map(a => a.agent_id === agentId ? { ...a, quota } : a));
    };

    const addProductMapping = async () => {
        if (!newMappingProduct || !newMappingAgent) {
            message.warning('Select both product and agent');
            return;
        }
        try {
            await api.post('/assignment-config/product-mappings', {
                product_id: newMappingProduct,
                agent_id: newMappingAgent,
            });
            message.success('Mapping added');
            setNewMappingProduct(undefined);
            setNewMappingAgent(undefined);
            fetchMappings();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Failed to add mapping');
        }
    };

    const deleteMapping = async (id: string) => {
        try {
            await api.delete(`/assignment-config/product-mappings/${id}`);
            message.success('Mapping removed');
            fetchMappings();
        } catch { message.error('Failed to delete'); }
    };

    const getAgentName = (id: string) => agents.find(a => a.id === id)?.full_name || 'Unknown';

    const hasChanges = () => {
        if (!config) return selectedMode !== 'manual';
        if (selectedMode !== config.mode) return true;
        const cfgAgents = config.config?.agents || [];
        if (JSON.stringify(selectedAgents) !== JSON.stringify(cfgAgents)) return true;
        return false;
    };

    return (
        <div style={{ padding: '16px 20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>
                        <ThunderboltOutlined style={{ marginRight: 8 }} />
                        Assignment Configuration
                    </Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Configure how new orders are automatically assigned to agents
                    </Text>
                </div>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={() => { fetchConfig(); fetchAgents(); fetchState(); }}>
                        Refresh
                    </Button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 12 }}>Auto-assign:</Text>
                        <Switch
                            checked={config?.is_active}
                            onChange={handleToggle}
                            checkedChildren="ON"
                            unCheckedChildren="OFF"
                        />
                    </div>
                </Space>
            </div>

            {/* Runtime State Card */}
            {config?.is_active && config?.mode !== 'manual' && runtimeState && (
                <Alert
                    type="info" showIcon
                    style={{ marginBottom: 16 }}
                    message={
                        <span style={{ fontSize: 12 }}>
                            <strong>Current Assignment:</strong>{' '}
                            {runtimeState.current_agent_name
                                ? `Assigning to ${runtimeState.current_agent_name} (${runtimeState.current_count || 0}/${runtimeState.current_quota || '?'})`
                                : 'Waiting for first order...'
                            }
                        </span>
                    }
                />
            )}

            {/* Mode Selector Cards */}
            <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                {Object.entries(MODE_CONFIG).map(([key, cfg]) => {
                    const isActive = selectedMode === key;
                    return (
                        <Col xs={12} sm={6} key={key}>
                            <Card
                                hoverable
                                onClick={() => setSelectedMode(key)}
                                style={{
                                    cursor: 'pointer',
                                    borderColor: isActive ? cfg.color : undefined,
                                    borderWidth: isActive ? 2 : 1,
                                    background: isActive ? `${cfg.color}08` : undefined,
                                    transition: 'all 0.2s',
                                }}
                                styles={{ body: { padding: '14px 16px' } }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                                    <Text strong style={{ fontSize: 13, color: isActive ? cfg.color : undefined }}>
                                        {cfg.label}
                                    </Text>
                                    {isActive && (
                                        <CheckCircleOutlined style={{ color: cfg.color, marginLeft: 'auto' }} />
                                    )}
                                </div>
                                <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.4, display: 'block' }}>
                                    {cfg.desc}
                                </Text>
                            </Card>
                        </Col>
                    );
                })}
            </Row>

            {/* Mode-specific Configuration */}
            <Card
                title={
                    <span style={{ fontSize: 14 }}>
                        ⚙️ {MODE_CONFIG[selectedMode]?.label || 'Configuration'}
                    </span>
                }
                extra={
                    <Button
                        type="primary"
                        onClick={handleSave}
                        loading={saving}
                        disabled={!hasChanges()}
                    >
                        💾 Save Configuration
                    </Button>
                }
                styles={{ body: { padding: '16px 20px' } }}
            >
                {/* ── Round Robin Config ── */}
                {selectedMode === 'round_robin' && (
                    <div>
                        <div style={{ marginBottom: 12 }}>
                            <Text style={{ fontSize: 12, fontWeight: 600 }}>Select Agents & Set Quota</Text>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                Orders are assigned one-by-one. When an agent reaches their quota, the next agent starts receiving orders. The cycle repeats.
                            </div>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <Select
                                placeholder="+ Add agent..."
                                showSearch
                                filterOption={(input, option) =>
                                    (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
                                }
                                value={undefined}
                                onChange={(v) => addAgent(v)}
                                style={{ width: 280 }}
                                options={agents
                                    .filter(a => !selectedAgents.find(sa => sa.agent_id === a.id))
                                    .map(a => ({ value: a.id, label: `${a.full_name} (${a.pending_count || 0} pending)` }))
                                }
                            />
                        </div>
                        {selectedAgents.length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No agents selected" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {selectedAgents.map((sa, idx) => {
                                    const agent = agents.find(a => a.id === sa.agent_id);
                                    return (
                                        <div
                                            key={sa.agent_id}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '10px 14px', borderRadius: 8,
                                                border: '1px solid var(--border-light)',
                                                background: 'var(--bg-secondary)',
                                            }}
                                        >
                                            <div style={{
                                                width: 28, height: 28, borderRadius: '50%',
                                                background: '#1890ff15', color: '#1890ff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 700, fontSize: 12,
                                            }}>
                                                {idx + 1}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <Text strong style={{ fontSize: 13 }}>
                                                    {agent?.full_name || 'Unknown'}
                                                </Text>
                                                {agent && (
                                                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                                        {agent.pending_count || 0} pending • {agent.confirmation_rate || 0}% rate
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Text style={{ fontSize: 11 }}>Quota:</Text>
                                                <InputNumber
                                                    size="small"
                                                    min={1} max={1000}
                                                    value={sa.quota}
                                                    onChange={(v) => updateQuota(sa.agent_id, v || 10)}
                                                    style={{ width: 70 }}
                                                />
                                            </div>
                                            <Button
                                                type="text" danger size="small"
                                                icon={<DeleteOutlined />}
                                                onClick={() => removeAgent(sa.agent_id)}
                                            />
                                        </div>
                                    );
                                })}
                                <div style={{
                                    padding: '8px 14px', borderRadius: 6,
                                    background: '#1890ff08', border: '1px dashed #1890ff40',
                                    fontSize: 11, color: '#1890ff',
                                }}>
                                    <InfoCircleOutlined style={{ marginRight: 4 }} />
                                    Total cycle: {selectedAgents.reduce((sum, a) => sum + a.quota, 0)} orders before repeating
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── By Product Config ── */}
                {selectedMode === 'by_product' && (
                    <div>
                        <div style={{ marginBottom: 12 }}>
                            <Text style={{ fontSize: 12, fontWeight: 600 }}>Product → Agent Mappings</Text>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                Map each product to a specific agent. Orders with that product will be automatically assigned to the mapped agent.
                            </div>
                        </div>

                        {/* Add mapping form */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            <Select
                                showSearch
                                placeholder="Select product..."
                                value={newMappingProduct}
                                onChange={setNewMappingProduct}
                                style={{ flex: 1 }}
                                filterOption={(input, option) =>
                                    (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
                                }
                                options={products
                                    .filter(p => !productMappings.find(m => m.product_id === p.id))
                                    .map(p => ({ value: p.id, label: p.name }))
                                }
                            />
                            <Select
                                showSearch
                                placeholder="Select agent..."
                                value={newMappingAgent}
                                onChange={setNewMappingAgent}
                                style={{ width: 200 }}
                                filterOption={(input, option) =>
                                    (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
                                }
                                options={agents.map(a => ({ value: a.id, label: a.full_name }))}
                            />
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={addProductMapping}
                                disabled={!newMappingProduct || !newMappingAgent}
                            >
                                Add
                            </Button>
                        </div>

                        {/* Mappings table */}
                        <Table
                            dataSource={productMappings}
                            rowKey="id"
                            size="small"
                            pagination={false}
                            locale={{
                                emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No product mappings yet" />,
                            }}
                            columns={[
                                {
                                    title: 'PRODUCT', dataIndex: 'product_name', key: 'product',
                                    render: (v: string) => <Text strong style={{ fontSize: 12 }}>{v}</Text>,
                                },
                                {
                                    title: 'AGENT', dataIndex: 'agent_name', key: 'agent',
                                    render: (v: string) => (
                                        <Tag color="purple" style={{ borderRadius: 4, fontSize: 11 }}>
                                            {v}
                                        </Tag>
                                    ),
                                },
                                {
                                    title: '', key: 'actions', width: 60, align: 'center' as const,
                                    render: (_: any, r: any) => (
                                        <Popconfirm title="Remove this mapping?" onConfirm={() => deleteMapping(r.id)}>
                                            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                                        </Popconfirm>
                                    ),
                                },
                            ]}
                        />
                    </div>
                )}

                {/* ── By Performance Config ── */}
                {selectedMode === 'by_performance' && (
                    <div>
                        <div style={{ marginBottom: 12 }}>
                            <Text style={{ fontSize: 12, fontWeight: 600 }}>Select Agents & Set Quota (Sorted by Performance)</Text>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                Same as round robin, but agents are automatically sorted by confirmation rate. Give higher quotas to your best agents.
                            </div>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <Select
                                placeholder="+ Add agent..."
                                showSearch
                                filterOption={(input, option) =>
                                    (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
                                }
                                value={undefined}
                                onChange={(v) => addAgent(v)}
                                style={{ width: 280 }}
                                options={agents
                                    .filter(a => !selectedAgents.find(sa => sa.agent_id === a.id))
                                    .map(a => ({ value: a.id, label: `${a.full_name} (${a.confirmation_rate || 0}% rate)` }))
                                }
                            />
                        </div>
                        {selectedAgents.length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No agents selected" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {/* Sort by confirmation rate visually */}
                                {[...selectedAgents]
                                    .sort((a, b) => {
                                        const aRate = agents.find(ag => ag.id === a.agent_id)?.confirmation_rate || 0;
                                        const bRate = agents.find(ag => ag.id === b.agent_id)?.confirmation_rate || 0;
                                        return bRate - aRate;
                                    })
                                    .map((sa, idx) => {
                                        const agent = agents.find(a => a.id === sa.agent_id);
                                        const rate = parseFloat(agent?.confirmation_rate || '0');
                                        return (
                                            <div
                                                key={sa.agent_id}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 10,
                                                    padding: '10px 14px', borderRadius: 8,
                                                    border: '1px solid var(--border-light)',
                                                    background: 'var(--bg-secondary)',
                                                }}
                                            >
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: '50%',
                                                    background: idx === 0 ? '#ffd70030' : '#fa8c1615',
                                                    color: idx === 0 ? '#fa8c16' : '#fa8c16',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontWeight: 700, fontSize: idx === 0 ? 14 : 12,
                                                }}>
                                                    {idx === 0 ? '⭐' : idx + 1}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <Text strong style={{ fontSize: 13 }}>
                                                        {agent?.full_name || 'Unknown'}
                                                    </Text>
                                                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                                        <Tag color={rate >= 70 ? 'green' : rate >= 40 ? 'gold' : 'red'}
                                                            style={{ fontSize: 9, borderRadius: 4, padding: '0 4px' }}>
                                                            {rate}% confirmation
                                                        </Tag>
                                                        {agent?.confirmed_count || 0} confirmed / {agent?.total_processed || 0} processed
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <Text style={{ fontSize: 11 }}>Quota:</Text>
                                                    <InputNumber
                                                        size="small"
                                                        min={1} max={1000}
                                                        value={sa.quota}
                                                        onChange={(v) => updateQuota(sa.agent_id, v || 10)}
                                                        style={{ width: 70 }}
                                                    />
                                                </div>
                                                <Button
                                                    type="text" danger size="small"
                                                    icon={<DeleteOutlined />}
                                                    onClick={() => removeAgent(sa.agent_id)}
                                                />
                                            </div>
                                        );
                                    })}
                                <div style={{
                                    padding: '8px 14px', borderRadius: 6,
                                    background: '#fa8c1608', border: '1px dashed #fa8c1640',
                                    fontSize: 11, color: '#fa8c16',
                                }}>
                                    <StarOutlined style={{ marginRight: 4 }} />
                                    Best agent gets orders first. Total cycle: {selectedAgents.reduce((sum, a) => sum + a.quota, 0)} orders.
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Manual Config ── */}
                {selectedMode === 'manual' && (
                    <div style={{
                        textAlign: 'center', padding: '40px 20px',
                    }}>
                        <UserOutlined style={{ fontSize: 36, color: '#8c8c8c', marginBottom: 12 }} />
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Manual Assignment Mode</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Orders will not be auto-assigned. Use the Orders page to manually assign orders to agents.
                        </Text>
                    </div>
                )}
            </Card>

            {/* Agent Stats Overview */}
            {agents.length > 0 && (
                <Card
                    title={<span style={{ fontSize: 14 }}>👥 Agent Performance Overview</span>}
                    size="small"
                    style={{ marginTop: 16 }}
                >
                    <Table
                        dataSource={agents}
                        rowKey="id"
                        size="small"
                        pagination={false}
                        columns={[
                            {
                                title: 'AGENT', key: 'name',
                                render: (_: any, r: any) => (
                                    <div>
                                        <Text strong style={{ fontSize: 12 }}>{r.full_name}</Text>
                                        <div style={{ fontSize: 10, opacity: 0.6 }}>{r.email}</div>
                                    </div>
                                ),
                            },
                            {
                                title: 'PENDING', dataIndex: 'pending_count', key: 'pending', width: 80, align: 'center' as const,
                                render: (v: number) => <Tag color="gold" style={{ borderRadius: 4, fontSize: 11, border: 'none' }}>{v || 0}</Tag>,
                            },
                            {
                                title: 'CONFIRMED', dataIndex: 'confirmed_count', key: 'confirmed', width: 90, align: 'center' as const,
                                render: (v: number) => <Tag color="green" style={{ borderRadius: 4, fontSize: 11, border: 'none' }}>{v || 0}</Tag>,
                            },
                            {
                                title: 'PROCESSED', dataIndex: 'total_processed', key: 'processed', width: 90, align: 'center' as const,
                                render: (v: number) => <Text style={{ fontSize: 12 }}>{v || 0}</Text>,
                            },
                            {
                                title: 'RATE', dataIndex: 'confirmation_rate', key: 'rate', width: 80, align: 'center' as const,
                                render: (v: string) => {
                                    const rate = parseFloat(v || '0');
                                    return (
                                        <Tag color={rate >= 70 ? 'green' : rate >= 40 ? 'gold' : rate > 0 ? 'red' : 'default'}
                                            style={{ borderRadius: 4, fontSize: 11, fontWeight: 600, border: 'none' }}>
                                            {rate}%
                                        </Tag>
                                    );
                                },
                            },
                            {
                                title: 'STATUS', key: 'available', width: 80, align: 'center' as const,
                                render: (_: any, r: any) => (
                                    <Tag color={r.is_available !== false ? 'green' : 'default'}
                                        style={{ borderRadius: 4, fontSize: 10, border: 'none' }}>
                                        {r.is_available !== false ? '🟢 Online' : '🔴 Away'}
                                    </Tag>
                                ),
                            },
                        ]}
                    />
                </Card>
            )}
        </div>
    );
}
