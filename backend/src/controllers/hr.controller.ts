// controllers/hr.controller.ts - Sales targets/achievement/incentives, base
// salary config, and payout release tracking. Salary/incentive amounts are
// Admin-only by default; a specific Finance employee can be given time-boxed
// visibility via FinanceSalaryAccess (see requireSalaryAccess below).

import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

// ── Access gate: Admin always; Finance only with an active, unexpired grant ──

async function financeGrantIsActive(userId: string): Promise<boolean> {
  const grant = await prisma.financeSalaryAccess.findUnique({ where: { userId } });
  return !!grant && grant.isActive && grant.expiresAt > new Date();
}

// Admin always; Finance only with an active, unexpired grant. Used for
// salary-config and payouts, which list every employee — never self-scoped.
export async function requireSalaryAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (req.user?.role === 'ADMIN') { next(); return; }
  if (req.user?.role === 'FINANCE' && await financeGrantIsActive(req.user.id)) { next(); return; }
  res.status(403).json({ success: false, error: 'Salary/incentive access has not been granted to you' });
}

// Same as above, but also lets a Sales employee (role EMPLOYEE) through —
// the controller then restricts them to their own data only. Used for the
// sales-targets endpoints, which are the one place a non-Admin/Finance
// employee can legitimately see incentive figures (their own).
export async function requireSalaryAccessOrSelf(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (req.user?.role === 'ADMIN' || req.user?.role === 'EMPLOYEE') { next(); return; }
  if (req.user?.role === 'FINANCE' && await financeGrantIsActive(req.user.id)) { next(); return; }
  res.status(403).json({ success: false, error: 'Salary/incentive access has not been granted to you' });
}

// ── Achievement — always computed live from Booking, never stored ──────────

async function computeAchievement(req: AuthenticatedRequest, userId: string, month: number, year: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const bookings = await prisma.booking.findMany({
    where: { salesExecutiveId: userId, status: { not: 'CANCELLED' }, createdAt: { gte: start, lt: end }, ...orgFilter(req) },
    select: { finalPrice: true },
  });
  return {
    achievedRevenue: bookings.reduce((s, b) => s + b.finalPrice, 0),
    achievedBookings: bookings.length,
  };
}

// Incentive only accrues on revenue ABOVE target, at the admin-entered %.
function computeIncentive(achievedRevenue: number, targetRevenue: number | null, incentivePercent: number | null): number {
  if (!targetRevenue || !incentivePercent) return 0;
  const excess = achievedRevenue - targetRevenue;
  if (excess <= 0) return 0;
  return Math.round(excess * (incentivePercent / 100) * 100) / 100;
}

// ── Finance Salary Access grants ────────────────────────────────────────────

export const listSalaryAccessGrants = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const financeUsers = await prisma.user.findMany({
      where: { role: 'FINANCE', ...orgFilter(req) },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    const grants = await prisma.financeSalaryAccess.findMany({
      where: { userId: { in: financeUsers.map((u) => u.id) } },
      include: { grantedBy: { select: { id: true, name: true } } },
    });
    const byUser = new Map(grants.map((g) => [g.userId, g]));
    res.json({
      success: true,
      data: financeUsers.map((u) => {
        const g = byUser.get(u.id);
        const active = !!g && g.isActive && g.expiresAt > new Date();
        return { ...u, access: g ? { isActive: g.isActive, expiresAt: g.expiresAt, grantedBy: g.grantedBy, grantedAt: g.grantedAt, currentlyActive: active } : null };
      }),
    });
  } catch (e) {
    console.error('[hr] listSalaryAccessGrants error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const grantSalaryAccess = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const months = Number(req.body.months);
    if (!months || months <= 0) { res.status(400).json({ success: false, error: 'months must be a positive number' }); return; }

    const financeUser = await prisma.user.findFirst({ where: { id: userId, role: 'FINANCE', ...orgFilter(req) } });
    if (!financeUser) { res.status(404).json({ success: false, error: 'Finance employee not found' }); return; }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const grant = await prisma.financeSalaryAccess.upsert({
      where: { userId },
      update: { isActive: true, expiresAt, grantedById: req.user!.id, grantedAt: new Date() },
      create: { userId, organizationId: orgId(req), isActive: true, expiresAt, grantedById: req.user!.id },
    });

    await prisma.activityLog.create({
      data: { action: 'Salary Access Granted', details: `${req.user?.name} granted ${financeUser.name} salary/incentive access for ${months} month(s)`, entityType: 'USER', entityId: userId, userId: req.user!.id },
    });

    res.json({ success: true, data: grant });
  } catch (e) {
    console.error('[hr] grantSalaryAccess error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const revokeSalaryAccess = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const grant = await prisma.financeSalaryAccess.findUnique({ where: { userId } });
    if (!grant) { res.status(404).json({ success: false, error: 'No access grant found for this user' }); return; }

    await prisma.financeSalaryAccess.update({ where: { userId }, data: { isActive: false } });

    await prisma.activityLog.create({
      data: { action: 'Salary Access Revoked', details: `${req.user?.name} revoked salary/incentive access`, entityType: 'USER', entityId: userId, userId: req.user!.id },
    });

    res.json({ success: true });
  } catch (e) {
    console.error('[hr] revokeSalaryAccess error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Sales Targets / Achievement / Incentive ─────────────────────────────────

// Admin/authorized-Finance: all sales employees for a month. Sales employee: self only.
export const listSalesTargets = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const year = Number(req.query.year) || now.getFullYear();

    const isSelf = req.user?.role === 'EMPLOYEE';
    const salesUsers = isSelf
      ? await prisma.user.findMany({ where: { id: req.user!.id }, select: { id: true, name: true, email: true, avatar: true } })
      : await prisma.user.findMany({ where: { role: 'EMPLOYEE', ...orgFilter(req) }, select: { id: true, name: true, email: true, avatar: true }, orderBy: { name: 'asc' } });

    const targets = await prisma.salesTarget.findMany({
      where: { userId: { in: salesUsers.map((u) => u.id) }, month, year },
    });
    const byUser = new Map(targets.map((t) => [t.userId, t]));

    const data = await Promise.all(salesUsers.map(async (u) => {
      const target = byUser.get(u.id) ?? null;
      const { achievedRevenue, achievedBookings } = await computeAchievement(req, u.id, month, year);
      const incentiveAmount = computeIncentive(achievedRevenue, target?.targetRevenue ?? null, target?.incentivePercent ?? null);
      return {
        user: u,
        month, year,
        targetRevenue: target?.targetRevenue ?? null,
        targetBookings: target?.targetBookings ?? null,
        incentivePercent: target?.incentivePercent ?? null,
        achievedRevenue, achievedBookings, incentiveAmount,
      };
    }));

    res.json({ success: true, data });
  } catch (e) {
    console.error('[hr] listSalesTargets error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Full month-by-month history for one employee.
export const getSalesTargetHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    if (req.user?.role === 'EMPLOYEE' && req.user.id !== userId) { res.status(403).json({ success: false, error: 'Access denied' }); return; }

    const targets = await prisma.salesTarget.findMany({ where: { userId }, orderBy: [{ year: 'desc' }, { month: 'desc' } ] });
    const data = await Promise.all(targets.map(async (t) => {
      const { achievedRevenue, achievedBookings } = await computeAchievement(req, userId, t.month, t.year);
      const incentiveAmount = computeIncentive(achievedRevenue, t.targetRevenue, t.incentivePercent);
      return { ...t, achievedRevenue, achievedBookings, incentiveAmount };
    }));

    res.json({ success: true, data });
  } catch (e) {
    console.error('[hr] getSalesTargetHistory error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const setSalesTarget = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { month, year, targetRevenue, targetBookings, incentivePercent } = req.body;
    if (!month || !year) { res.status(400).json({ success: false, error: 'month and year are required' }); return; }
    if (!isWholeAmount(targetRevenue)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }

    const employee = await prisma.user.findFirst({ where: { id: userId, role: 'EMPLOYEE', ...orgFilter(req) } });
    if (!employee) { res.status(404).json({ success: false, error: 'Sales employee not found' }); return; }

    const target = await prisma.salesTarget.upsert({
      where: { userId_month_year: { userId, month: Number(month), year: Number(year) } },
      update: {
        targetRevenue: targetRevenue !== undefined && targetRevenue !== '' ? Number(targetRevenue) : null,
        targetBookings: targetBookings !== undefined && targetBookings !== '' ? Number(targetBookings) : null,
        incentivePercent: incentivePercent !== undefined && incentivePercent !== '' ? Number(incentivePercent) : null,
        setById: req.user!.id,
      },
      create: {
        organizationId: orgId(req), userId, month: Number(month), year: Number(year),
        targetRevenue: targetRevenue !== undefined && targetRevenue !== '' ? Number(targetRevenue) : null,
        targetBookings: targetBookings !== undefined && targetBookings !== '' ? Number(targetBookings) : null,
        incentivePercent: incentivePercent !== undefined && incentivePercent !== '' ? Number(incentivePercent) : null,
        setById: req.user!.id,
      },
    });

    await prisma.activityLog.create({
      data: { action: 'Sales Target Set', details: `${req.user?.name} set ${month}/${year} target for ${employee.name}`, entityType: 'USER', entityId: userId, userId: req.user!.id },
    });

    res.json({ success: true, data: target });
  } catch (e) {
    console.error('[hr] setSalesTarget error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Base Salary Config ──────────────────────────────────────────────────────

export const listSalaryConfig = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, ...orgFilter(req) },
      select: { id: true, name: true, email: true, role: true, avatar: true },
      orderBy: { name: 'asc' },
    });
    const configs = await prisma.employeeSalaryConfig.findMany({ where: { userId: { in: users.map((u) => u.id) } } });
    const byUser = new Map(configs.map((c) => [c.userId, c]));
    res.json({ success: true, data: users.map((u) => ({ user: u, baseSalary: byUser.get(u.id)?.baseSalary ?? null })) });
  } catch (e) {
    console.error('[hr] listSalaryConfig error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const setSalaryConfig = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const baseSalary = Number(req.body.baseSalary);
    if (!Number.isFinite(baseSalary) || baseSalary < 0) { res.status(400).json({ success: false, error: 'A valid baseSalary is required' }); return; }
    if (!isWholeAmount(baseSalary)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }

    const employee = await prisma.user.findFirst({ where: { id: userId, ...orgFilter(req) } });
    if (!employee) { res.status(404).json({ success: false, error: 'Employee not found' }); return; }

    const config = await prisma.employeeSalaryConfig.upsert({
      where: { userId },
      update: { baseSalary, updatedById: req.user!.id },
      create: { organizationId: orgId(req), userId, baseSalary, updatedById: req.user!.id },
    });

    res.json({ success: true, data: config });
  } catch (e) {
    console.error('[hr] setSalaryConfig error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Payouts (salary + incentive release tracking) ──────────────────────────

export const listPayouts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const year = Number(req.query.year) || now.getFullYear();

    const users = await prisma.user.findMany({
      where: { isActive: true, ...orgFilter(req) },
      select: { id: true, name: true, email: true, role: true, avatar: true },
      orderBy: { name: 'asc' },
    });
    const salaryConfigs = await prisma.employeeSalaryConfig.findMany({ where: { userId: { in: users.map((u) => u.id) } } });
    const salaryByUser = new Map(salaryConfigs.map((c) => [c.userId, c.baseSalary]));

    const targets = await prisma.salesTarget.findMany({ where: { userId: { in: users.map((u) => u.id) }, month, year } });
    const targetByUser = new Map(targets.map((t) => [t.userId, t]));

    const payouts = await prisma.employeePayout.findMany({ where: { userId: { in: users.map((u) => u.id) }, month, year } });
    const payoutByKey = new Map(payouts.map((p) => [`${p.userId}:${p.type}`, p]));

    const data = await Promise.all(users.map(async (u) => {
      const baseSalary = salaryByUser.get(u.id) ?? null;
      const salaryPayout = payoutByKey.get(`${u.id}:SALARY`);

      let incentiveAmount = 0;
      if (u.role === 'EMPLOYEE') {
        const target = targetByUser.get(u.id);
        const { achievedRevenue } = await computeAchievement(req, u.id, month, year);
        incentiveAmount = computeIncentive(achievedRevenue, target?.targetRevenue ?? null, target?.incentivePercent ?? null);
      }
      const incentivePayout = payoutByKey.get(`${u.id}:INCENTIVE`);

      return {
        user: u,
        salary: baseSalary != null ? { amountDue: baseSalary, amountPaid: salaryPayout?.amountPaid ?? 0, status: salaryPayout?.status ?? (baseSalary > 0 ? 'PENDING' : 'PAID'), paidAt: salaryPayout?.paidAt ?? null } : null,
        incentive: u.role === 'EMPLOYEE' ? { amountDue: incentiveAmount, amountPaid: incentivePayout?.amountPaid ?? 0, status: incentivePayout?.status ?? (incentiveAmount > 0 ? 'PENDING' : 'PAID'), paidAt: incentivePayout?.paidAt ?? null } : null,
      };
    }));

    res.json({ success: true, data, month, year });
  } catch (e) {
    console.error('[hr] listPayouts error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const releasePayout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { type, month, year, amount } = req.body;
    if (!['SALARY', 'INCENTIVE'].includes(type)) { res.status(400).json({ success: false, error: 'type must be SALARY or INCENTIVE' }); return; }
    const amountToRelease = Number(amount);
    if (!Number.isFinite(amountToRelease) || amountToRelease <= 0) { res.status(400).json({ success: false, error: 'A valid amount is required' }); return; }
    if (!isWholeAmount(amountToRelease)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }

    const employee = await prisma.user.findFirst({ where: { id: userId, ...orgFilter(req) } });
    if (!employee) { res.status(404).json({ success: false, error: 'Employee not found' }); return; }

    // Recompute the current amountDue so status is accurate even if paid across multiple releases.
    let amountDue = 0;
    if (type === 'SALARY') {
      const config = await prisma.employeeSalaryConfig.findUnique({ where: { userId } });
      amountDue = config?.baseSalary ?? 0;
    } else {
      const target = await prisma.salesTarget.findUnique({ where: { userId_month_year: { userId, month: Number(month), year: Number(year) } } });
      const { achievedRevenue } = await computeAchievement(req, userId, Number(month), Number(year));
      amountDue = computeIncentive(achievedRevenue, target?.targetRevenue ?? null, target?.incentivePercent ?? null);
    }

    const existing = await prisma.employeePayout.findUnique({ where: { userId_type_month_year: { userId, type, month: Number(month), year: Number(year) } } });
    const newAmountPaid = (existing?.amountPaid ?? 0) + amountToRelease;
    const status = newAmountPaid >= amountDue ? 'PAID' : newAmountPaid > 0 ? 'PARTIAL' : 'PENDING';

    const payout = await prisma.employeePayout.upsert({
      where: { userId_type_month_year: { userId, type, month: Number(month), year: Number(year) } },
      update: { amountDue, amountPaid: newAmountPaid, status, paidAt: new Date(), paidById: req.user!.id },
      create: { organizationId: orgId(req), userId, type, month: Number(month), year: Number(year), amountDue, amountPaid: newAmountPaid, status, paidAt: new Date(), paidById: req.user!.id },
    });

    await prisma.activityLog.create({
      data: { action: 'Payout Released', details: `${req.user?.name} released ₹${amountToRelease} ${type.toLowerCase()} to ${employee.name} for ${month}/${year}`, entityType: 'USER', entityId: userId, userId: req.user!.id },
    });

    res.json({ success: true, data: payout });
  } catch (e) {
    console.error('[hr] releasePayout error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
