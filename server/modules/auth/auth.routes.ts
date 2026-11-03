import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { loginSchema, registerSchema } from './auth.schema.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { authRateLimiter } from '../../middlewares/rateLimiter.middleware.js';

const router = Router();

// POST /api/v1/auth/register
router.post('/register', validateBody(registerSchema), AuthController.register);

// POST /api/v1/auth/login (with 5-attempts rate limiter)
router.post('/login', authRateLimiter(5, 900), validateBody(loginSchema), AuthController.login);

// POST /api/v1/auth/refresh
router.post('/refresh', AuthController.refresh);

// POST /api/v1/auth/logout
router.post('/logout', AuthController.logout);

export default router;
