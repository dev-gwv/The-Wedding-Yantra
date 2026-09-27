-- The wedding date on the client, typed in. When it's empty, the client shows the date of
-- their event instead.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS wedding_date DATE;

-- From the enquiry they were booked from, where it had a date.
UPDATE clients c SET wedding_date = l.event_date
  FROM (SELECT DISTINCT ON (client_id) client_id, event_date FROM leads
         WHERE client_id IS NOT NULL AND deleted_at IS NULL AND event_date IS NOT NULL
         ORDER BY client_id, created_at) l
 WHERE l.client_id = c.id AND c.wedding_date IS NULL;
