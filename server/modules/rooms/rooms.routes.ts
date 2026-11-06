import { Router } from 'express';
import { RoomsController } from './rooms.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';

const router = Router();

// GET /api/v1/rooms - List all active multiplayer rooms
router.get('/', RoomsController.getActiveRooms);

// GET /api/v1/rooms/my-room - Get the current room of the logged-in user
router.get('/my-room', requireAuth as any, RoomsController.getMyRoom);

// POST /api/v1/rooms/create - Generate a party room ID
router.post('/create', RoomsController.createRoom);

// GET /api/v1/rooms/:roomId - Get detailed status of a specific room
router.get('/:roomId', RoomsController.getRoomById);

export default router;
