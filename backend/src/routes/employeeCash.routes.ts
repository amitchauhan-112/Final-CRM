import { Router } from 'express';
import {
  getMyCashHolding, listEmployeeCash, getEmployeeCashHistory, collectEmployeeCash,
} from '../controllers/employeeCash.controller.js';
import { authenticate, requireFinanceOrAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/mine', getMyCashHolding);
router.get('/', requireFinanceOrAdmin, listEmployeeCash);
router.get('/:employeeId/history', requireFinanceOrAdmin, getEmployeeCashHistory);
router.post('/:employeeId/collect', requireFinanceOrAdmin, collectEmployeeCash);

export default router;
