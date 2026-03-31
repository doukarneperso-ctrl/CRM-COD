import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import http from 'http';
import { env } from './config/env';
import { sessionMiddleware } from './config/session';
import { loadPermissions } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { initSocket } from './services/socket.service';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import rolesRoutes from './routes/roles.routes';
import productsRoutes from './routes/products.routes';
import customersRoutes from './routes/customers.routes';
import ordersRoutes from './routes/orders.routes';
import uploadRoutes from './routes/upload.routes';
import callCentreRoutes from './routes/call-centre.routes';
import deliveryRoutes, { handleColiixWebhook } from './routes/delivery.routes';
import returnsRoutes from './routes/returns.routes';
import expensesRoutes from './routes/expenses.routes';
import commissionsRoutes from './routes/commissions.routes';
import settingsRoutes from './routes/settings.routes';
import notificationsRoutes from './routes/notifications.routes';
import searchRoutes from './routes/search.routes';
import analyticsRoutes from './routes/analytics.routes';
import storesRoutes, { handleYouCanWebhook } from './routes/stores.routes';
import adsRoutes from './routes/ads.routes';
import courierInvoicesRoutes from './routes/courier-invoices.routes';
import assignmentRulesRoutes from './routes/assignment-rules.routes';
import employersRoutes from './routes/employers.routes';
import stockRoutes from './routes/stock.routes';
import productionRoutes from './routes/production.routes';
import path from 'path';
import logger from './utils/logger';
// Workers
import { startDeliveryRetryWorker } from './workers/deliveryRetry.worker';
import { startLockCleanupWorker } from './workers/lockCleanup.worker';
import { startCallbackReminderWorker } from './workers/callbackReminder.worker';
import { startRecurringExpenseWorker } from './workers/recurringExpense.worker';
import { startYouCanSyncWorker } from './workers/youcanSync.worker';
import { startMaterializedViewWorker } from './workers/materializedView.worker';
import { startColiixSyncWorker } from './workers/coliixSync.worker';

const app = express();
app.set('trust proxy', 1); // Trust Railway's load balancer proxy
const httpServer = http.createServer(app);

// ─── Socket.IO ────────────────────────────────────
initSocket(httpServer, env.FRONTEND_URL);

// ─── Global Middleware ────────────────────────────
app.use(helmet());
app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting (skip for auth routes)
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/api/auth/'),
}));

// Session
app.use(sessionMiddleware);

// Load permissions on every authenticated request
app.use(loadPermissions);

// ─── Health Check ─────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/call-centre', callCentreRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/commissions', commissionsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/courier-invoices', courierInvoicesRoutes);
app.use('/api/assignment-rules', assignmentRulesRoutes);
app.use('/api/assignment-config', assignmentRulesRoutes);
app.use('/api/employers', employersRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/production', productionRoutes);

// ─── Webhooks (no auth, no rate-limit) ───────────
app.get('/webhooks/coliix', handleColiixWebhook);
app.post('/webhooks/youcan', handleYouCanWebhook);

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── 404 Handler ──────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
});

// ─── Global Error Handler ─────────────────────────
app.use(errorHandler);

// ─── Start Server + Workers ───────────────────────
const PORT = env.PORT;
httpServer.listen(PORT, () => {
    logger.info(`🚀 CRM Backend running on http://localhost:${PORT}`);
    logger.info(`📋 Environment: ${env.NODE_ENV}`);
    logger.info(`🔌 Socket.IO ready`);
    // Start background workers
    startLockCleanupWorker();
    startDeliveryRetryWorker();
    startCallbackReminderWorker();
    startRecurringExpenseWorker();
    startYouCanSyncWorker();
    startMaterializedViewWorker();
    startColiixSyncWorker();
});

export default app;
