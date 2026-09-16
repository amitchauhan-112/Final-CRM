import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

// An employee's current cash holding is always computed live from the
// ledger (SUM(HANDOVER) - SUM(COLLECTION)) rather than stored as a running
// total — see the model comment in schema.prisma for why.
async function currentHolding(employeeId: string, oid: string | null): Promise<number> {
  const [handed, collected] = await Promise.all([
    prisma.employeeCashLedger.aggregate({
      where: { employeeId, type: 'HANDOVER', ...(oid ? { organizationId: oid } : {}) },
      _sum: { amount: true },
    }),
    prisma.employeeCashLedger.aggregate({
      where: { employeeId, type: 'COLLECTION', ...(oid ? { organizationId: oid } : {}) },
      _sum: { amount: true },
    }),
  ]);
  return (handed._sum.amount ?? 0) - (collected._sum.amount ?? 0);
}

// ─── GET /employee-cash/mine — any authenticated user, their own holding ────

export const getMyCashHolding = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const oid = orgId(req);
    const holding = await currentHolding(req.user!.id, oid);
    const history = await prisma.employeeCashLedger.findMany({
      where: { employeeId: req.user!.id, ...(oid ? { organizationId: oid } : {}) },
      include: {
        payment: { select: { id: true, booking: { select: { bookingNumber: true, travelerName: true } } } },
        collectedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: { holding, history } });
  } catch (e) {
    console.error('[employeeCash] getMyCashHolding error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── GET /employee-cash — Finance/Admin, every employee's current holding ───

export const listEmployeeCash = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const oid = orgId(req);
    const employees = await prisma.user.findMany({
      where: { isActive: true, ...orgFilter(req) },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
      employees.map(async (emp) => {
        const [handed, collected] = await Promise.all([
          prisma.employeeCashLedger.aggregate({
            where: { employeeId: emp.id, type: 'HANDOVER', ...(oid ? { organizationId: oid } : {}) },
            _sum: { amount: true },
          }),
          prisma.employeeCashLedger.aggregate({
            where: { employeeId: emp.id, type: 'COLLECTION', ...(oid ? { organizationId: oid } : {}) },
            _sum: { amount: true },
          }),
        ]);
        const totalHandedOver = handed._sum.amount ?? 0;
        const totalCollected = collected._sum.amount ?? 0;
        return {
          id: emp.id, name: emp.name, email: emp.email, role: emp.role,
          currentHolding: totalHandedOver - totalCollected,
          totalHandedOver, totalCollected,
        };
      })
    );

    // Only surface employees who've actually touched cash — a bare "everyone
    // at ₹0" list isn't useful and would bury the ones that matter.
    const active = rows.filter((r) => r.totalHandedOver > 0 || r.totalCollected > 0);

    res.json({
      success: true,
      data: active,
      summary: {
        totalWithEmployees: active.reduce((s, r) => s + r.currentHolding, 0),
        totalCollectedByCompany: active.reduce((s, r) => s + r.totalCollected, 0),
      },
    });
  } catch (e) {
    console.error('[employeeCash] listEmployeeCash error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── GET /employee-cash/:employeeId/history — Finance/Admin ─────────────────

export const getEmployeeCashHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const oid = orgId(req);
    const { page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const employee = await prisma.user.findFirst({ where: { id: employeeId, ...orgFilter(req) }, select: { id: true, name: true } });
    if (!employee) { res.status(404).json({ success: false, error: 'Employee not found' }); return; }

    const where = { employeeId, ...(oid ? { organizationId: oid } : {}) };
    const [entries, total, holding] = await Promise.all([
      prisma.employeeCashLedger.findMany({
        where,
        include: {
          payment: { select: { id: true, booking: { select: { bookingNumber: true, travelerName: true } } } },
          collectedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip, take: Number(limit),
      }),
      prisma.employeeCashLedger.count({ where }),
      currentHolding(employeeId, oid),
    ]);

    res.json({
      success: true,
      data: entries,
      employee,
      holding,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (e) {
    console.error('[employeeCash] getEmployeeCashHistory error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── POST /employee-cash/:employeeId/collect — Finance/Admin ────────────────
// Partial collection supported — Finance can collect any amount up to what
// the employee currently holds, not just the full balance.

export const collectEmployeeCash = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const { amount, notes } = req.body;
    const oid = orgId(req);

    const employee = await prisma.user.findFirst({ where: { id: employeeId, ...orgFilter(req) }, select: { id: true, name: true } });
    if (!employee) { res.status(404).json({ success: false, error: 'Employee not found' }); return; }

    const collectAmount = Number(amount);
    if (!collectAmount || isNaN(collectAmount) || collectAmount <= 0) {
      res.status(400).json({ success: false, error: 'Valid amount is required' }); return;
    }

    const holding = await currentHolding(employeeId, oid);
    if (collectAmount > holding) {
      res.status(409).json({ success: false, error: `${employee.name} only holds ₹${holding.toLocaleString('en-IN')} — cannot collect more than that` });
      return;
    }

    const entry = await prisma.employeeCashLedger.create({
      data: {
        organizationId: oid,
        employeeId,
        type: 'COLLECTION',
        amount: collectAmount,
        collectedById: req.user!.id,
        notes: notes?.trim() || null,
      },
    });

    await prisma.activityLog.create({
      data: {
        action: 'Cash Collected From Employee',
        details: `₹${collectAmount.toLocaleString('en-IN')} collected from ${employee.name} by ${req.user?.name}`,
        entityType: 'EMPLOYEE_CASH',
        entityId: entry.id,
        userId: req.user!.id,
      },
    });

    res.json({ success: true, data: entry, message: `₹${collectAmount.toLocaleString('en-IN')} collected from ${employee.name}` });
  } catch (e) {
    console.error('[employeeCash] collectEmployeeCash error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
