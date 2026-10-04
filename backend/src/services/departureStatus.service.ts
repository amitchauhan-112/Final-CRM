import prisma from '../lib/prisma.js';
import { computeChecklist } from '../controllers/departure.controller.js';
import { tabWhere } from '../utils/departureTabs.js';

// Moves an ACTIVE trip to COMPLETED only when both are true: its end date has
// passed AND every applicable checklist item is done. A trip with an end date
// behind it but missing details stays OVERDUE until Operations fills them in.
export async function completeFinishedDepartures(now: Date = new Date()): Promise<number> {
  const candidates = await prisma.departure.findMany({
    where: { ...tabWhere('OVERDUE', now), status: 'ACTIVE' },
    select: {
      id: true,
      hotels: { select: { status: true, roomAllocation: true } },
      vehicles: { select: { status: true, driverName: true } },
      tripCaptainStatus: true,
      manualChecklist: true,
      bookings: { select: { travelers: { select: { verificationStatus: true } } } },
    },
  });

  const readyIds = candidates
    .filter((d) => computeChecklist(d as any).progress === 100)
    .map((d) => d.id);

  if (readyIds.length) {
    await prisma.departure.updateMany({ where: { id: { in: readyIds } }, data: { status: 'COMPLETED' } });
  }
  return readyIds.length;
}
