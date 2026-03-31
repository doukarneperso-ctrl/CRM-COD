import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import logger from '../utils/logger';

const router = Router();

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dest = 'uploads/others';
        if (file.fieldname === 'productImage') dest = 'uploads/products';
        if (file.fieldname === 'avatar') dest = 'uploads/avatars';

        // Ensure directory exists
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        // Sanitize filename: timestamp-random-original
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

// Configure upload
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only images are allowed (jpeg, jpg, png, webp, gif)'));
    }
});

// ─── POST /api/upload ─────────────────────────────
router.post('/', requireAuth, upload.single('file'), (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
            return;
        }

        // Return the URL path
        // In production, this would be a full URL if using S3/CDN
        // For local, we return the relative path from root, served static
        const filePath = req.file.path.replace(/\\/g, '/'); // Normalize windows paths
        const url = `/${filePath}`; // Served from root

        res.json({
            success: true,
            data: {
                url,
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    } catch (error) {
        logger.error('Upload error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Upload failed' } });
    }
});

// ─── POST /api/upload/multiple ────────────────────
router.post('/multiple', requireAuth, upload.array('files', 5), (req: Request, res: Response) => {
    try {
        if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No files uploaded' } });
            return;
        }

        const files = (req.files as Express.Multer.File[]).map(file => ({
            url: `/${file.path.replace(/\\/g, '/')}`,
            filename: file.filename,
            originalName: file.originalname,
            size: file.size,
            mimetype: file.mimetype
        }));

        res.json({ success: true, data: files });
    } catch (error) {
        logger.error('Upload multiple error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Upload failed' } });
    }
});

export default router;
