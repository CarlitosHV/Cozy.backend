import { Router } from 'express';
import { FriendsController } from './friends.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { friendRequestActionSchema, friendRequestSchema } from './friends.schema.js';

const router = Router();

router.use(requireAuth);

router.get('/', FriendsController.listFriends);
router.get('/requests', FriendsController.listRequests);
router.get('/search', FriendsController.search);
router.post('/request', validateBody(friendRequestSchema), FriendsController.sendRequest);
router.post('/accept', validateBody(friendRequestActionSchema), FriendsController.acceptRequest);
router.post('/decline', validateBody(friendRequestActionSchema), FriendsController.declineRequest);
router.delete('/:userId', FriendsController.removeFriend);

export default router;
