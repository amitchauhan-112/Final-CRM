import WhatsAppInboxView from '../../components/whatsapp/WhatsAppInboxView';

export default function EmployeeWhatsAppInboxPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">WhatsApp</h2>
        <p className="text-sm text-slate-500 mt-0.5">Your conversations with leads</p>
      </div>
      <WhatsAppInboxView />
    </div>
  );
}
