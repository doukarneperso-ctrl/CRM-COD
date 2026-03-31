import cron from 'node-cron';
import { query } from '../config/database';
import logger from '../utils/logger';

/**
 * Materialized Views Worker
 * Refreshes materialized views every 15 minutes for analytics performance.
 */
export function startMaterializedViewWorker() {
    // Every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        const start = Date.now();
        try {
            // Check if materialized views exist before refreshing
            const views = await query(`
                SELECT matviewname FROM pg_matviews
                WHERE schemaname = 'public'
            `);

            const viewNames = views.rows.map((r: any) => r.matviewname);

            for (const name of viewNames) {
                try {
                    await query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${name}`);
                    logger.info(`[MATERIALIZED VIEWS] Refreshed: ${name}`);
                } catch (err: any) {
                    // CONCURRENTLY requires unique index; fall back to normal refresh
                    try {
                        await query(`REFRESH MATERIALIZED VIEW ${name}`);
                        logger.info(`[MATERIALIZED VIEWS] Refreshed (non-concurrent): ${name}`);
                    } catch (err2: any) {
                        logger.error(`[MATERIALIZED VIEWS] Failed to refresh ${name}:`, err2.message);
                    }
                }
            }

            const duration = Date.now() - start;
            if (viewNames.length > 0) {
                logger.info(`[MATERIALIZED VIEWS] Completed refresh of ${viewNames.length} views in ${duration}ms`);
            }
        } catch (error) {
            logger.error('[MATERIALIZED VIEWS] Worker error:', error);
        }
    });

    logger.info('[MATERIALIZED VIEWS] Worker started — refreshes every 15 minutes');
}
