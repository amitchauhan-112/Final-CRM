// Public, unauthenticated page — required by Meta before the "FOD Holidays CRM"
// developer app can be published/go Live (Publish flow requires a reachable
// Privacy Policy URL). Describes how this CRM handles data received through
// the Meta integrations it uses (WhatsApp Business Platform, Instagram/Meta
// Lead Ads). Not gated behind RequireAuth — Meta's reviewer/crawler has no
// login.
export default function PrivacyPolicyPage() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1f2937', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: '#6b7280', marginBottom: 32 }}>FOD Holidays CRM &middot; Last updated September 2026</p>

      <p>
        This Privacy Policy explains how FOD Holidays ("we", "us", "our") collects, uses, and protects
        information within our internal Customer Relationship Management system ("the CRM"), including
        information received through our integrations with Meta Platforms, Inc. ("Meta") products such
        as the WhatsApp Business Platform, Instagram, and Meta Ads.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Information We Collect</h2>
      <p>When a customer contacts us or interacts with our ads, we may collect:</p>
      <ul>
        <li>Name and phone number provided directly by the customer, or associated with their WhatsApp/Instagram account.</li>
        <li>Message content sent to our WhatsApp Business number(s), for the purpose of responding to travel inquiries.</li>
        <li>Ad-attribution data (which advertisement or campaign a conversation originated from), when a customer starts a conversation by clicking on one of our ads.</li>
        <li>Booking, travel preference, and communication history a customer shares with our team while planning or managing a trip.</li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>How We Use This Information</h2>
      <p>Information collected is used solely for legitimate business purposes, including:</p>
      <ul>
        <li>Responding to travel inquiries and providing customer support.</li>
        <li>Managing bookings, itineraries, and payments for confirmed travel packages.</li>
        <li>Assigning inquiries to the appropriate member of our sales/operations team.</li>
        <li>Understanding which marketing campaigns are effective, so we can improve our advertising.</li>
      </ul>
      <p>We do not sell customer data to third parties.</p>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>How We Store and Protect Information</h2>
      <p>
        Data is stored in a secured, access-controlled database used exclusively by FOD Holidays staff.
        Access is limited to employees who need it to do their jobs. Sensitive credentials (such as API
        access tokens used to connect to Meta's services) are stored encrypted.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Sharing of Information</h2>
      <p>
        We do not share customer information with third parties except: (a) Meta Platforms, Inc., to the
        extent necessary to send and receive WhatsApp messages and process ad-attribution data through
        their platform, and (b) service providers (such as hotels, transport operators, or vendors)
        directly involved in fulfilling a customer's confirmed booking.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Your Choices</h2>
      <p>
        Customers may request that we delete their information, correct inaccurate details, or stop
        contacting them at any time by messaging us directly or emailing us at the address below.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 32 }}>Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy or how your information is handled, contact us at{' '}
        <a href="mailto:amitfodholidays@gmail.com">amitfodholidays@gmail.com</a>.
      </p>
    </div>
  );
}
