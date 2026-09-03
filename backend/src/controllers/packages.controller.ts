import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;
const userId = (req: AuthenticatedRequest) => req.user?.id ?? '';
const userRole = (req: AuthenticatedRequest) => req.user?.role ?? 'EMPLOYEE';

// Package codes are no longer a user-facing concept (nobody types one
// anymore) — generated internally so PackageAuditLog still has something
// stable to denormalize, and other backend code that reads `code` off a
// Package keeps working unchanged.
function generatePackageCode(name: string, packageType: string): string {
  const slug = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10) || 'PKG';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${packageType}-${slug}-${rand}`;
}

const parseList = (raw: any): string[] => {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p.filter(Boolean) : []; }
    catch { return raw.split('\n').map((s) => s.trim()).filter(Boolean); }
  }
  return [];
};

// ─── Permission helpers ───────────────────────────────────────────────────────

function canCreatePackage(role: string, packageType: string): boolean {
  if (role === 'ADMIN') return true;
  return packageType === 'FIT'; // employees can create FIT
}

function canMutatePackage(role: string, packageType: string, createdById: string | null, actorId: string): boolean {
  if (role === 'ADMIN') return true;
  if (packageType === 'GIT') return false; // only admin can mutate GIT
  return createdById === actorId; // FIT: only creator
}

// ─── Audit helpers ────────────────────────────────────────────────────────────

async function recordAudit(opts: {
  packageId: string;
  req: AuthenticatedRequest;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changedFields?: { field: string; from: any; to: any }[];
  packageName?: string;
  packageCode?: string;
  packageType?: string;
}) {
  const { packageId, req, action, changedFields, packageName, packageCode, packageType } = opts;
  await prisma.packageAuditLog.create({
    data: {
      packageId,
      userId: req.user!.id,
      userName: req.user!.name ?? req.user!.email,
      employeeId: (req.user as any)?.employeeId ?? null,
      userRole: req.user!.role,
      action,
      changedFields: changedFields && changedFields.length > 0 ? JSON.stringify(changedFields) : null,
      packageName: packageName ?? null,
      packageCode: packageCode ?? null,
      packageType: packageType ?? null,
    },
  });
}

function diffPackage(
  old: Record<string, any>,
  next: Record<string, any>,
  fields: string[],
): { field: string; from: any; to: any }[] {
  return fields
    .filter((f) => String(old[f] ?? '') !== String(next[f] ?? ''))
    .map((f) => ({ field: f, from: old[f] ?? null, to: next[f] ?? null }));
}

const AUDITED_FIELDS = [
  'name', 'code', 'description', 'overview', 'nights', 'days', 'status', 'packageType',
  'destinationId', 'tourCategoryId', 'pricePerPerson', 'offerPrice', 'isPopular',
  'difficultyLevel', 'pickupLocation', 'dropLocation', 'cancellationPolicy', 'termsAndConditions',
];

// ─── List packages ────────────────────────────────────────────────────────────

export const getPackages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, destinationId, tourCategoryId, search, difficultyLevel, packageType } = req.query;
    const where: any = { organizationId: orgId(req) };
    if (status) where.status = status;
    if (packageType) where.packageType = packageType;
    if (destinationId) where.destinationId = destinationId;
    if (tourCategoryId) where.tourCategoryId = tourCategoryId;
    if (difficultyLevel) where.difficultyLevel = difficultyLevel;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { code: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const packages = await prisma.package.findMany({
      where,
      include: {
        destination: { select: { id: true, name: true, country: true, state: true } },
        tourCategory: { select: { id: true, name: true, icon: true } },
        createdBy: { select: { id: true, name: true, employeeId: true } },
        lastModifiedBy: { select: { id: true, name: true } },
        _count: { select: { itineraryItems: true, bookings: true } },
      },
      orderBy: [{ isPopular: 'desc' }, { name: 'asc' }],
    });

    res.json({ success: true, data: packages });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Get single package ───────────────────────────────────────────────────────

export const getPackage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const pkg = await prisma.package.findFirst({
      where: { id, organizationId: orgId(req) },
      include: {
        destination: { select: { id: true, name: true, country: true, state: true } },
        tourCategory: { select: { id: true, name: true, icon: true } },
        createdBy: { select: { id: true, name: true, employeeId: true } },
        lastModifiedBy: { select: { id: true, name: true } },
        itineraryItems: { orderBy: [{ dayOffset: 'asc' }, { sortOrder: 'asc' }] },
        _count: { select: { bookings: true } },
      },
    });
    if (!pkg) { res.status(404).json({ success: false, error: 'Package not found' }); return; }
    res.json({ success: true, data: pkg });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Get package audit trail ──────────────────────────────────────────────────

export const getPackageAudit = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (userRole(req) !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Only admins can view the audit trail' }); return;
    }
    const { id } = req.params;
    const pkg = await prisma.package.findFirst({ where: { id, organizationId: orgId(req) }, select: { id: true } });
    if (!pkg) { res.status(404).json({ success: false, error: 'Package not found' }); return; }

    const logs = await prisma.packageAuditLog.findMany({
      where: { packageId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ success: true, data: logs });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Create package ───────────────────────────────────────────────────────────

export const createPackage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      name, description, overview, destinationId, tourCategoryId,
      nights, inclusions, exclusions, highlights, thingsToCarry,
      pricePerPerson, priceSingle, priceDouble, priceTriple, priceQuad, offerPrice,
      capacityMin, capacityMax, difficultyLevel, bestSeason,
      pickupLocation, dropLocation, cancellationPolicy, termsAndConditions, packageNotes,
      images, gallery, isPopular, status,
      packageType = 'GIT',
      stayLocations,
      itineraryRows,
    } = req.body;

    if (!name?.trim()) { res.status(400).json({ success: false, error: 'Package name is required' }); return; }
    if (nights === undefined || nights === '' || isNaN(Number(nights))) {
      res.status(400).json({ success: false, error: 'Stay nights is required' }); return;
    }
    if (!['GIT', 'FIT'].includes(packageType)) {
      res.status(400).json({ success: false, error: 'Invalid package type' }); return;
    }
    if ([pricePerPerson, priceSingle, priceDouble, priceTriple, priceQuad, offerPrice].some((p) => !isWholeAmount(p))) {
      res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return;
    }

    if (!canCreatePackage(userRole(req), packageType)) {
      res.status(403).json({ success: false, error: 'Only Admin can create GIT packages' }); return;
    }

    const stayNights = Number(nights);
    const totalDays = stayNights + 2;

    const pkg = await prisma.package.create({
      data: {
        organizationId: orgId(req),
        name: name.trim(),
        code: generatePackageCode(name, packageType),
        description: description?.trim() || null,
        overview: overview?.trim() || null,
        destinationId: destinationId || null,
        tourCategoryId: tourCategoryId || null,
        nights: stayNights,
        days: totalDays,
        packageType,
        createdById: userId(req),
        lastModifiedById: userId(req),
        inclusions: JSON.stringify(parseList(inclusions)),
        exclusions: JSON.stringify(parseList(exclusions)),
        highlights: JSON.stringify(parseList(highlights)),
        thingsToCarry: JSON.stringify(parseList(thingsToCarry)),
        pricePerPerson: pricePerPerson != null ? Number(pricePerPerson) : 0,
        priceSingle: priceSingle != null ? Number(priceSingle) : null,
        priceDouble: priceDouble != null ? Number(priceDouble) : null,
        priceTriple: priceTriple != null ? Number(priceTriple) : null,
        priceQuad: priceQuad != null ? Number(priceQuad) : null,
        offerPrice: offerPrice != null ? Number(offerPrice) : null,
        capacityMin: capacityMin != null ? Number(capacityMin) : null,
        capacityMax: capacityMax != null ? Number(capacityMax) : null,
        difficultyLevel: difficultyLevel || null,
        bestSeason: JSON.stringify(parseList(bestSeason)),
        pickupLocation: pickupLocation?.trim() || null,
        dropLocation: dropLocation?.trim() || null,
        cancellationPolicy: cancellationPolicy?.trim() || null,
        termsAndConditions: termsAndConditions?.trim() || null,
        packageNotes: packageNotes?.trim() || null,
        images: JSON.stringify(parseList(images)),
        gallery: JSON.stringify(parseList(gallery)),
        isPopular: Boolean(isPopular),
        status: status || 'ACTIVE',
      },
      include: {
        destination: { select: { id: true, name: true, country: true, state: true } },
        tourCategory: { select: { id: true, name: true, icon: true } },
        createdBy: { select: { id: true, name: true, employeeId: true } },
        lastModifiedBy: { select: { id: true, name: true } },
      },
    });

    // Build itinerary — use caller-supplied rows when provided, else auto-generate
    let itineraryData: any[];
    if (Array.isArray(itineraryRows) && itineraryRows.length > 0) {
      itineraryData = itineraryRows.map((row: any) => ({
        packageId: pkg.id,
        dayOffset: Number(row.dayOffset),
        title: String(row.title || `Day ${row.dayOffset}`),
        description: row.activityDetails ? String(row.activityDetails) : '',
        notes: row.activityType ? String(row.activityType) : 'JOURNEY',
        taskType: 'TRIP_DAY' as const,
        department: 'SALES' as const,
        sortOrder: Number(row.dayOffset),
      }));
    } else {
      itineraryData = [
        { packageId: pkg.id, dayOffset: 0, title: 'Day 0', description: '', notes: 'JOURNEY', taskType: 'TRIP_DAY' as const, department: 'SALES' as const, sortOrder: 0 },
        { packageId: pkg.id, dayOffset: 1, title: 'Night 0', description: '', notes: 'JOURNEY', taskType: 'TRIP_DAY' as const, department: 'SALES' as const, sortOrder: 1 },
        ...Array.from({ length: stayNights }, (_, i) => [
          { packageId: pkg.id, dayOffset: (i + 1) * 2, title: `Day ${i + 1}`, description: '', notes: 'SIGHTSEEING', taskType: 'TRIP_DAY' as const, department: 'SALES' as const, sortOrder: (i + 1) * 2 },
          { packageId: pkg.id, dayOffset: (i + 1) * 2 + 1, title: `Night ${i + 1}`, description: '', notes: 'STAY', taskType: 'TRIP_DAY' as const, department: 'SALES' as const, sortOrder: (i + 1) * 2 + 1 },
        ]).flat(),
        { packageId: pkg.id, dayOffset: (stayNights + 1) * 2, title: `Day ${stayNights + 1}`, description: '', notes: 'JOURNEY', taskType: 'TRIP_DAY' as const, department: 'SALES' as const, sortOrder: (stayNights + 1) * 2 },
        { packageId: pkg.id, dayOffset: (stayNights + 1) * 2 + 1, title: `Night ${stayNights + 1}`, description: '', notes: 'JOURNEY', taskType: 'TRIP_DAY' as const, department: 'SALES' as const, sortOrder: (stayNights + 1) * 2 + 1 },
      ];
    }
    await prisma.packageItinerary.createMany({ data: itineraryData });

    await recordAudit({
      packageId: pkg.id, req, action: 'CREATE',
      packageName: pkg.name, packageCode: pkg.code, packageType: pkg.packageType,
    });

    res.status(201).json({ success: true, data: pkg });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      res.status(409).json({ success: false, error: 'Package code already exists' }); return;
    }
    console.error('[packages] createPackage error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Update package ───────────────────────────────────────────────────────────

export const updatePackage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.package.findFirst({ where: { id, organizationId: orgId(req) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Package not found' }); return; }

    if (!canMutatePackage(userRole(req), existing.packageType, existing.createdById, userId(req))) {
      if (existing.packageType === 'GIT') {
        res.status(403).json({ success: false, error: 'Only Admin can edit GIT packages' }); return;
      }
      res.status(403).json({ success: false, error: 'You can only edit FIT packages you created' }); return;
    }

    const {
      name, description, overview, destinationId, tourCategoryId,
      nights, inclusions, exclusions, highlights, thingsToCarry,
      pricePerPerson, priceSingle, priceDouble, priceTriple, priceQuad, offerPrice,
      capacityMin, capacityMax, difficultyLevel, bestSeason,
      pickupLocation, dropLocation, cancellationPolicy, termsAndConditions, packageNotes,
      images, gallery, isPopular, status,
    } = req.body;

    if ([pricePerPerson, priceSingle, priceDouble, priceTriple, priceQuad, offerPrice].some((p) => !isWholeAmount(p))) {
      res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return;
    }

    const oldNights = existing.nights;
    const newNights = nights !== undefined ? Number(nights) : oldNights;
    const newDays = newNights + 2;
    const nightsChanged = nights !== undefined && newNights !== oldNights;

    const nextData: Record<string, any> = {
      name: name?.trim() ?? existing.name,
      // code is generated once at creation and never user-editable — always
      // keeps its original value on update.
      description: description !== undefined ? description?.trim() || null : existing.description,
      overview: overview !== undefined ? overview?.trim() || null : existing.overview,
      destinationId: destinationId !== undefined ? destinationId || null : existing.destinationId,
      tourCategoryId: tourCategoryId !== undefined ? tourCategoryId || null : existing.tourCategoryId,
      nights: newNights,
      days: newDays,
      inclusions: inclusions !== undefined ? JSON.stringify(parseList(inclusions)) : existing.inclusions,
      exclusions: exclusions !== undefined ? JSON.stringify(parseList(exclusions)) : existing.exclusions,
      highlights: highlights !== undefined ? JSON.stringify(parseList(highlights)) : existing.highlights,
      thingsToCarry: thingsToCarry !== undefined ? JSON.stringify(parseList(thingsToCarry)) : existing.thingsToCarry,
      pricePerPerson: pricePerPerson !== undefined ? Number(pricePerPerson) : existing.pricePerPerson,
      priceSingle: priceSingle !== undefined ? (priceSingle != null ? Number(priceSingle) : null) : existing.priceSingle,
      priceDouble: priceDouble !== undefined ? (priceDouble != null ? Number(priceDouble) : null) : existing.priceDouble,
      priceTriple: priceTriple !== undefined ? (priceTriple != null ? Number(priceTriple) : null) : existing.priceTriple,
      priceQuad: priceQuad !== undefined ? (priceQuad != null ? Number(priceQuad) : null) : existing.priceQuad,
      offerPrice: offerPrice !== undefined ? (offerPrice != null ? Number(offerPrice) : null) : existing.offerPrice,
      capacityMin: capacityMin !== undefined ? (capacityMin != null ? Number(capacityMin) : null) : existing.capacityMin,
      capacityMax: capacityMax !== undefined ? (capacityMax != null ? Number(capacityMax) : null) : existing.capacityMax,
      difficultyLevel: difficultyLevel !== undefined ? difficultyLevel || null : existing.difficultyLevel,
      bestSeason: bestSeason !== undefined ? JSON.stringify(parseList(bestSeason)) : existing.bestSeason,
      pickupLocation: pickupLocation !== undefined ? pickupLocation?.trim() || null : existing.pickupLocation,
      dropLocation: dropLocation !== undefined ? dropLocation?.trim() || null : existing.dropLocation,
      cancellationPolicy: cancellationPolicy !== undefined ? cancellationPolicy?.trim() || null : existing.cancellationPolicy,
      termsAndConditions: termsAndConditions !== undefined ? termsAndConditions?.trim() || null : existing.termsAndConditions,
      packageNotes: packageNotes !== undefined ? packageNotes?.trim() || null : existing.packageNotes,
      images: images !== undefined ? JSON.stringify(parseList(images)) : existing.images,
      gallery: gallery !== undefined ? JSON.stringify(parseList(gallery)) : existing.gallery,
      isPopular: isPopular !== undefined ? Boolean(isPopular) : existing.isPopular,
      status: status ?? existing.status,
      lastModifiedById: userId(req),
    };

    const changedFields = diffPackage(existing as any, nextData, AUDITED_FIELDS);

    const pkg = await prisma.package.update({
      where: { id },
      data: nextData,
      include: {
        destination: { select: { id: true, name: true, country: true, state: true } },
        tourCategory: { select: { id: true, name: true, icon: true } },
        createdBy: { select: { id: true, name: true, employeeId: true } },
        lastModifiedBy: { select: { id: true, name: true } },
      },
    });

    // Regenerate itinerary — use caller-supplied rows when provided, else regenerate on nights change
    const { itineraryRows } = req.body;
    if (Array.isArray(itineraryRows) && itineraryRows.length > 0) {
      await prisma.packageItinerary.deleteMany({ where: { packageId: id, taskType: 'TRIP_DAY' } });
      await prisma.packageItinerary.createMany({
        data: itineraryRows.map((row: any) => ({
          packageId: id,
          dayOffset: Number(row.dayOffset),
          title: String(row.title || `Day ${row.dayOffset}`),
          description: row.activityDetails ? String(row.activityDetails) : '',
          notes: row.activityType ? String(row.activityType) : 'JOURNEY',
          taskType: 'TRIP_DAY' as const,
          department: 'SALES' as const,
          sortOrder: Number(row.dayOffset),
        })),
      });
    } else if (nightsChanged) {
      await prisma.packageItinerary.deleteMany({ where: { packageId: id, taskType: 'TRIP_DAY' } });
      const itineraryData = [
        { packageId: id, dayOffset: 0, title: 'Day 0', description: '', notes: 'JOURNEY', taskType: 'TRIP_DAY' as const, department: 'SALES' as const, sortOrder: 0 },
        { packageId: id, dayOffset: 1, title: 'Night 0', description: '', notes: 'JOURNEY', taskType: 'TRIP_DAY' as const, department: 'SALES' as const, sortOrder: 1 },
        ...Array.from({ length: newNights }, (_, i) => [
          { packageId: id, dayOffset: (i + 1) * 2, title: `Day ${i + 1}`, description: '', notes: 'SIGHTSEEING', taskType: 'TRIP_DAY' as const, department: 'SALES' as const, sortOrder: (i + 1) * 2 },
          { packageId: id, dayOffset: (i + 1) * 2 + 1, title: `Night ${i + 1}`, description: '', notes: 'STAY', taskType: 'TRIP_DAY' as const, department: 'SALES' as const, sortOrder: (i + 1) * 2 + 1 },
        ]).flat(),
        { packageId: id, dayOffset: (newNights + 1) * 2, title: `Day ${newNights + 1}`, description: '', notes: 'JOURNEY', taskType: 'TRIP_DAY' as const, department: 'SALES' as const, sortOrder: (newNights + 1) * 2 },
        { packageId: id, dayOffset: (newNights + 1) * 2 + 1, title: `Night ${newNights + 1}`, description: '', notes: 'JOURNEY', taskType: 'TRIP_DAY' as const, department: 'SALES' as const, sortOrder: (newNights + 1) * 2 + 1 },
      ];
      await prisma.packageItinerary.createMany({ data: itineraryData });
    }

    if (changedFields.length > 0) {
      await recordAudit({
        packageId: id, req, action: 'UPDATE',
        changedFields,
        packageName: pkg.name, packageCode: pkg.code, packageType: pkg.packageType,
      });
    }

    res.json({ success: true, data: pkg });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      res.status(409).json({ success: false, error: 'Package code already exists' }); return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Delete package ───────────────────────────────────────────────────────────

export const deletePackage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.package.findFirst({ where: { id, organizationId: orgId(req) } });
    if (!existing) { res.status(404).json({ success: false, error: 'Package not found' }); return; }

    if (!canMutatePackage(userRole(req), existing.packageType, existing.createdById, userId(req))) {
      if (existing.packageType === 'GIT') {
        res.status(403).json({ success: false, error: 'Only Admin can delete GIT packages' }); return;
      }
      res.status(403).json({ success: false, error: 'You can only delete FIT packages you created' }); return;
    }

    // Record audit before deletion (cascade will remove audit logs too, but we store denormalized data)
    await recordAudit({
      packageId: id, req, action: 'DELETE',
      packageName: existing.name, packageCode: existing.code, packageType: existing.packageType,
    });

    await prisma.package.delete({ where: { id } });
    res.json({ success: true, message: 'Package deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
