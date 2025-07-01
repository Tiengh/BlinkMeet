import express from 'express';
import { protectRoute } from '../middlewares/auth.middleware.js';
import { getRandomCall } from '../controllers/omegle.controller.js';

const router = express.Router();

router.use(protectRoute);

router.post('/random', getRandomCall);

export default router;