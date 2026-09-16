// ─── Stay-block derivation ────────────────────────────────────────────────────
// Groups a package's day-wise itinerary STAY nights into check-in/check-out
// stay blocks — "this city needs a hotel from this date to that date" — for
// one departure. Extracted so both the cross-departure Stay Planning page
// (buildStayDateMap in departure.controller.ts) and the per-departure Hotel
// Required view (getDepartureDetail) use the exact same algorithm instead of
// two copies that could drift apart.
//
// PackageItinerary.dayOffset uses a "doubled" day/night encoding — one day-row
// and one night-row per night, dayOffset = dayIndex*2 + (isNight ? 1 : 0) — so
// the real calendar day index is Math.floor(dayOffset / 2), with dayIndex 0
// landing on the departure date itself. This is confirmed by PackagesPage.tsx's
// buildItineraryRows and both createPackage/updatePackage in
// packages.controller.ts, all of which use this exact formula.
//
// All date math below is UTC date-string arithmetic throughout (never local
// Date mutation + toISOString, which can drift a day depending on server
// timezone/DST if the two are mixed — the bug the original inline version of
// this logic had).

export interface StayBlock {
  location: string;
  checkIn: string;  // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  nights: number;
}

interface ItineraryLike {
  dayOffset: number;
  notes: string | null;
  location?: string | null;
  description?: string | null;
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// Turn each STAY night into its calendar date, then collapse consecutive
// nights at the SAME location into one stay block (checkIn → checkOut). This
// is what makes "Night 1 Manali + Night 2 Manali" show as one 2-night stay
// instead of two identical, independently-counted entries. A package that
// returns to the same city later (Night 1 Manali, Night 2 Kasol, Night 3
// Manali) still gets two separate blocks, because the nights aren't
// consecutive — no gap-detection needed beyond the plain date-adjacency check,
// since a JOURNEY/SIGHTSEEING day in between is already filtered out before
// grouping, which alone breaks the adjacency.
export function deriveStayBlocks(
  itineraryItems: ItineraryLike[],
  departureDate: Date | string,
  fallbackDestination: string
): StayBlock[] {
  const depDateStr = typeof departureDate === 'string'
    ? departureDate.slice(0, 10)
    : departureDate.toISOString().split('T')[0];

  const nights = itineraryItems
    .filter((item) => item.notes === 'STAY')
    .map((item) => {
      const dayIndex = Math.floor(item.dayOffset / 2);
      return {
        dateStr: addDaysStr(depDateStr, dayIndex),
        // location is the new structured field; description is the older
        // free-text "Activity Details" box (still the only data older
        // itinerary rows have), fallbackDestination covers packages with
        // neither filled in yet.
        location: (item.location || item.description || fallbackDestination || '').trim() || 'Unknown',
      };
    });

  const blocks: StayBlock[] = [];
  for (const n of nights) {
    const last = blocks[blocks.length - 1];
    if (last && last.location === n.location && last.checkOut === n.dateStr) {
      last.checkOut = addDaysStr(n.dateStr, 1);
      last.nights += 1;
    } else {
      blocks.push({ location: n.location, checkIn: n.dateStr, checkOut: addDaysStr(n.dateStr, 1), nights: 1 });
    }
  }
  return blocks;
}
