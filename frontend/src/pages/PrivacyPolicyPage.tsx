import { Mountain } from 'lucide-react';

// Public, unauthenticated page — required by Meta before the "FOD Holidays CRM"
// developer app can be published/go Live (Publish flow requires a reachable
// Privacy Policy URL). Describes how this CRM handles data received through
// the Meta integrations it uses (WhatsApp Business Platform, Instagram/Meta
// Lead Ads). Not gated behind RequireAuth — Meta's reviewer/crawler has no
// login.
export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-mountain-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Mountain className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm">Travel CRM</p>
            <p className="text-xs text-slate-500">Trek & Pilgrimage</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="card p-8 space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-slate-400 mt-1">FOD Holidays CRM · Last updated September 2026</p>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            This Privacy Policy explains how FOD Holidays ("we", "us", "our") collects, uses, and protects
            information within our internal Customer Relationship Management system ("the CRM"), including
            information received through our integrations with Meta Platforms, Inc. ("Meta") products such
            as the WhatsApp Business Platform, Instagram, and Meta Ads.
          </p>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">Information We Collect</h2>
            <p className="text-sm text-slate-600">When a customer contacts us or interacts with our ads, we may collect:</p>
            <ul className="text-sm text-slate-600 space-y-1.5 list-disc pl-5">
              <li>Name and phone number provided directly by the customer, or associated with their WhatsApp/Instagram account.</li>
              <li>Message content sent to our WhatsApp Business number(s), for the purpose of responding to travel inquiries.</li>
              <li>Ad-attribution data (which advertisement or campaign a conversation originated from), when a customer starts a conversation by clicking on one of our ads.</li>
              <li>Booking, travel preference, and communication history a customer shares with our team while planning or managing a trip.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">How We Use This Information</h2>
            <p className="text-sm text-slate-600">Information collected is used solely for legitimate business purposes, including:</p>
            <ul className="text-sm text-slate-600 space-y-1.5 list-disc pl-5">
              <li>Responding to travel inquiries and providing customer support.</li>
              <li>Managing bookings, itineraries, and payments for confirmed travel packages.</li>
              <li>Assigning inquiries to the appropriate member of our sales/operations team.</li>
              <li>Understanding which marketing campaigns are effective, so we can improve our advertising.</li>
            </ul>
            <p className="text-sm text-slate-600">We do not sell customer data to third parties.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">How We Store and Protect Information</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Data is stored in a secured, access-controlled database used exclusively by FOD Holidays staff.
              Access is limited to employees who need it to do their jobs. Sensitive credentials (such as API
              access tokens used to connect to Meta's services) are stored encrypted.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">Sharing of Information</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              We do not share customer information with third parties except: (a) Meta Platforms, Inc., to the
              extent necessary to send and receive WhatsApp messages and process ad-attribution data through
              their platform, and (b) service providers (such as hotels, transport operators, or vendors)
              directly involved in fulfilling a customer's confirmed booking.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">Your Choices</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Customers may request that we delete their information, correct inaccurate details, or stop
              contacting them at any time by messaging us directly or emailing us at the address below.
            </p>
          </section>

          <section className="space-y-2 border-t border-slate-100 pt-6">
            <h2 className="text-base font-semibold text-slate-900">Contact Us</h2>
            <p className="text-sm text-slate-600">
              If you have questions about this Privacy Policy or how your information is handled, contact us at{' '}
              <a href="mailto:amitfodholidays@gmail.com" className="text-primary-600 hover:text-primary-700 font-medium">amitfodholidays@gmail.com</a>.
            </p>
          </section>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Travel CRM &copy; {new Date().getFullYear()} · Trek & Pilgrimage
        </p>
      </div>
    </div>
  );
}
