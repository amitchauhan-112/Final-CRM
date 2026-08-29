import { Router } from 'express';
import { authenticate, requireFinanceOrAdmin } from '../middleware/auth.js';
import { createUpload } from '../middleware/upload.js';
const uploadVendorPaymentProof = createUpload('vendor-payment-proofs');
const uploadExpenseBill = createUpload('expense-bills');
import { getDashboardStats } from '../controllers/financeDashboard.controller.js';
import { listPaymentsForVerification, approvePayment, rejectPayment, requestCorrection } from '../controllers/payment.controller.js';
import { getCustomerLedger, getPendingTracker } from '../controllers/ledger.controller.js';
import { listRefunds, createRefund, approveRefund, markRefundPaid, rejectRefund } from '../controllers/refund.controller.js';
import {
  listVendorPayments, createVendorPayment, updateVendorPayment, deleteVendorPayment, uploadVendorPaymentFile, getVendorLedger,
} from '../controllers/vendorPayment.controller.js';
import { listVendors } from '../controllers/vendor.controller.js';
import { listDepartures } from '../controllers/departure.controller.js';
import { getPackages } from '../controllers/packages.controller.js';
import {
  listExpenses, createExpense, approveExpense, rejectExpense, deleteExpense,
} from '../controllers/expense.controller.js';
import { getPaymentSchedule, updateScheduleItem } from '../controllers/paymentSchedule.controller.js';
import { createFinanceDocument, listFinanceDocuments } from '../controllers/financeDocument.controller.js';
import {
  getCollectionReport, getEmployeeCollectionReport, getDestinationRevenueReport, getDepartureRevenueReport,
  getOutstandingReport, getVendorPaymentReport, getRefundReport, getExpenseReport, getProfitLossReport,
  getTripProfitabilityReport, getPackageProfitabilityReport,
} from '../controllers/financeReport.controller.js';

const router = Router();
router.use(authenticate, requireFinanceOrAdmin);

// Dashboard
router.get('/dashboard', getDashboardStats);

// Payment verification
router.get('/payments', listPaymentsForVerification);
router.put('/payments/:id/approve', approvePayment);
router.put('/payments/:id/reject', rejectPayment);
router.put('/payments/:id/request-correction', requestCorrection);

// Customer ledger + pending tracker
router.get('/ledger/:bookingId', getCustomerLedger);
router.get('/pending-tracker', getPendingTracker);

// Payment schedule (installment plan)
router.get('/bookings/:bookingId/schedule', getPaymentSchedule);
router.put('/schedule/:itemId', updateScheduleItem);

// Finance documents (invoices/receipts/credit notes/debit notes/refund vouchers)
router.get('/documents', listFinanceDocuments);
router.post('/documents', createFinanceDocument);

// Refunds
router.get('/refunds', listRefunds);
router.post('/refunds', createRefund);
router.put('/refunds/:id/approve', approveRefund);
router.put('/refunds/:id/mark-paid', markRefundPaid);
router.put('/refunds/:id/reject', rejectRefund);

// Read-only access to the Vendor master list (owned/managed by Operations) —
// Finance needs it to select which vendor a bill belongs to.
router.get('/vendors', listVendors);

// Vendor payments
router.get('/vendors/:id/ledger', getVendorLedger);
router.get('/vendor-payments', listVendorPayments);
router.post('/vendor-payments', createVendorPayment);
router.put('/vendor-payments/:id', updateVendorPayment);
router.delete('/vendor-payments/:id', deleteVendorPayment);
router.post('/vendor-payments/:id/upload', uploadVendorPaymentProof.single('file'), uploadVendorPaymentFile);

// Read-only access to Departures/Packages (owned by Operations/Sales) — Finance
// needs them to tag an expense to a trip/package.
router.get('/departures', listDepartures);
router.get('/packages', getPackages);

// Expenses
router.get('/expenses', listExpenses);
router.post('/expenses', uploadExpenseBill.single('bill'), createExpense);
router.put('/expenses/:id/approve', approveExpense);
router.put('/expenses/:id/reject', rejectExpense);
router.delete('/expenses/:id', deleteExpense);

// Reports
router.get('/reports/collections', getCollectionReport);
router.get('/reports/employee-collections', getEmployeeCollectionReport);
router.get('/reports/destination-revenue', getDestinationRevenueReport);
router.get('/reports/departure-revenue', getDepartureRevenueReport);
router.get('/reports/outstanding', getOutstandingReport);
router.get('/reports/vendor-payments', getVendorPaymentReport);
router.get('/reports/refunds', getRefundReport);
router.get('/reports/expenses', getExpenseReport);
router.get('/reports/trip-profitability', getTripProfitabilityReport);
router.get('/reports/package-profitability', getPackageProfitabilityReport);
router.get('/reports/profit-loss', getProfitLossReport);

export default router;
