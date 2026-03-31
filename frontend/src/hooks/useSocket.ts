import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { message } from 'antd';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';

let globalSocket: Socket | null = null;

function getSocket(): Socket {
    if (!globalSocket) {
        globalSocket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            withCredentials: true,
            autoConnect: true,
        });
    }
    return globalSocket;
}

/**
 * Hook to subscribe to Socket.IO events with auto-cleanup.
 * @param events - Map of event names to callbacks
 * @param deps - Dependency array for when to re-subscribe
 */
export function useSocket(
    events: Record<string, (data: any) => void>,
    deps: any[] = []
) {
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const socket = getSocket();
        socketRef.current = socket;

        if (!socket.connected) socket.connect();

        // Bind all events
        Object.entries(events).forEach(([event, handler]) => {
            socket.on(event, handler);
        });

        return () => {
            Object.entries(events).forEach(([event, handler]) => {
                socket.off(event, handler);
            });
        };
    }, deps);

    return socketRef;
}

/**
 * Hook that auto-refreshes data when relevant socket events fire.
 * Shows a message notification and calls the refresh callback.
 */
export function useRealtimeRefresh(refreshFn: () => void) {
    const handleOrderCreated = useCallback((data: any) => {
        message.info({ content: `📥 New order: ${data.orderNumber || 'Order created'}`, duration: 3 });
        refreshFn();
    }, [refreshFn]);

    const handleOrderUpdated = useCallback((_data: any) => {
        refreshFn();
    }, [refreshFn]);

    const handleStatusChanged = useCallback((data: any) => {
        message.info({ content: `🔄 ${data.orderNumber}: status → ${data.status}`, duration: 3 });
        refreshFn();
    }, [refreshFn]);

    const handleStockAlert = useCallback((data: any) => {
        message.warning({ content: `⚠️ Low stock: ${data.productName || 'Item'}`, duration: 4 });
    }, []);

    const handleDeliveryUpdate = useCallback((data: any) => {
        message.info({ content: `🚚 ${data.trackingNumber}: ${data.courierStatus}`, duration: 3 });
        refreshFn();
    }, [refreshFn]);

    useSocket({
        'order:created': handleOrderCreated,
        'order:updated': handleOrderUpdated,
        'order:status-changed': handleStatusChanged,
        'stock:alert': handleStockAlert,
        'delivery:statusUpdated': handleDeliveryUpdate,
    }, [handleOrderCreated, handleOrderUpdated, handleStatusChanged, handleStockAlert, handleDeliveryUpdate]);
}
