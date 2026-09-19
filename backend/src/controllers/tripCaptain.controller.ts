import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { notifyOperationsTeam } from '../services/notification.service.js';

// Everything here is scoped to req.user.id === departure.tripCaptainUserId —
// requireTripCaptain (middleware) only checks the role; ownership of a
// specific departure/hotel is checked in each handler below.

export const listMyDepartures = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const departures = await prisma.departure.findMany({
      where: { tripCaptainUserId: req.user!.id },
      select: {
        id: true, destination: true, departureDate: true, returnDate: true, status: true,
        _count: { select: { bookings: true } },
      },
      orderBy: { departureDate: 'desc' },
    });
    res.json({ success: true, data: departures });
  } catch (e) {
    console.error('[tripCaptain] listMyDepartures error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getMyDepartureDetail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const departure = await prisma.departure.findFirst({
      where: { id, tripCaptainUserId: req.user!.id },
      include: {
        package: {
          select: {
            id: true, name: true,
            itineraryItems: {
              where: { taskType: 'TRIP_DAY' },
              select: { dayOffset: true, title: true, notes: true, description: true, location: true },
              orderBy: { dayOffset: 'asc' },
            },
          },
        },
        hotels: { orderBy: { checkInDate: 'asc' } },
        vehicles: { orderBy: { serviceDate: 'asc' } },
        mealUpdates: { include: { postedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        bookings: { select: { numberOfTravelers: true, travelerName: true } },
      },
    });
    // Not found covers both "doesn't exist" and "not assigned to this
    // captain" identically — no need to leak which case it is.
    if (!departure) { res.status(404).json({ success: false, error: 'Trip not found' }); return; }

    const totalTravelers = departure.bookings.reduce((s, b) => s + b.numberOfTravelers, 0);
    res.json({ success: true, data: { ...departure, totalTravelers } });
  } catch (e) {
    console.error('[tripCaptain] getMyDepartureDetail error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

async function assertOwnedHotel(req: AuthenticatedRequest, hotelId: string) {
  return prisma.hotel.findFirst({
    where: { id: hotelId, departure: { tripCaptainUserId: req.user!.id } },
    include: { departure: { select: { id: true, organizationId: true, destination: true } } },
  });
}

export const checkInHotel = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const hotel = await assertOwnedHotel(req, id);
    if (!hotel) { res.status(404).json({ success: false, error: 'Hotel not found' }); return; }

    const updated = await prisma.hotel.update({ where: { id }, data: { checkedInAt: new Date() } });
    await notifyOperationsTeam(
      hotel.departure.organizationId, 'HOTEL_CHECKED_IN', 'Hotel Check-in',
      `Trip Captain checked in at "${hotel.name}" for ${hotel.departure.destination}`,
      hotel.departure.id
    );
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[tripCaptain] checkInHotel error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const checkOutHotel = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const hotel = await assertOwnedHotel(req, id);
    if (!hotel) { res.status(404).json({ success: false, error: 'Hotel not found' }); return; }
    if (!hotel.checkedInAt) { res.status(400).json({ success: false, error: 'Check in before checking out' }); return; }

    const updated = await prisma.hotel.update({ where: { id }, data: { checkedOutAt: new Date() } });
    await notifyOperationsTeam(
      hotel.departure.organizationId, 'HOTEL_CHECKED_OUT', 'Hotel Check-out',
      `Trip Captain checked out of "${hotel.name}" for ${hotel.departure.destination}`,
      hotel.departure.id
    );
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error('[tripCaptain] checkOutHotel error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const postMealUpdate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // departureId
    const { mealType, forDate, menu } = req.body;

    const departure = await prisma.departure.findFirst({
      where: { id, tripCaptainUserId: req.user!.id },
      select: { id: true, organizationId: true, destination: true },
    });
    if (!departure) { res.status(404).json({ success: false, error: 'Trip not found' }); return; }

    if (!['BREAKFAST', 'LUNCH', 'DINNER'].includes(mealType)) { res.status(400).json({ success: false, error: 'Valid meal type is required' }); return; }
    if (!forDate) { res.status(400).json({ success: false, error: 'Date is required' }); return; }
    if (!menu?.trim()) { res.status(400).json({ success: false, error: 'Menu is required' }); return; }

    const update = await prisma.mealUpdate.create({
      data: { departureId: id, mealType, forDate: new Date(forDate), menu: menu.trim(), postedById: req.user!.id },
      include: { postedBy: { select: { id: true, name: true } } },
    });

    await notifyOperationsTeam(
      departure.organizationId, 'MEAL_UPDATE_POSTED', 'Meal Update Posted',
      `${mealType.charAt(0) + mealType.slice(1).toLowerCase()} menu posted for ${departure.destination}`,
      departure.id
    );

    res.status(201).json({ success: true, data: update });
  } catch (e) {
    console.error('[tripCaptain] postMealUpdate error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
