import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { buildUploadUrl, filePathFromUploadUrl, deleteUploadedFile } from '../middleware/upload.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const orgFilter = (req: AuthenticatedRequest) => (orgId(req) ? { organizationId: orgId(req) } : {});

export const listVendors = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { search, type, status } = req.query;
    const where: Record<string, unknown> = { ...orgFilter(req) };
    if (type) where.type = type;
    if (status) where.status = status;
    if (search) where.name = { contains: String(search), mode: 'insensitive' };

    const vendors = await prisma.vendor.findMany({ where, orderBy: { name: 'asc' } });
    res.json({ success: true, data: vendors });
  } catch (e) {
    console.error('[operations] listVendors error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const createVendor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, type, contact, contactPerson, rate, notes, status } = req.body;
    if (!name?.trim()) { res.status(400).json({ success: false, error: 'Vendor name is required' }); return; }

    const vendor = await prisma.vendor.create({
      data: {
        organizationId: orgId(req),
        name: name.trim(),
        type: type || 'OTHER',
        contact: contact?.trim() || null,
        contactPerson: contactPerson?.trim() || null,
        rate: rate !== undefined && rate !== '' && rate !== null ? Number(rate) : null,
        notes: notes?.trim() || null,
        status: status || 'ACTIVE',
      },
    });

    await prisma.activityLog.create({
      data: { action: 'Vendor Added', details: `Vendor "${vendor.name}" added`, entityType: 'VENDOR', entityId: vendor.id, userId: req.user!.id },
    });

    res.status(201).json({ success: true, data: vendor });
  } catch (e) {
    console.error('[operations] createVendor error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const updateVendor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.vendor.findFirst({ where: { id, ...orgFilter(req) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const b = req.body;
    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        name: b.name !== undefined ? String(b.name).trim() : existing.name,
        type: b.type ?? existing.type,
        contact: b.contact !== undefined ? b.contact?.trim() || null : existing.contact,
        contactPerson: b.contactPerson !== undefined ? b.contactPerson?.trim() || null : existing.contactPerson,
        rate: b.rate !== undefined ? (b.rate === '' || b.rate === null ? null : Number(b.rate)) : existing.rate,
        notes: b.notes !== undefined ? b.notes?.trim() || null : existing.notes,
        status: b.status ?? existing.status,
      },
    });

    await prisma.activityLog.create({
      data: { action: 'Vendor Updated', details: `Vendor "${vendor.name}" updated by ${req.user?.name}`, entityType: 'VENDOR', entityId: id, userId: req.user!.id },
    });

    res.json({ success: true, data: vendor });
  } catch (e) {
    console.error('[operations] updateVendor error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteVendor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.vendor.findFirst({ where: { id, ...orgFilter(req) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    await prisma.vendor.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error('[operations] deleteVendor error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Vendor Workspace ─────────────────────────────────────────────────────────
// Aggregates everything already tracked elsewhere about a vendor — hotels and
// vehicles now joined via the Phase A vendorId FK, VendorPayment billing
// history, and vendor-level documents — into one detail view. No new schema
// beyond what Phase A already added.
export const getVendorDetail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const vendor = await prisma.vendor.findFirst({
      where: { id, ...orgFilter(req) },
      include: {
        documents: { include: { uploadedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        hotels: { include: { departure: { select: { id: true, destination: true, departureDate: true, status: true } } }, orderBy: { createdAt: 'desc' } },
        vehicles: { include: { departure: { select: { id: true, destination: true, departureDate: true, status: true } } }, orderBy: { createdAt: 'desc' } },
        payments: { include: { departure: { select: { id: true, destination: true, departureDate: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const now = new Date();
    const trips = [
      ...vendor.hotels.filter((h) => h.departure).map((h) => ({
        service: 'HOTEL' as const, id: h.id, status: h.status,
        departureId: h.departure!.id, destination: h.departure!.destination, departureDate: h.departure!.departureDate, departureStatus: h.departure!.status,
      })),
      ...vendor.vehicles.filter((v) => v.departure).map((v) => ({
        service: 'VEHICLE' as const, id: v.id, status: v.status,
        departureId: v.departure!.id, destination: v.departure!.destination, departureDate: v.departure!.departureDate, departureStatus: v.departure!.status,
      })),
    ];
    const upcomingTrips = trips.filter((t) => t.departureDate >= now).sort((a, b) => a.departureDate.getTime() - b.departureDate.getTime());
    const pastTrips = trips.filter((t) => t.departureDate < now).sort((a, b) => b.departureDate.getTime() - a.departureDate.getTime());

    const paymentSummary = {
      totalBilled: vendor.payments.reduce((s, p) => s + p.totalAmount, 0),
      totalPaid: vendor.payments.reduce((s, p) => s + p.advancePaid, 0),
      totalPending: vendor.payments.reduce((s, p) => s + p.balanceAmount, 0),
      billCount: vendor.payments.length,
    };

    const { hotels, vehicles, ...vendorFields } = vendor;
    res.json({ success: true, data: { ...vendorFields, upcomingTrips, pastTrips, paymentSummary } });
  } catch (e) {
    console.error('[operations] getVendorDetail error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const uploadVendorDocument = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { vendorId } = req.params;
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, ...orgFilter(req) } });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }
    if (!req.file) { res.status(400).json({ success: false, error: 'File is required' }); return; }

    const { type } = req.body;
    const document = await prisma.vendorDocument.create({
      data: {
        vendorId,
        name: req.file.originalname,
        type: type || 'OTHER',
        fileUrl: buildUploadUrl(req.file),
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedById: req.user!.id,
      },
    });

    await prisma.activityLog.create({
      data: { action: 'Vendor Document Uploaded', details: `"${document.name}" uploaded for ${vendor.name}`, entityType: 'VENDOR', entityId: vendorId, userId: req.user!.id },
    });

    res.status(201).json({ success: true, data: document });
  } catch (e) {
    console.error('[operations] uploadVendorDocument error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteVendorDocument = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.vendorDocument.findUnique({ where: { id }, include: { vendor: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Document not found' }); return; }
    if (orgId(req) && existing.vendor.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Document not found' }); return; }

    await prisma.vendorDocument.delete({ where: { id } });

    deleteUploadedFile(filePathFromUploadUrl(existing.fileUrl)).catch(() => {});

    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error('[operations] deleteVendorDocument error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
