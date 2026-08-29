-- Undoes bookings + all downstream operational/financial records created
-- from a specific test campaign's leads, WITHOUT touching the leads
-- themselves (they revert to status NEW if a test booking had confirmed
-- them) or anything belonging to real campaigns/leads/bookings.
--
-- Usage: psql ... -v campaign_id="'<uuid>'" -f undo-test-campaign.sql
-- (the quotes around the uuid in -v are required by psql's :variable syntax)

BEGIN;

CREATE TEMP TABLE _test_leads AS
  SELECT id FROM leads WHERE "campaignId" = :campaign_id;

CREATE TEMP TABLE _test_bookings AS
  SELECT id, "departureId" FROM bookings WHERE "leadId" IN (SELECT id FROM _test_leads);

CREATE TEMP TABLE _test_departures AS
  SELECT DISTINCT "departureId" AS id FROM _test_bookings WHERE "departureId" IS NOT NULL;

CREATE TEMP TABLE _booked_lead_ids AS
  SELECT DISTINCT b."leadId" FROM bookings b WHERE b.id IN (SELECT id FROM _test_bookings);

-- Explicit child deletes first (defense in depth — most of these already
-- cascade automatically when the parent booking/departure row is deleted,
-- but deleting them explicitly keeps the operation transparent and
-- independent of whatever the current FK actions happen to be).
DELETE FROM payments WHERE "bookingId" IN (SELECT id FROM _test_bookings);
DELETE FROM payment_schedule_items WHERE "bookingId" IN (SELECT id FROM _test_bookings);
DELETE FROM booking_tasks WHERE "bookingId" IN (SELECT id FROM _test_bookings);
DELETE FROM finance_documents WHERE "bookingId" IN (SELECT id FROM _test_bookings);
DELETE FROM refunds WHERE "bookingId" IN (SELECT id FROM _test_bookings);
DELETE FROM travelers WHERE "bookingId" IN (SELECT id FROM _test_bookings);

DELETE FROM operations_hotels WHERE "departureId" IN (SELECT id FROM _test_departures);
DELETE FROM operations_vehicles WHERE "departureId" IN (SELECT id FROM _test_departures);
DELETE FROM operations_documents WHERE "departureId" IN (SELECT id FROM _test_departures);
DELETE FROM operations_notes WHERE "departureId" IN (SELECT id FROM _test_departures);
DELETE FROM departure_tasks WHERE "departureId" IN (SELECT id FROM _test_departures);
DELETE FROM vendor_payments WHERE "departureId" IN (SELECT id FROM _test_departures);
DELETE FROM expenses WHERE "departureId" IN (SELECT id FROM _test_departures);

DELETE FROM notifications
  WHERE "departureId" IN (SELECT id FROM _test_departures)
     OR "leadId" IN (SELECT id FROM _test_leads);
DELETE FROM activity_logs WHERE "leadId" IN (SELECT id FROM _test_leads);

-- Parents
DELETE FROM bookings WHERE id IN (SELECT id FROM _test_bookings);
DELETE FROM departures WHERE id IN (SELECT id FROM _test_departures);

-- Revert only the leads that actually had a test booking — every other
-- lead in the campaign (unbooked, or in any other status from unrelated
-- testing) is left completely untouched.
UPDATE leads SET status = 'NEW'
  WHERE id IN (SELECT "leadId" FROM _booked_lead_ids);

COMMIT;
