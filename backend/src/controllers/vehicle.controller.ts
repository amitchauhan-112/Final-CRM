import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { emitOperationsUpdated, notifyOperationsTeam } from '../services/notification.service.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

export const createVehicle = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { departureId } = req.params;
    const departure = await prisma.departure.findFirst({
      where: { id: departureId, ...(orgId(req) ? { organizationId: orgId(req) } : {}) },
    });
    if (!departure) { res.status(404).json({ success: false, error: 'Departure not found' }); return; }

    const { vehicleType, vehicleNumber, driverName, driverMobile, pickupTime, pickupLocation, vendorName, vendorContact, contactPerson, rate, vendorId, status } = req.body;

    const vehicle = await prisma.vehicle.create({
      data: {
        departureId,
        vehicleType: vehicleType?.trim() || null,
        vehicleNumber: vehicleNumber?.trim() || null,
        driverName: driverName?.trim() || null,
        driverMobile: driverMobile?.trim() || null,
        pickupTime: pickupTime ? new Date(pickupTime) : null,
        pickupLocation: pickupLocation?.trim() || null,
        vendorName: vendorName?.trim() || null,
        vendorContact: vendorContact?.trim() || null,
        contactPerson: contactPerson?.trim() || null,
        rate: rate !== undefined && rate !== '' && rate !== null ? Number(rate) : null,
        vendorId: vendorId?.trim() || null,
        status: status || 'PENDING',
      },
    });

    await prisma.activityLog.create({
      data: { action: 'Vehicle Added', details: `Vehicle added for ${departure.destination}`, entityType: 'VEHICLE', entityId: vehicle.id, userId: req.user!.id },
    });
    emitOperationsUpdated(departureId);

    res.status(201).json({ success: true, data: vehicle });
  } catch (e) {
    console.error('[operations] createVehicle error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const updateVehicle = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.vehicle.findUnique({ where: { id }, include: { departure: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Vehicle not found' }); return; }
    if (orgId(req) && existing.departure.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Vehicle not found' }); return; }

    const b = req.body;
    const wasPending = existing.status === 'PENDING';
    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        vehicleType: b.vehicleType !== undefined ? b.vehicleType?.trim() || null : existing.vehicleType,
        vehicleNumber: b.vehicleNumber !== undefined ? b.vehicleNumber?.trim() || null : existing.vehicleNumber,
        driverName: b.driverName !== undefined ? b.driverName?.trim() || null : existing.driverName,
        driverMobile: b.driverMobile !== undefined ? b.driverMobile?.trim() || null : existing.driverMobile,
        pickupTime: b.pickupTime !== undefined ? (b.pickupTime ? new Date(b.pickupTime) : null) : existing.pickupTime,
        pickupLocation: b.pickupLocation !== undefined ? b.pickupLocation?.trim() || null : existing.pickupLocation,
        vendorName: b.vendorName !== undefined ? b.vendorName?.trim() || null : existing.vendorName,
        vendorContact: b.vendorContact !== undefined ? b.vendorContact?.trim() || null : existing.vendorContact,
        contactPerson: b.contactPerson !== undefined ? b.contactPerson?.trim() || null : existing.contactPerson,
        rate: b.rate !== undefined ? (b.rate === '' || b.rate === null ? null : Number(b.rate)) : existing.rate,
        vendorId: b.vendorId !== undefined ? b.vendorId?.trim() || null : existing.vendorId,
        status: b.status ?? existing.status,
      },
    });

    await prisma.activityLog.create({
      data: { action: 'Vehicle Updated', details: `Vehicle updated by ${req.user?.name}`, entityType: 'VEHICLE', entityId: id, userId: req.user!.id },
    });
    emitOperationsUpdated(existing.departureId);
    if (wasPending && vehicle.status === 'CONFIRMED') {
      await notifyOperationsTeam(existing.departure.organizationId, 'VEHICLE_CONFIRMED', 'Vehicle Confirmed', `Vehicle confirmed for ${existing.departure.destination}`, existing.departureId);
    }

    res.json({ success: true, data: vehicle });
  } catch (e) {
    console.error('[operations] updateVehicle error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteVehicle = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.vehicle.findUnique({ where: { id }, include: { departure: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Vehicle not found' }); return; }
    if (orgId(req) && existing.departure.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Vehicle not found' }); return; }

    await prisma.vehicle.delete({ where: { id } });
    emitOperationsUpdated(existing.departureId);
    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error('[operations] deleteVehicle error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
