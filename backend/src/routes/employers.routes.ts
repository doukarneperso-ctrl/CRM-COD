import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateBody } from '../middleware/validate';
import logger from '../utils/logger';
import { z } from 'zod';

// Get Monday of the current week in YYYY-MM-DD
function getCurrentWeekStart(): string {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().split('T')[0];
}

const router = Router();

// ─── Schemas ─────────────────────────────────────
const employerSchema = z.object({
    name: z.string().min(2).max(100),
    age: z.number().int().min(12).max(99).optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    role: z.string().max(100).optional().nullable(),
    salary: z.number().min(0),
    joinDate: z.string().optional(),
});

const attendanceBulkSchema = z.object({
    weekStart: z.string(), // YYYY-MM-DD (Monday)
    records: z.array(z.object({
        employerId: z.string().uuid(),
        date: z.string(),
        status: z.enum(['full', 'half', 'absent']),
    })),
});

// ═══ ATTENDANCE (must be before /:id) ═════════════

// GET /api/employers/attendance?weekStart=YYYY-MM-DD
router.get('/attendance', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const weekStart = (req.query.weekStart as string) || getCurrentWeekStart();
        const result = await query(
            `SELECT ea.*, e.name as employer_name
             FROM employer_attendance ea
             JOIN employers e ON e.id = ea.employer_id
             WHERE ea.week_start = $1 AND e.deleted_at IS NULL
             ORDER BY e.name, ea.date`,
            [weekStart]
        );
        res.json({ success: true, data: result.rows, weekStart });
    } catch (error) {
        logger.error('Get attendance error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get attendance' } });
    }
});

// PUT /api/employers/attendance (bulk upsert)
router.put('/attendance', requireAuth, requirePermission('manage_employers'), validateBody(attendanceBulkSchema), async (req: Request, res: Response) => {
    try {
        const { weekStart, records } = req.body;
        for (const rec of records) {
            await query(
                `INSERT INTO employer_attendance (employer_id, date, status, week_start)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (employer_id, date)
                 DO UPDATE SET status = EXCLUDED.status`,
                [rec.employerId, rec.date, rec.status, weekStart]
            );
        }
        res.json({ success: true, message: `Updated ${records.length} attendance records` });
    } catch (error) {
        logger.error('Update attendance error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update attendance' } });
    }
});

// ═══ SALARY (must be before /:id) ═════════════════

// GET /api/employers/salary?weekStart=YYYY-MM-DD
router.get('/salary', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const weekStart = (req.query.weekStart as string) || getCurrentWeekStart();
        const result = await query(
            `SELECT sp.*, e.name as employer_name, e.salary as base_salary
             FROM employer_salary_payments sp
             JOIN employers e ON e.id = sp.employer_id
             WHERE sp.week_start = $1 AND e.deleted_at IS NULL
             ORDER BY e.name`,
            [weekStart]
        );
        res.json({ success: true, data: result.rows, weekStart });
    } catch (error) {
        logger.error('Get salary error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get salary' } });
    }
});

// POST /api/employers/salary/calculate
router.post('/salary/calculate', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const { weekStart } = req.body;
        if (!weekStart) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'weekStart is required' } });
            return;
        }

        const employers = await query(`SELECT id, name, salary FROM employers WHERE deleted_at IS NULL`);

        const results = [];
        for (const emp of employers.rows) {
            const att = await query(
                `SELECT status, COUNT(*)::int as count
                 FROM employer_attendance
                 WHERE employer_id = $1 AND week_start = $2
                 GROUP BY status`,
                [emp.id, weekStart]
            );

            const countMap: Record<string, number> = {};
            att.rows.forEach((r: any) => { countMap[r.status] = r.count; });
            const fullDays = countMap['full'] || 0;
            const halfDays = countMap['half'] || 0;

            // Daily rate = weekly salary / 6 (working days per week)
            const dailyRate = parseFloat(emp.salary) / 6;
            const totalAmount = (fullDays * dailyRate) + (halfDays * dailyRate * 0.5);

            await query(
                `INSERT INTO employer_salary_payments (employer_id, week_start, full_days, half_days, daily_rate, total_amount)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (employer_id, week_start)
                 DO UPDATE SET full_days = $3, half_days = $4, daily_rate = $5, total_amount = $6`,
                [emp.id, weekStart, fullDays, halfDays, Math.round(dailyRate * 100) / 100, Math.round(totalAmount * 100) / 100]
            );

            results.push({ employerId: emp.id, name: emp.name, fullDays, halfDays, dailyRate: Math.round(dailyRate * 100) / 100, totalAmount: Math.round(totalAmount * 100) / 100 });
        }

        res.json({ success: true, data: results });
    } catch (error) {
        logger.error('Calculate salary error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to calculate salary' } });
    }
});

// PUT /api/employers/salary/:id/pay
router.put('/salary/:id/pay', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `UPDATE employer_salary_payments SET is_paid = true, paid_at = NOW() WHERE id = $1 RETURNING *`,
            [req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Salary record not found' } });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Pay salary error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to mark as paid' } });
    }
});

// ═══ HISTORY (must be before /:id) ═══════════════

// GET /api/employers/history
router.get('/history', requireAuth, requirePermission('manage_employers'), async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT
                ea.week_start,
                COUNT(DISTINCT ea.employer_id)::int as total_employers,
                COUNT(CASE WHEN ea.status = 'full' THEN 1 END)::int as total_full_days,
                COUNT(CASE WHEN ea.status = 'half' THEN 1 END)::int as total_half_days,
                COUNT(CASE WHEN ea.status = 'absent' THEN 1 END)::int as total_absent_days,
                COALESCE((SELECT SUM(sp.total_amount) FROM employer_salary_payments sp WHERE sp.week_start = ea.week_start), 0)::numeric as total_amount,
                COALESCE((SELECT COUNT(*) FILTER (WHERE sp.is_paid) FROM employer_salary_payments sp WHERE sp.week_start = ea.week_start), 0)::int as paid_count,
                COALESCE((SELECT COUNT(*) FILTER (WHERE NOT sp.is_paid) FROM employer_salary_payments sp WHERE sp.week_start = ea.week_start), 0)::int as unpaid_count
             FROM employer_attendance ea
             JOIN employers e ON e.id = ea.employer_id AND e.deleted_at IS NULL
             GROUP BY ea.week_start
             ORDER BY ea.week_start DESC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Get history error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get history' } });
    }
});

// GET /api/employers/history/:weekStart — full detail per employer
router.get('/history/:weekStart', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const weekStart = (req.params.weekStart as string).split('T')[0]; // normalize to YYYY-MM-DD
        // Per-employer summary for the week
        const result = await query(
            `SELECT
                e.id as employer_id,
                e.name as employer_name,
                e.role as employer_role,
                e.salary as base_salary,
                COUNT(CASE WHEN ea.status = 'full' THEN 1 END)::int as full_days,
                COUNT(CASE WHEN ea.status = 'half' THEN 1 END)::int as half_days,
                COUNT(CASE WHEN ea.status = 'absent' THEN 1 END)::int as absent_days,
                (COUNT(CASE WHEN ea.status = 'full' THEN 1 END) + COUNT(CASE WHEN ea.status = 'half' THEN 1 END) * 0.5)::numeric as total_worked,
                ROUND(e.salary / 6.0, 2) as daily_rate,
                ROUND((COUNT(CASE WHEN ea.status = 'full' THEN 1 END) * (e.salary / 6.0)) + (COUNT(CASE WHEN ea.status = 'half' THEN 1 END) * (e.salary / 6.0) * 0.5), 2) as earned,
                COALESCE(sp.is_paid, false) as is_paid,
                sp.paid_at
             FROM employers e
             LEFT JOIN employer_attendance ea ON ea.employer_id = e.id AND ea.week_start = $1
             LEFT JOIN employer_salary_payments sp ON sp.employer_id = e.id AND sp.week_start = $1
             WHERE e.deleted_at IS NULL
             AND EXISTS (SELECT 1 FROM employer_attendance ea2 WHERE ea2.employer_id = e.id AND ea2.week_start = $1)
             GROUP BY e.id, e.name, e.role, e.salary, sp.is_paid, sp.paid_at
             ORDER BY e.name`,
            [weekStart]
        );
        // Also get raw attendance for the day-by-day breakdown
        const attendance = await query(
            `SELECT ea.employer_id, ea.date, ea.status, e.name as employer_name
             FROM employer_attendance ea
             JOIN employers e ON e.id = ea.employer_id
             WHERE ea.week_start = $1 AND e.deleted_at IS NULL
             ORDER BY e.name, ea.date`,
            [weekStart]
        );
        res.json({ success: true, data: { employees: result.rows, attendance: attendance.rows } });
    } catch (error) {
        logger.error('Get history detail error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get history detail' } });
    }
});

// ═══ EMPLOYER CRUD (/:id routes last) ════════════

// GET /api/employers
router.get('/', requireAuth, requirePermission('manage_employers'), async (_req: Request, res: Response) => {
    try {
        const result = await query(
            `SELECT * FROM employers WHERE deleted_at IS NULL ORDER BY name ASC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('List employers error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list employers' } });
    }
});

// POST /api/employers
router.post('/', requireAuth, requirePermission('manage_employers'), validateBody(employerSchema), async (req: Request, res: Response) => {
    try {
        const { name, age, phone, role, salary, joinDate } = req.body;
        const result = await query(
            `INSERT INTO employers (name, age, phone, role, salary, join_date)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name, age || null, phone || null, role || null, salary, joinDate || new Date().toISOString().split('T')[0]]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Create employer error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create employer' } });
    }
});

// PUT /api/employers/:id
router.put('/:id', requireAuth, requirePermission('manage_employers'), validateBody(employerSchema), async (req: Request, res: Response) => {
    try {
        const { name, age, phone, role, salary, joinDate } = req.body;
        const result = await query(
            `UPDATE employers SET name=$1, age=$2, phone=$3, role=$4, salary=$5, join_date=$6, updated_at=NOW()
             WHERE id=$7 AND deleted_at IS NULL RETURNING *`,
            [name, age || null, phone || null, role || null, salary, joinDate || null, req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employer not found' } });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        logger.error('Update employer error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update employer' } });
    }
});

// DELETE /api/employers/:id
router.delete('/:id', requireAuth, requirePermission('manage_employers'), async (req: Request, res: Response) => {
    try {
        const result = await query(
            `UPDATE employers SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
            [req.params.id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employer not found' } });
            return;
        }
        res.json({ success: true, message: 'Employer deleted' });
    } catch (error) {
        logger.error('Delete employer error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete employer' } });
    }
});

export default router;
