import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import logger from '../utils/logger';

let io: SocketServer | null = null;

export function initSocket(httpServer: HttpServer, frontendUrl: string) {
    io = new SocketServer(httpServer, {
        cors: {
            origin: frontendUrl,
            credentials: true,
        },
        transports: ['websocket', 'polling'],
    });

    io.on('connection', (socket) => {
        logger.info(`🔌 Socket connected: ${socket.id}`);

        socket.on('join-room', (room: string) => {
            socket.join(room);
            logger.info(`Socket ${socket.id} joined room: ${room}`);
        });

        socket.on('disconnect', () => {
            logger.info(`🔌 Socket disconnected: ${socket.id}`);
        });
    });

    logger.info('🔌 Socket.IO initialized');
    return io;
}

export function getIO(): SocketServer | null {
    return io;
}

// ─── Emit helpers ────────────────────────────────
export function emitOrderUpdate(orderId: string, data: any) {
    if (io) io.emit('order:updated', { orderId, ...data });
}

export function emitOrderCreated(data: any) {
    if (io) io.emit('order:created', data);
}

export function emitOrderStatusChanged(orderId: string, status: string, orderNumber: string) {
    if (io) io.emit('order:status-changed', { orderId, status, orderNumber });
}

export function emitStockAlert(data: any) {
    if (io) io.emit('stock:alert', data);
}

export function emitNotification(userId: string, data: any) {
    if (io) io.to(`user:${userId}`).emit('notification', data);
}

export function emitDeliveryStatusUpdated(orderId: string, data: { courierStatus: string; shippingStatus: string; trackingNumber: string }) {
    if (io) io.emit('delivery:statusUpdated', { orderId, ...data });
}
