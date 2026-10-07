import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { createExpense, listMyExpenseClaims } from '../controllers/expense.controller.js';
import { createUpload } from '../middleware/upload.js';

const uploadExpenseBill = createUpload('expense-bills');
const router = Router();

// Any authenticated user — this is the self-service "claim my own small
// spend" path. createExpense itself marks these isClaim=true, so only an
// Admin can approve/reject them (via the existing /finance/expenses routes).
router.use(authenticate);
router.get('/mine', listMyExpenseClaims);
router.post('/', uploadExpenseBill.single('bill'), createExpense);

export default router;
