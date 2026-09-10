// ─── Room Requirement Engine ──────────────────────────────────────────────
// Single, centralized, FIT/GIT-aware source of truth for "how many rooms of
// each type does a set of bookings need". Before this file existed the same
// calculation was reimplemented independently (and subtly differently) in
// hotel.controller.ts, departure.controller.ts (twice), and once more
// client-side in the frontend — none of them accounted for Booking.tourType
// at all. Everything that needs a room count should call into this file.
//
// Per spec: GIT bookings for the same date+destination consolidate into one
// number (but must keep an expandable per-package breakdown — the
// underlying packages must never be lost). FIT bookings must NEVER be
// merged together — each stays its own separate entry, since different FIT
// travelers may end up in different hotels.

export const ROOM_CAPACITY: Record<string, number> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, QUAD: 4 };

export type RoomCounts = { SINGLE: number; DOUBLE: number; TRIPLE: number; QUAD: number; total: number };

export const emptyRoomCounts = (): RoomCounts => ({ SINGLE: 0, DOUBLE: 0, TRIPLE: 0, QUAD: 0, total: 0 });

export function addRoomCounts(a: RoomCounts, b: RoomCounts): RoomCounts {
  return {
    SINGLE: a.SINGLE + b.SINGLE,
    DOUBLE: a.DOUBLE + b.DOUBLE,
    TRIPLE: a.TRIPLE + b.TRIPLE,
    QUAD: a.QUAD + b.QUAD,
    total: a.total + b.total,
  };
}

export type RoomBookingInput = {
  numberOfTravelers: number;
  roomSharing: string;
  travelers?: { roomSharing: string | null }[];
};

// Rooms required for ONE booking. When individual traveler records exist
// (Traveler.roomSharing can override Booking.roomSharing per-traveler),
// tallies travelers per room type and rounds each type up to whole rooms
// independently, rather than treating the whole group as one uniform type.
// Falls back to the booking-level default when no traveler records exist
// yet (e.g. right after a booking is confirmed, before Ops fills them in).
export function roomsForBooking(b: RoomBookingInput): RoomCounts {
  const counts = emptyRoomCounts();

  const bump = (type: string, rooms: number) => {
    if (rooms <= 0) return;
    if (type in counts) (counts as unknown as Record<string, number>)[type] += rooms;
    else counts.DOUBLE += rooms; // unrecognized room type — same fallback bucket as the legacy implementations
    counts.total += rooms;
  };

  if (b.travelers && b.travelers.length > 0) {
    const perType: Record<string, number> = {};
    for (const t of b.travelers) {
      const type = t.roomSharing || b.roomSharing || 'DOUBLE';
      perType[type] = (perType[type] ?? 0) + 1;
    }
    for (const [type, count] of Object.entries(perType)) {
      bump(type, Math.ceil(count / (ROOM_CAPACITY[type] ?? 2)));
    }
  } else {
    const type = b.roomSharing || 'DOUBLE';
    bump(type, Math.ceil(b.numberOfTravelers / (ROOM_CAPACITY[type] ?? 2)));
  }

  return counts;
}

// Flat total across a whole list of bookings, ignoring FIT/GIT — for spots
// that only ever need one number (e.g. capping confirmed hotel rooms
// against what a single departure requires in total).
export function roomsForBookingList(bookings: RoomBookingInput[]): RoomCounts {
  return bookings.reduce((sum, b) => addRoomCounts(sum, roomsForBooking(b)), emptyRoomCounts());
}

export type GitSourceBreakdown = {
  packageId: string;
  packageName: string;
  bookingCount: number;
  rooms: RoomCounts;
};

export type FitGitBookingInput = RoomBookingInput & {
  id: string;
  tourType?: string | null;      // FIT | GIT — defaults to GIT, matching Booking.tourType's own default
  packageId?: string | null;
  packageName?: string | null;
};

export type FitGitRoomRequirement<T extends FitGitBookingInput> = {
  git: { rooms: RoomCounts; sourceBreakdown: GitSourceBreakdown[] };
  // One entry per FIT booking, carrying the original booking fields through
  // (bookingNumber/travelerName/etc, whatever the caller passed in) plus its
  // own room count — callers display these separately, never summed.
  fit: (T & { rooms: RoomCounts })[];
  combined: RoomCounts;
};

// The FIT/GIT-aware version: GIT bookings consolidate into one number (with
// a source-package breakdown so the underlying packages are never lost —
// an expandable view, not a hidden one); FIT bookings never merge together,
// one entry per booking, since they may end up in different hotels.
export function computeFitGitRoomRequirement<T extends FitGitBookingInput>(bookings: T[]): FitGitRoomRequirement<T> {
  let gitRooms = emptyRoomCounts();
  const gitByPackage = new Map<string, GitSourceBreakdown>();
  const fit: (T & { rooms: RoomCounts })[] = [];

  for (const b of bookings) {
    const rooms = roomsForBooking(b);
    if ((b.tourType ?? 'GIT') === 'FIT') {
      fit.push({ ...b, rooms });
      continue;
    }

    gitRooms = addRoomCounts(gitRooms, rooms);
    const pkgKey = b.packageId ?? '__no_package__';
    const existing = gitByPackage.get(pkgKey);
    if (existing) {
      existing.bookingCount += 1;
      existing.rooms = addRoomCounts(existing.rooms, rooms);
    } else {
      gitByPackage.set(pkgKey, {
        packageId: b.packageId ?? '',
        packageName: b.packageName ?? 'No Package',
        bookingCount: 1,
        rooms,
      });
    }
  }

  const combined = fit.reduce((sum, f) => addRoomCounts(sum, f.rooms), gitRooms);

  return {
    git: { rooms: gitRooms, sourceBreakdown: Array.from(gitByPackage.values()).sort((a, b) => b.rooms.total - a.rooms.total) },
    fit,
    combined,
  };
}
