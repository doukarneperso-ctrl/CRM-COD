import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Global error handler — catches all unhandled errors
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
    // Log the error
    logger.error(`${req.method} ${req.path} — Error:`, {
        message: err.message,
        stack: err.stack,
        userId: req.session?.userId,
    });

    // Determine status code
    const statusCode = err.statusCode || err.status || 500;

    // Build error response
    const errorResponse: any = {
        success: false,
        error: {
            code: err.code || 'INTERNAL_ERROR',
            message: err.message || 'An unexpected error occurred',
        },
    };

    // Include details in development
    if (process.env.NODE_ENV === 'development') {
        errorResponse.error.stack = err.stack;
    }

    res.status(statusCode).json(errorResponse);
}

/**
 * Custom error class with status code
 */
export class AppError extends Error {
    statusCode: number;
    code: string;

    constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'AppError';
    }
}
