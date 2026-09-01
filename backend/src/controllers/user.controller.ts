import { Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

export const getUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const isAdmin = req.user?.role === 'ADMIN';
    const { role, search, page = 1, limit = 20, isActive } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: Record<string, unknown> = {
      organizationId: req.user?.organizationId ?? null,
    };

    if (isAdmin) {
      if (role) where.role = role;
      if (isActive !== undefined) where.isActive = isActive === 'true';
      if (search) {
        where.OR = [
          { name: { contains: search as string } },
          { email: { contains: search as string } },
        ];
      }
    } else {
      // Non-admins: only see active employees (for lead transfer dropdown)
      where.role = 'EMPLOYEE';
      where.isActive = true;
    }

    // Support dept/desig filters (admin only)
    if (isAdmin) {
      if (req.query.departmentId) where.departmentId = req.query.departmentId;
      if (req.query.designationId) where.designationId = req.query.designationId;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: Number(limit),
        select: {
          id: true, name: true, email: true, role: true,
          phone: true, isActive: true, availability: true, lastLogin: true, createdAt: true,
          employeeId: true,
          department: { select: { id: true, name: true, code: true } },
          designation: { select: { id: true, name: true } },
          _count: { select: { assignedLeads: { where: { deletedAt: null } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: users,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const createUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, phone, departmentId, designationId } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      res.status(400).json({ success: false, error: 'Name, email, and password are required' });
      return;
    }
    if (!phone?.trim()) {
      res.status(400).json({ success: false, error: 'Mobile number is required' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      res.status(409).json({ success: false, error: 'Email already in use' });
      return;
    }

    // Auto-generate employeeId: EMP001, EMP002, ...
    const orgId = req.user?.organizationId ?? null;
    const empCount = await prisma.user.count({ where: { organizationId: orgId } });
    const employeeId = `EMP${String(empCount + 1).padStart(3, '0')}`;

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashed,
        role: role || 'EMPLOYEE',
        phone: phone.trim(),
        organizationId: orgId,
        employeeId,
        departmentId: departmentId || null,
        designationId: designationId || null,
      },
      select: {
        id: true, name: true, email: true, role: true, phone: true,
        isActive: true, availability: true, createdAt: true, employeeId: true,
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true } },
      },
    });
    res.status(201).json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const updateUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, phone, isActive, departmentId, designationId } = req.body;

    if (phone !== undefined && !phone?.trim()) {
      res.status(400).json({ success: false, error: 'Mobile number is required' });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (departmentId !== undefined) updateData.departmentId = departmentId || null;
    if (designationId !== undefined) updateData.designationId = designationId || null;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true, name: true, email: true, role: true, phone: true, isActive: true,
        availability: true, createdAt: true, employeeId: true,
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true } },
      },
    });
    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const resetUserPassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
      return;
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.organizationId !== req.user?.organizationId) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id }, data: { password: hashed } });

    // Revoke all existing sessions for this user
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    res.json({ success: true, message: 'Password reset successfully' });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (id === req.user!.id) {
      res.status(400).json({ success: false, error: 'Cannot delete your own account' });
      return;
    }
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    res.json({ success: true, message: 'User deactivated successfully' });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const exportUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: { organizationId: req.user?.organizationId ?? null },
      include: {
        _count: { select: { assignedLeads: { where: { deletedAt: null } } } },
        assignedLeads: {
          where: { deletedAt: null },
          select: { status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = users.map((u) => {
      const confirmed = u.assignedLeads.filter((l) => l.status === 'CONFIRMED').length;
      const lost = u.assignedLeads.filter((l) => l.status === 'LOST').length;
      const total = u.assignedLeads.length;
      return {
        Name: u.name,
        Email: u.email,
        Phone: u.phone ?? '',
        Role: u.role,
        Status: u.isActive ? 'Active' : 'Inactive',
        'Total Leads': total,
        Confirmed: confirmed,
        Lost: lost,
        Active: total - confirmed - lost,
        'Conversion %': total > 0 ? ((confirmed / total) * 100).toFixed(1) : '0',
        'Joined At': u.createdAt.toISOString().slice(0, 10),
      };
    });

    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const updateAvailability = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { availability } = req.body;
    const allowed = ['AVAILABLE', 'BUSY', 'OFFLINE'];
    if (!allowed.includes(availability)) {
      res.status(400).json({ success: false, error: 'Invalid availability status' }); return;
    }
    // Employees can only update their own; admin can update anyone
    if (req.user?.role === 'EMPLOYEE' && id !== req.user.id) {
      res.status(403).json({ success: false, error: 'Not authorized' }); return;
    }
    const user = await prisma.user.update({
      where: { id },
      data: { availability },
      select: { id: true, name: true, availability: true },
    });
    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getEmployeeProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findFirst({
      where: { id, organizationId: req.user?.organizationId ?? null },
      select: {
        id: true, name: true, email: true, role: true, phone: true,
        avatar: true, isActive: true, availability: true, lastLogin: true, createdAt: true,
        employeeId: true,
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true } },
        campaignAssignments: {
          include: { campaign: { select: { id: true, name: true, destination: true, status: true } } },
        },
        assignedLeads: {
          where: { deletedAt: null },
          select: { id: true, status: true, followUpDate: true, followUpDone: true },
        },
        activityLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { lead: { select: { id: true, name: true } } },
        },
      },
    });

    if (!user) { res.status(404).json({ success: false, error: 'Employee not found' }); return; }

    const leads = user.assignedLeads;
    const total = leads.length;
    const confirmed = leads.filter((l) => l.status === 'CONFIRMED').length;
    const lost = leads.filter((l) => l.status === 'LOST').length;
    const pending = leads.filter((l) => !['CONFIRMED', 'LOST'].includes(l.status)).length;
    const now = new Date();
    const overdue = leads.filter(
      (l) => l.status === 'FOLLOW_UP_SCHEDULED' && !l.followUpDone && l.followUpDate && new Date(l.followUpDate) < now
    ).length;

    res.json({
      success: true,
      data: {
        ...user,
        stats: {
          total, confirmed, lost, pending, overdue,
          conversionRate: total > 0 ? ((confirmed / total) * 100).toFixed(1) : '0',
        },
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getEmployeePerformance = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const employees = await prisma.user.findMany({
      where: { role: 'EMPLOYEE', isActive: true },
      select: {
        id: true, name: true, email: true,
        assignedLeads: {
          select: { status: true, createdAt: true, followUpDate: true, followUpDone: true },
        },
      },
    });

    const performance = employees.map((emp) => {
      const leads = emp.assignedLeads;
      const total = leads.length;
      const confirmed = leads.filter((l) => l.status === 'CONFIRMED').length;
      const lost = leads.filter((l) => l.status === 'LOST').length;
      const active = leads.filter((l) => !['CONFIRMED', 'LOST'].includes(l.status)).length;
      const overdue = leads.filter(
        (l) => l.status === 'FOLLOW_UP_SCHEDULED' && !l.followUpDone && l.followUpDate && l.followUpDate < new Date()
      ).length;
      const conversionRate = total > 0 ? ((confirmed / total) * 100).toFixed(1) : '0';

      return { id: emp.id, name: emp.name, email: emp.email, total, confirmed, lost, active, overdue, conversionRate };
    });

    res.json({ success: true, data: performance });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
