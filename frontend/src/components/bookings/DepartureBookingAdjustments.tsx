import { formatCurrency } from '../../utils/helpers';
import { AdjustmentEditButton, AdjustableBooking } from './BookingAdjustments';

// Booking-wise discount and extra expense for one departure. Shown on the
// Operations overview; Finance and Admin use the same edit control elsewhere.
interface Props {
  departure: {
    status: string;
    bookings: (AdjustableBooking & {
      numberOfTravelers?: number;
      amountPaid?: number;
      lead?: { name: string } | null;
    })[];
  };
}

export default function DepartureBookingAdjustments({ departure }: Props) {
  if (departure.bookings.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800 text-sm">Booking discount & extra expense</h3>
        <p className="text-xs text-slate-400">Net = price − discount. Extra expense is the trip cost for that booking.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <th className="text-left px-4 py-2">Booking</th>
              <th className="text-right px-4 py-2">Price</th>
              <th className="text-right px-4 py-2">Discount</th>
              <th className="text-right px-4 py-2">Extra expense</th>
              <th className="text-right px-4 py-2">Net</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {departure.bookings.map((b) => {
              const discount = b.discountAmount ?? 0;
              const extra = b.extraExpenseAmount ?? 0;
              return (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{b.lead?.name ?? 'Booking'}</td>
                  <td className="px-4 py-2 text-right tabular">{formatCurrency(b.finalPrice)}</td>
                  <td className="px-4 py-2 text-right tabular text-emerald-600">{discount > 0 ? `−${formatCurrency(discount)}` : '—'}</td>
                  <td className="px-4 py-2 text-right tabular text-orange-600">{extra > 0 ? `+${formatCurrency(extra)}` : '—'}</td>
                  <td className="px-4 py-2 text-right tabular font-semibold">{formatCurrency(b.finalPrice - discount)}</td>
                  <td className="px-4 py-2 text-right">
                    <AdjustmentEditButton booking={{ ...b, departure: { status: departure.status } }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
