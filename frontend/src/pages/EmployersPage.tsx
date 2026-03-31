import { useState, useEffect } from 'react';
import {
    Table, Button, Card, Typography, Tabs, Tag, Input, InputNumber,
    Modal, Form, Space, message, DatePicker, Popconfirm, Tooltip,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined,
    CalendarOutlined, DollarOutlined, HistoryOutlined, TeamOutlined,
    UserOutlined,
} from '@ant-design/icons';
import api from '../api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const ACCENT = '#0d9488'; // teal accent for this section
const BG_TINT = 'rgba(13, 148, 136, 0.04)';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekStart(date?: dayjs.Dayjs): string {
    const d = date || dayjs();
    const day = d.day(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day;
    return d.add(diff, 'day').format('YYYY-MM-DD');
}

function getWeekDays(weekStart: string): string[] {
    const start = dayjs(weekStart);
    return Array.from({ length: 7 }, (_, i) => start.add(i, 'day').format('YYYY-MM-DD'));
}

// ═══════════════════════════════════════════════════
// EMP INFO TAB
// ═══════════════════════════════════════════════════
function EmpInfoTab({ employers, loading, onRefresh }: { employers: any[]; loading: boolean; onRefresh: () => void }) {
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form] = Form.useForm();

    const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
    const openEdit = (emp: any) => {
        setEditing(emp);
        form.setFieldsValue({
            name: emp.name, age: emp.age, phone: emp.phone,
            role: emp.role, salary: parseFloat(emp.salary),
            joinDate: emp.join_date ? dayjs(emp.join_date) : null,
        });
        setModalOpen(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            const payload = { ...values, joinDate: values.joinDate?.format('YYYY-MM-DD') };
            if (editing) {
                await api.put(`/employers/${editing.id}`, payload);
                message.success('Employer updated');
            } else {
                await api.post('/employers', payload);
                message.success('Employer added');
            }
            setModalOpen(false); onRefresh();
        } catch (err: any) {
            message.error(err.response?.data?.error?.message || 'Failed');
        }
    };

    const handleDelete = async (id: string) => {
        try { await api.delete(`/employers/${id}`); message.success('Deleted'); onRefresh(); }
        catch { message.error('Delete failed'); }
    };

    const columns = [
        { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },
        { title: 'Age', dataIndex: 'age', key: 'age', width: 60, render: (v: any) => v ?? '—' },
        { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 120, render: (v: any) => v ?? '—' },
        { title: 'Role', dataIndex: 'role', key: 'role', render: (v: any) => v ? <Tag color="cyan" style={{ border: 'none', borderRadius: 6 }}>{v}</Tag> : '—' },
        {
            title: 'Weekly Salary', dataIndex: 'salary', key: 'salary', width: 120,
            render: (v: any) => <Text strong style={{ color: ACCENT }}>{parseFloat(v || 0).toLocaleString('fr-FR')} MAD</Text>,
        },
        {
            title: 'Joined', dataIndex: 'join_date', key: 'join_date', width: 110,
            render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '—',
        },
        {
            title: 'Actions', key: 'actions', width: 90,
            render: (_: any, r: any) => (
                <Space size={4}>
                    <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} style={{ color: ACCENT }} />
                    <Popconfirm title="Delete this employer?" onConfirm={() => handleDelete(r.id)}>
                        <Button type="text" icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}
                    style={{ background: ACCENT, borderColor: ACCENT, borderRadius: 8 }}>
                    Add Employer
                </Button>
            </div>
            <Table columns={columns} dataSource={employers} rowKey="id" loading={loading}
                size="small" pagination={{ pageSize: 20 }} />

            <Modal title={editing ? 'Edit Employer' : 'Add Employer'} open={modalOpen}
                onCancel={() => setModalOpen(false)} footer={null} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 12 }}>
                    <Form.Item name="name" label="Full Name" rules={[{ required: true }]}>
                        <Input placeholder="Employee name" />
                    </Form.Item>
                    <Space style={{ width: '100%' }} size={12}>
                        <Form.Item name="age" label="Age" style={{ flex: 1 }}>
                            <InputNumber placeholder="25" min={12} max={99} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="phone" label="Phone" style={{ flex: 1 }}>
                            <Input placeholder="06XXXXXXXX" />
                        </Form.Item>
                    </Space>
                    <Form.Item name="role" label="Role in Confection">
                        <Input placeholder="e.g. Cutter, Sewer, Ironer" />
                    </Form.Item>
                    <Space style={{ width: '100%' }} size={12}>
                        <Form.Item name="salary" label="Weekly Salary (MAD)" rules={[{ required: true }]} style={{ flex: 1 }}>
                            <InputNumber placeholder="3000" min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="joinDate" label="Join Date" style={{ flex: 1 }}>
                            <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                    </Space>
                    <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
                        <Space>
                            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit" style={{ background: ACCENT, borderColor: ACCENT }}>
                                {editing ? 'Update' : 'Add'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}

// ═══════════════════════════════════════════════════
// PRESENCE TAB
// ═══════════════════════════════════════════════════
function PresenceTab({ employers }: { employers: any[] }) {
    const [weekStart, setWeekStart] = useState(getWeekStart());
    const [attendance, setAttendance] = useState<Record<string, Record<string, string>>>({});
    const [saving, setSaving] = useState(false);

    const weekDays = getWeekDays(weekStart);

    const fetchAttendance = async () => {
        try {
            const res = await api.get('/employers/attendance', { params: { weekStart } });
            const map: Record<string, Record<string, string>> = {};
            (res.data.data || []).forEach((r: any) => {
                if (!map[r.employer_id]) map[r.employer_id] = {};
                map[r.employer_id][r.date.split('T')[0]] = r.status;
            });
            setAttendance(map);
        } catch { message.error('Failed to load attendance'); }
    };

    useEffect(() => { fetchAttendance(); }, [weekStart]);

    const cycleStatus = (empId: string, date: string) => {
        const current = attendance[empId]?.[date] || 'absent';
        const next = current === 'absent' ? 'full' : current === 'full' ? 'half' : 'absent';
        setAttendance(prev => ({
            ...prev,
            [empId]: { ...(prev[empId] || {}), [date]: next },
        }));
    };

    const cellStyle = (status: string) => {
        const base = { width: 50, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 6, fontSize: 11, fontWeight: 600 as const, transition: 'all 0.15s' };
        if (status === 'full') return { ...base, background: 'rgba(13,148,136,0.15)', color: ACCENT, border: `1px solid ${ACCENT}` };
        if (status === 'half') return { ...base, background: 'rgba(250,173,20,0.15)', color: '#d48806', border: '1px solid #faad14' };
        return { ...base, background: 'rgba(0,0,0,0.03)', color: '#bbb', border: '1px solid rgba(0,0,0,0.06)' };
    };

    const saveAttendance = async () => {
        setSaving(true);
        try {
            const records: any[] = [];
            for (const empId of Object.keys(attendance)) {
                for (const date of Object.keys(attendance[empId])) {
                    records.push({ employerId: empId, date, status: attendance[empId][date] });
                }
            }
            // Also add absent records for employers not yet in the map
            employers.forEach(emp => {
                weekDays.forEach(date => {
                    if (!records.find(r => r.employerId === emp.id && r.date === date)) {
                        records.push({ employerId: emp.id, date, status: 'absent' });
                    }
                });
            });
            await api.put('/employers/attendance', { weekStart, records });
            message.success('Attendance saved!');
        } catch { message.error('Failed to save'); }
        setSaving(false);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Space>
                    <Button size="small" onClick={() => setWeekStart(getWeekStart(dayjs(weekStart).subtract(7, 'day')))}>← Prev</Button>
                    <Tag color="blue" style={{ fontSize: 12, padding: '2px 10px', borderRadius: 6 }}>
                        Week of {dayjs(weekStart).format('DD MMM YYYY')}
                    </Tag>
                    <Button size="small" onClick={() => setWeekStart(getWeekStart(dayjs(weekStart).add(7, 'day')))}>Next →</Button>
                </Space>
                <Button type="primary" onClick={saveAttendance} loading={saving}
                    style={{ background: ACCENT, borderColor: ACCENT, borderRadius: 8 }}>
                    Save Attendance
                </Button>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, fontWeight: 600, opacity: 0.5, minWidth: 140 }}>EMPLOYEE</th>
                            {weekDays.map((d, i) => (
                                <th key={d} style={{ textAlign: 'center', padding: '6px 4px', fontSize: 11, fontWeight: 600, opacity: 0.5 }}>
                                    {DAYS[i]}<br /><span style={{ fontSize: 10 }}>{dayjs(d).format('DD')}</span>
                                </th>
                            ))}
                            <th style={{ textAlign: 'center', padding: '6px 4px', fontSize: 11, fontWeight: 600, opacity: 0.5 }}>TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employers.map(emp => {
                            const fullDays = weekDays.filter(d => attendance[emp.id]?.[d] === 'full').length;
                            const halfDays = weekDays.filter(d => attendance[emp.id]?.[d] === 'half').length;
                            const total = fullDays + halfDays * 0.5;
                            return (
                                <tr key={emp.id} style={{ background: 'var(--bg-elevated)' }}>
                                    <td style={{ padding: '6px 10px', fontWeight: 500, fontSize: 13 }}>{emp.name}</td>
                                    {weekDays.map(d => {
                                        const status = attendance[emp.id]?.[d] || 'absent';
                                        return (
                                            <td key={d} style={{ textAlign: 'center', padding: '4px' }}>
                                                <Tooltip title={`Click to toggle (${status})`}>
                                                    <div onClick={() => cycleStatus(emp.id, d)} style={cellStyle(status)}>
                                                        {status === 'full' ? '✓' : status === 'half' ? '½' : '—'}
                                                    </div>
                                                </Tooltip>
                                            </td>
                                        );
                                    })}
                                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: total > 0 ? ACCENT : '#ccc' }}>
                                        {total}d
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 11, opacity: 0.6 }}>
                <span>✓ = Full Day</span><span>½ = Half Day</span><span>— = Absent</span>
                <span style={{ marginLeft: 'auto' }}>Click cell to toggle status</span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════
// SALARY TAB
// ═══════════════════════════════════════════════════
function SalaryTab() {
    const [weekStart, setWeekStart] = useState(getWeekStart());
    const [salaries, setSalaries] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [calculating, setCalculating] = useState(false);

    const fetchSalary = async () => {
        setLoading(true);
        try {
            const res = await api.get('/employers/salary', { params: { weekStart } });
            setSalaries(res.data.data || []);
        } catch { message.error('Failed to load salary'); }
        setLoading(false);
    };

    useEffect(() => { fetchSalary(); }, [weekStart]);

    const calculate = async () => {
        setCalculating(true);
        try {
            await api.post('/employers/salary/calculate', { weekStart });
            message.success('Salary calculated from attendance');
            fetchSalary();
        } catch { message.error('Calculation failed'); }
        setCalculating(false);
    };

    const markPaid = async (id: string) => {
        try { await api.put(`/employers/salary/${id}/pay`); message.success('Marked as paid'); fetchSalary(); }
        catch { message.error('Failed'); }
    };

    const columns = [
        { title: 'Employee', dataIndex: 'employer_name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },
        { title: 'Full Days', dataIndex: 'full_days', key: 'full', width: 90, render: (v: number) => <Tag color="green" style={{ border: 'none' }}>{v}</Tag> },
        { title: 'Half Days', dataIndex: 'half_days', key: 'half', width: 90, render: (v: number) => <Tag color="gold" style={{ border: 'none' }}>{v}</Tag> },
        {
            title: 'Daily Rate', dataIndex: 'daily_rate', key: 'rate', width: 110,
            render: (v: any) => `${parseFloat(v || 0).toFixed(2)} MAD`,
        },
        {
            title: 'Total', dataIndex: 'total_amount', key: 'total', width: 120,
            render: (v: any) => <Text strong style={{ color: ACCENT, fontSize: 14 }}>{parseFloat(v || 0).toFixed(2)} MAD</Text>,
        },
        {
            title: 'Status', dataIndex: 'is_paid', key: 'paid', width: 100,
            render: (v: boolean) => v
                ? <Tag color="success" style={{ border: 'none' }}>✅ Paid</Tag>
                : <Tag color="warning" style={{ border: 'none' }}>⏳ Unpaid</Tag>,
        },
        {
            title: 'Action', key: 'action', width: 100,
            render: (_: any, r: any) => !r.is_paid ? (
                <Popconfirm title="Mark as paid?" onConfirm={() => markPaid(r.id)}>
                    <Button size="small" type="primary" style={{ background: ACCENT, borderColor: ACCENT, fontSize: 11 }}>
                        Pay
                    </Button>
                </Popconfirm>
            ) : <Text style={{ fontSize: 11, opacity: 0.5 }}>{r.paid_at ? dayjs(r.paid_at).format('DD/MM HH:mm') : ''}</Text>,
        },
    ];

    const totalOwed = salaries.filter(s => !s.is_paid).reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Space>
                    <Button size="small" onClick={() => setWeekStart(getWeekStart(dayjs(weekStart).subtract(7, 'day')))}>← Prev</Button>
                    <Tag color="blue" style={{ fontSize: 12, padding: '2px 10px', borderRadius: 6 }}>
                        Week of {dayjs(weekStart).format('DD MMM YYYY')}
                    </Tag>
                    <Button size="small" onClick={() => setWeekStart(getWeekStart(dayjs(weekStart).add(7, 'day')))}>Next →</Button>
                </Space>
                <Space>
                    {totalOwed > 0 && (
                        <Tag color="red" style={{ fontSize: 12, padding: '2px 10px', borderRadius: 6, fontWeight: 600 }}>
                            Owed: {totalOwed.toFixed(2)} MAD
                        </Tag>
                    )}
                    <Button onClick={calculate} loading={calculating}
                        style={{ borderColor: ACCENT, color: ACCENT, borderRadius: 8 }}>
                        🧮 Calculate from Attendance
                    </Button>
                </Space>
            </div>
            <Table columns={columns} dataSource={salaries} rowKey="id" loading={loading}
                size="small" pagination={false} />
        </div>
    );
}

// ═══════════════════════════════════════════════════
// HISTORY TAB
// ═══════════════════════════════════════════════════
function HistoryTab() {
    const [weeks, setWeeks] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [detailWeek, setDetailWeek] = useState<string | null>(null);
    const [detailData, setDetailData] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await api.get('/employers/history');
            setWeeks(res.data.data || []);
        } catch { message.error('Failed to load history'); }
        setLoading(false);
    };

    useEffect(() => { fetchHistory(); }, []);

    const viewDetail = async (ws: string) => {
        const formatted = dayjs(ws).format('YYYY-MM-DD');
        setDetailWeek(formatted);
        setDetailLoading(true);
        try {
            const res = await api.get(`/employers/history/${formatted}`);
            setDetailData(res.data.data);
        } catch { message.error('Failed to load detail'); }
        setDetailLoading(false);
    };

    const weekColumns = [
        {
            title: 'Week', dataIndex: 'week_start', key: 'week',
            render: (v: string) => {
                const end = dayjs(v).add(6, 'day');
                return <Text strong>{dayjs(v).format('DD MMM')} — {end.format('DD MMM YYYY')}</Text>;
            },
        },
        { title: 'Employees', dataIndex: 'total_employers', key: 'emps', width: 90 },
        { title: 'Full', dataIndex: 'total_full_days', key: 'full', width: 70, render: (v: number) => <Tag color="green" style={{ border: 'none' }}>{v}</Tag> },
        { title: 'Half', dataIndex: 'total_half_days', key: 'half', width: 70, render: (v: number) => <Tag color="gold" style={{ border: 'none' }}>{v}</Tag> },
        { title: 'Absent', dataIndex: 'total_absent_days', key: 'absent', width: 70, render: (v: number) => <Tag color="red" style={{ border: 'none' }}>{v || 0}</Tag> },
        {
            title: 'Total Earned', dataIndex: 'total_amount', key: 'amount', width: 130,
            render: (v: any) => <Text strong style={{ color: ACCENT }}>{parseFloat(v || 0).toFixed(2)} MAD</Text>,
        },
        {
            title: '', key: 'view', width: 80,
            render: (_: any, r: any) => (
                <Button size="small" type="primary" ghost style={{ borderColor: ACCENT, color: ACCENT, borderRadius: 6, fontSize: 11 }}
                    onClick={() => viewDetail(r.week_start)}>
                    View →
                </Button>
            ),
        },
    ];

    // Full detail columns — per employee for the selected week
    const detailColumns = [
        { title: 'Employee', dataIndex: 'employer_name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },
        { title: 'Role', dataIndex: 'employer_role', key: 'role', width: 100, render: (v: any) => v ? <Tag color="cyan" style={{ border: 'none', borderRadius: 6 }}>{v}</Tag> : '—' },
        { title: 'Full Days', dataIndex: 'full_days', key: 'full', width: 80, render: (v: number) => <Tag color="green" style={{ border: 'none' }}>{v}</Tag> },
        { title: 'Half Days', dataIndex: 'half_days', key: 'half', width: 80, render: (v: number) => <Tag color="gold" style={{ border: 'none' }}>{v}</Tag> },
        { title: 'Absent', dataIndex: 'absent_days', key: 'absent', width: 70, render: (v: number) => <Tag color="red" style={{ border: 'none' }}>{v}</Tag> },
        {
            title: 'Total Worked', dataIndex: 'total_worked', key: 'worked', width: 100,
            render: (v: any) => <Text strong>{parseFloat(v || 0)} days</Text>,
        },
        {
            title: 'Daily Rate', dataIndex: 'daily_rate', key: 'rate', width: 100,
            render: (v: any) => `${parseFloat(v || 0).toFixed(2)} MAD`,
        },
        {
            title: 'Earned', dataIndex: 'earned', key: 'earned', width: 110,
            render: (v: any) => <Text strong style={{ color: ACCENT }}>{parseFloat(v || 0).toFixed(2)} MAD</Text>,
        },
        {
            title: 'Paid', dataIndex: 'is_paid', key: 'paid', width: 80,
            render: (v: boolean) => v
                ? <Tag color="success" style={{ border: 'none' }}>✅ Paid</Tag>
                : <Tag color="error" style={{ border: 'none' }}>❌ No</Tag>,
        },
    ];

    return (
        <div>
            <Table columns={weekColumns} dataSource={weeks}
                rowKey={(r: any) => dayjs(r.week_start).format('YYYY-MM-DD')}
                loading={loading} size="small" pagination={{ pageSize: 10 }} />

            <Modal
                title={detailWeek ? `📋 Week of ${dayjs(detailWeek).format('DD MMM')} — ${dayjs(detailWeek).add(6, 'day').format('DD MMM YYYY')}` : 'Detail'}
                open={!!detailWeek} onCancel={() => { setDetailWeek(null); setDetailData(null); }} footer={null} width={900}
            >
                {detailData && detailData.employees && detailData.employees.length > 0 ? (
                    <Table columns={detailColumns} dataSource={detailData.employees} rowKey="employer_id"
                        loading={detailLoading} size="small" pagination={false}
                        summary={(data) => {
                            const rows = data as any[];
                            const totFull = rows.reduce((s, r) => s + (r.full_days || 0), 0);
                            const totHalf = rows.reduce((s, r) => s + (r.half_days || 0), 0);
                            const totAbsent = rows.reduce((s, r) => s + (r.absent_days || 0), 0);
                            const totEarned = rows.reduce((s, r) => s + parseFloat(r.earned || 0), 0);
                            return (
                                <Table.Summary.Row style={{ fontWeight: 700 }}>
                                    <Table.Summary.Cell index={0}>TOTAL</Table.Summary.Cell>
                                    <Table.Summary.Cell index={1} />
                                    <Table.Summary.Cell index={2}>{totFull}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={3}>{totHalf}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={4}>{totAbsent}</Table.Summary.Cell>
                                    <Table.Summary.Cell index={5} />
                                    <Table.Summary.Cell index={6} />
                                    <Table.Summary.Cell index={7}><Text strong style={{ color: ACCENT }}>{totEarned.toFixed(2)} MAD</Text></Table.Summary.Cell>
                                    <Table.Summary.Cell index={8} />
                                </Table.Summary.Row>
                            );
                        }}
                    />
                ) : (
                    <div style={{ textAlign: 'center', padding: 24, opacity: 0.5 }}>No data for this week</div>
                )}
            </Modal>
        </div>
    );
}

// ═══════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════
export default function EmployersPage() {
    const [employers, setEmployers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchEmployers = async () => {
        setLoading(true);
        try {
            const res = await api.get('/employers');
            setEmployers(res.data.data || []);
        } catch { message.error('Failed to load employers'); }
        setLoading(false);
    };

    useEffect(() => { fetchEmployers(); }, []);

    const tabItems = [
        {
            key: 'info',
            label: <span><UserOutlined /> Emp Info</span>,
            children: <EmpInfoTab employers={employers} loading={loading} onRefresh={fetchEmployers} />,
        },
        {
            key: 'presence',
            label: <span><CalendarOutlined /> Presence</span>,
            children: <PresenceTab employers={employers} />,
        },
        {
            key: 'salary',
            label: <span><DollarOutlined /> Salary</span>,
            children: <SalaryTab />,
        },
        {
            key: 'history',
            label: <span><HistoryOutlined /> History</span>,
            children: <HistoryTab />,
        },
    ];

    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Title level={4} style={{ margin: 0, color: ACCENT }}>
                    <TeamOutlined style={{ marginRight: 8 }} />Employers
                </Title>
                <Tag style={{ background: BG_TINT, color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 8, fontSize: 12, padding: '2px 10px' }}>
                    {employers.length} Employee{employers.length !== 1 ? 's' : ''}
                </Tag>
            </div>

            <Card
                styles={{ body: { padding: '8px 16px 16px' } }}
                style={{ borderTop: `3px solid ${ACCENT}`, borderRadius: 10 }}
            >
                <Tabs defaultActiveKey="info" items={tabItems} size="small"
                    tabBarStyle={{ marginBottom: 12 }} />
            </Card>
        </div>
    );
}
