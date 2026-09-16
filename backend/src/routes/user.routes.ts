import { Router } from 'express';
import {
  getUsers, createUser, updateUser, deleteUser, softDeleteUser, hardDeleteUser,
  getDeletedUsers, restoreUser,
  getEmployeePerformance, resetUserPassword, exportUsers,
  updateAvailability, getEmployeeProfile,
} from '../controllers/user.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/', getUsers);
router.get('/deleted', requireAdmin, getDeletedUsers);
router.get('/export', requireAdmin, exportUsers);
router.get('/performance/employees', requireAdmin, getEmployeePerformance);
router.get('/:id/profile', getEmployeeProfile);
router.post('/', requireAdmin, createUser);
router.put('/:id', requireAdmin, updateUser);
router.put('/:id/availability', updateAvailability);
router.put('/:id/reset-password', requireAdmin, resetUserPassword);
router.put('/:id/restore', requireAdmin, restoreUser);
router.delete('/:id', requireAdmin, deleteUser);
router.delete('/:id/soft', requireAdmin, softDeleteUser);
router.delete('/:id/permanent', requireAdmin, hardDeleteUser);

export default router;
