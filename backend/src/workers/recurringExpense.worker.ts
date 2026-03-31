import cron from 'node-cron';
import { query } from '../config/database';
import { createNotification } from '../services/notification.service';
import logger from '../utils/logger';

/**
 * Daily at midnight: auto-generate recurring expense entries.
 */
export function startRecurringExpenseWorker(): void {
    cron.schedule('0 0 * * *', async () => {
        try {
            const today = new Date().toISOString().split('T')[0];

            const dueExpenses = await query(
                `SELECT e.id, e.category_id, e.description, e.amount, e.frequency,
                        e.created_by
                 FROM expenses e
                 WHERE e.is_recurring = true
                   AND e.deleted_at IS NULL
                   AND e.next_due_date <= $1`,
                [today]
            );

            let created = 0;
            for (const expense of dueExpenses.rows) {
                // Create new expense entry for this cycle
                await query(
                    `INSERT INTO expenses (category_id, description, amount, status, is_recurring, frequency,
                                         next_due_date, created_by, created_at)
                     VALUES ($1, $2, $3, 'pending', true, $4,
                             CASE $4
                               WHEN 'weekly' THEN (CURRENT_DATE + INTERVAL '7 days')::date
                               WHEN 'monthly' THEN (CURRENT_DATE + INTERVAL '1 month')::date
                               WHEN 'yearly' THEN (CURRENT_DATE + INTERVAL '1 year')::date
                             END,
                             $5, NOW())`,
                    [expense.category_id, expense.description, expense.amount, expense.frequency, expense.created_by]
                );

                // Update the next_due_date on the template expense
                await query(
                    `UPDATE expenses SET
                       next_due_date = CASE frequency
                         WHEN 'weekly' THEN (CURRENT_DATE + INTERVAL '7 days')::date
                         WHEN 'monthly' THEN (CURRENT_DATE + INTERVAL '1 month')::date
                         WHEN 'yearly' THEN (CURRENT_DATE + INTERVAL '1 year')::date
                       END
                     WHERE id = $1`,
                    [expense.id]
                );

                // Notify managers
                if (expense.created_by) {
                    await createNotification({
                        userId: expense.created_by,
                        type: 'recurring_expense_due',
                        title: 'Recurring Expense Due',
                        message: `${expense.description} — ${expense.amount} MAD`,
                        data: { expenseId: expense.id },
                    });
                }

                created++;
            }

            if (created > 0) {
                logger.info(`[RECURRING EXPENSE] Created ${created} recurring expense entries`);
            }
        } catch (err) {
            logger.error('[RECURRING EXPENSE WORKER] Error:', err);
        }
    });
    logger.info('[WORKER] Recurring expense worker started (daily at midnight)');
}
