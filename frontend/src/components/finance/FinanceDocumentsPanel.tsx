import { useState } from 'react';
import { FileText, Download, Plus } from 'lucide-react';
import { useFinanceDocuments, useGenerateFinanceDocument } from '../../hooks/useFinance';
import Modal from '../ui/Modal';
import { FinanceDocumentType } from '../../types/index';
import { formatCurrency, formatDate, blockDecimalKey } from '../../utils/helpers';

const TYPE_LABEL: Record<FinanceDocumentType, string> = {
  TAX_INVOICE: 'Tax Invoice', RECEIPT: 'Receipt', CREDIT_NOTE: 'Credit Note',
  DEBIT_NOTE: 'Debit Note', REFUND_VOUCHER: 'Refund Voucher',
};

function IssueNoteModal({ type, bookingId, onClose }: { type: 'CREDIT_NOTE' | 'DEBIT_NOTE' | null; bookingId: string; onClose: () => void }) {
  const generate = useGenerateFinanceDocument();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  if (!type) return null;
  return (
    <Modal
      open={!!type} onClose={onClose} title={`Issue ${TYPE_LABEL[type]}`} size="sm"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={() => generate.mutate({ type, bookingId, amount: Number(amount), reason }, { onSuccess: () => { onClose(); setAmount(''); setReason(''); } })}
          disabled={generate.isPending || !amount || !reason.trim()} className="btn-primary"
        >{generate.isPending ? 'Generating…' : 'Generate'}</button>
      </>}
    >
      <div className="space-y-3">
        <div>
          <label className="label">Amount *</label>
          <input type="number" step="1" onKeyDown={blockDecimalKey} value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Reason *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="input" />
        </div>
      </div>
    </Modal>
  );
}

export default function FinanceDocumentsPanel({ bookingId }: { bookingId: string }) {
  const { data } = useFinanceDocuments(bookingId);
  const documents = data?.data ?? [];
  const generateInvoice = useGenerateFinanceDocument();
  const [noteType, setNoteType] = useState<'CREDIT_NOTE' | 'DEBIT_NOTE' | null>(null);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-slate-700">Documents</p>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => generateInvoice.mutate({ type: 'TAX_INVOICE', bookingId })} disabled={generateInvoice.isPending} className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
            <Plus className="w-3 h-3" />Tax Invoice
          </button>
          <button onClick={() => setNoteType('CREDIT_NOTE')} className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
            <Plus className="w-3 h-3" />Credit Note
          </button>
          <button onClick={() => setNoteType('DEBIT_NOTE')} className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
            <Plus className="w-3 h-3" />Debit Note
          </button>
        </div>
      </div>

      {documents.length === 0 ? (
        <p className="text-xs text-slate-400">No documents generated yet</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-slate-700 truncate">{TYPE_LABEL[d.type]} · {d.documentNumber}</p>
                  <p className="text-xs text-slate-400">{formatDate(d.generatedAt)} · {formatCurrency(d.amount)}</p>
                </div>
              </div>
              {d.pdfUrl && (
                <a href={d.pdfUrl.startsWith('/') ? `${window.location.origin}${d.pdfUrl}` : d.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 flex-shrink-0">
                  <Download className="w-3 h-3" />PDF
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <IssueNoteModal type={noteType} bookingId={bookingId} onClose={() => setNoteType(null)} />
    </div>
  );
}
