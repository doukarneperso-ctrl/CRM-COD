import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Typography, message, Card } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';

const { Title, Text } = Typography;

export default function LoginPage() {
    const navigate = useNavigate();
    const { login, error, clearError } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const isDark = useThemeStore((s) => s.mode === 'dark');

    const onFinish = async (values: { username: string; password: string }) => {
        setLoading(true);
        clearError();
        const success = await login(values.username, values.password);
        setLoading(false);

        if (success) {
            message.success('Welcome back!');
            navigate('/');
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isDark
                ? 'linear-gradient(135deg, #1a1207 0%, #2d1f0e 30%, #3d2914 60%, #1a1207 100%)'
                : 'linear-gradient(135deg, #f5f0eb 0%, #ede4da 30%, #f0e8df 60%, #f5f0eb 100%)',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Decorative background elements */}
            <div style={{
                position: 'absolute',
                width: '500px',
                height: '500px',
                borderRadius: '50%',
                background: isDark
                    ? 'radial-gradient(circle, rgba(139,90,43,0.15) 0%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(139,90,43,0.08) 0%, transparent 70%)',
                top: '-150px',
                right: '-80px',
            }} />
            <div style={{
                position: 'absolute',
                width: '350px',
                height: '350px',
                borderRadius: '50%',
                background: isDark
                    ? 'radial-gradient(circle, rgba(193,142,83,0.1) 0%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(193,142,83,0.06) 0%, transparent 70%)',
                bottom: '-80px',
                left: '-40px',
            }} />

            <Card
                style={{
                    width: 400,
                    borderRadius: 16,
                    border: isDark ? '1px solid rgba(139,90,43,0.3)' : '1px solid rgba(139,90,43,0.12)',
                    background: isDark ? 'rgba(30,22,12,0.95)' : 'rgba(255,255,255,0.95)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: isDark
                        ? '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(139,90,43,0.1)'
                        : '0 8px 32px rgba(0,0,0,0.06), 0 2px 8px rgba(139,90,43,0.08)',
                }}
                styles={{ body: { padding: '36px 32px' } }}
            >
                {/* Logo / Brand */}
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{
                        width: 56,
                        height: 56,
                        margin: '0 auto 14px',
                        borderRadius: 14,
                        background: 'linear-gradient(135deg, #8B5A2B, #C18E53)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 24,
                        color: '#fff',
                        fontWeight: 700,
                        boxShadow: isDark
                            ? '0 8px 24px rgba(139,90,43,0.4)'
                            : '0 4px 16px rgba(139,90,43,0.25)',
                    }}>
                        A
                    </div>
                    <Title level={3} style={{
                        color: isDark ? '#e8d5c0' : '#2c1e10',
                        margin: 0,
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        fontSize: 20,
                    }}>
                        ANAQATOKI
                    </Title>
                    <Text style={{
                        color: isDark ? 'rgba(193,142,83,0.6)' : 'rgba(60,40,20,0.5)',
                        fontSize: 12,
                    }}>
                        CRM Management System
                    </Text>
                </div>

                {/* Error message */}
                {error && (
                    <div style={{
                        padding: '8px 14px',
                        background: isDark ? 'rgba(255,77,79,0.1)' : 'rgba(255,77,79,0.06)',
                        border: '1px solid rgba(255,77,79,0.25)',
                        borderRadius: 8,
                        marginBottom: 16,
                        color: '#ff4d4f',
                        fontSize: 12,
                        textAlign: 'center',
                    }}>
                        {error}
                    </div>
                )}

                <Form
                    name="login"
                    onFinish={onFinish}
                    size="large"
                    autoComplete="off"
                >
                    <Form.Item
                        name="username"
                        rules={[{ required: true, message: 'Please enter your username' }]}
                    >
                        <Input
                            prefix={<UserOutlined style={{ color: isDark ? 'rgba(193,142,83,0.5)' : 'rgba(139,90,43,0.4)' }} />}
                            placeholder="Username"
                            style={{
                                background: isDark ? 'rgba(139,90,43,0.1)' : 'rgba(139,90,43,0.04)',
                                border: isDark ? '1px solid rgba(139,90,43,0.25)' : '1px solid rgba(139,90,43,0.15)',
                                borderRadius: 10,
                                height: 44,
                            }}
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: 'Please enter your password' }]}
                    >
                        <Input.Password
                            prefix={<LockOutlined style={{ color: isDark ? 'rgba(193,142,83,0.5)' : 'rgba(139,90,43,0.4)' }} />}
                            placeholder="Password"
                            style={{
                                background: isDark ? 'rgba(139,90,43,0.1)' : 'rgba(139,90,43,0.04)',
                                border: isDark ? '1px solid rgba(139,90,43,0.25)' : '1px solid rgba(139,90,43,0.15)',
                                borderRadius: 10,
                                height: 44,
                            }}
                        />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            block
                            style={{
                                height: 44,
                                borderRadius: 10,
                                background: 'linear-gradient(135deg, #8B5A2B, #A0693B)',
                                border: 'none',
                                fontWeight: 600,
                                fontSize: 14,
                                letterSpacing: '0.5px',
                                boxShadow: isDark
                                    ? '0 4px 16px rgba(139,90,43,0.4)'
                                    : '0 2px 10px rgba(139,90,43,0.25)',
                            }}
                        >
                            Sign In
                        </Button>
                    </Form.Item>
                </Form>

                <div style={{ textAlign: 'center', marginTop: 20 }}>
                    <Text style={{
                        color: isDark ? 'rgba(193,142,83,0.4)' : 'rgba(60,40,20,0.35)',
                        fontSize: 11,
                    }}>
                        v1.0.0 — © 2026 Anaqatoki
                    </Text>
                </div>
            </Card>
        </div>
    );
}
