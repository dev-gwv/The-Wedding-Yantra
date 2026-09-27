-- Services and packages for every kind of wedding business, not just planners.
--   * Services get a category from the business's own list, seeded by trade (a makeup artist
--     groups by Bridal / Party and family / Hair and draping; a caterer by Menus / Live counters).
--   * More ways to charge: per look, per session, per song, per kg, per sq ft.
--   * Packages: a name, one price (per event, or per plate / person for food and bar), and what's
--     included: services from the price list with quantities, or plain lines ("3 starters").
--   * Designations and vendor categories also get each trade's own.

ALTER TABLE custom_options DROP CONSTRAINT IF EXISTS custom_options_list_check;
ALTER TABLE custom_options ADD CONSTRAINT custom_options_list_check
  CHECK (list IN ('payment_method', 'expense_category', 'task_tag', 'relation', 'vendor_category', 'designation', 'venue_type', 'service_category'));

-- Each business's own trade lists (skipping any name it already has).
INSERT INTO custom_options (workspace_id, list, key, label, position)
SELECT w.id, t.list, t.key, t.label, t.position
  FROM workspaces w
  JOIN (VALUES
   ('makeup_artist', 'service_category', 'bridal', 'Bridal', 0),
   ('makeup_artist', 'service_category', 'party', 'Party and family', 1),
   ('makeup_artist', 'service_category', 'hair', 'Hair and draping', 2),
   ('makeup_artist', 'service_category', 'addons', 'Add-ons and travel', 3),
   ('makeup_artist', 'designation', 't_hair_stylist', 'Hair stylist', -10),
   ('makeup_artist', 'designation', 't_draper', 'Draper', -9),
   ('makeup_artist', 'designation', 't_assistant_artist', 'Assistant artist', -8),
   ('makeup_artist', 'vendor_category', 't_product_supplier', 'Product supplier', -10),
   ('makeup_artist', 'vendor_category', 't_hair_accessories', 'Hair accessories', -9),
   ('makeup_artist', 'vendor_category', 't_freelance_artist', 'Freelance artist', -8),
   ('mehendi_artist', 'service_category', 'bridal', 'Bridal mehendi', 0),
   ('mehendi_artist', 'service_category', 'guest', 'Guest mehendi', 1),
   ('mehendi_artist', 'service_category', 'addons', 'Add-ons', 2),
   ('mehendi_artist', 'designation', 't_mehendi_artist', 'Mehendi artist', -10),
   ('mehendi_artist', 'designation', 't_assistant_artist', 'Assistant artist', -9),
   ('mehendi_artist', 'vendor_category', 't_henna_supplier', 'Henna supplier', -10),
   ('mehendi_artist', 'vendor_category', 't_freelance_artist', 'Freelance artist', -9),
   ('wedding_planner', 'service_category', 'planning', 'Planning', 0),
   ('wedding_planner', 'service_category', 'coordination', 'Coordination', 1),
   ('wedding_planner', 'service_category', 'hospitality', 'Hospitality and logistics', 2),
   ('wedding_planner', 'service_category', 'destination', 'Destination weddings', 3),
   ('wedding_planner', 'designation', 't_wedding_planner', 'Wedding planner', -10),
   ('wedding_planner', 'designation', 't_hospitality_executive', 'Hospitality executive', -9),
   ('wedding_planner', 'designation', 't_logistics_coordinator', 'Logistics coordinator', -8),
   ('wedding_planner', 'vendor_category', 't_hotel_and_stay', 'Hotel and stay', -10),
   ('wedding_planner', 'vendor_category', 't_invitations', 'Invitations', -9),
   ('wedding_planner', 'vendor_category', 't_artists_and_performers', 'Artists and performers', -8),
   ('decorator', 'service_category', 'mandap', 'Mandap and stage', 0),
   ('decorator', 'service_category', 'entrance', 'Entrance and pathway', 1),
   ('decorator', 'service_category', 'floral', 'Floral', 2),
   ('decorator', 'service_category', 'functions', 'Haldi and mehendi setups', 3),
   ('decorator', 'service_category', 'rentals', 'Props and rentals', 4),
   ('decorator', 'designation', 't_decor_designer', 'Decor designer', -10),
   ('decorator', 'designation', 't_florist', 'Florist', -9),
   ('decorator', 'designation', 't_site_supervisor', 'Site supervisor', -8),
   ('decorator', 'designation', 't_labour', 'Labour', -7),
   ('decorator', 'vendor_category', 't_flower_supplier', 'Flower supplier', -10),
   ('decorator', 'vendor_category', 't_tent_house', 'Tent house', -9),
   ('decorator', 'vendor_category', 't_fabric_and_props', 'Fabric and props', -8),
   ('decorator', 'vendor_category', 't_labour_contractor', 'Labour contractor', -7),
   ('event_decorator', 'service_category', 'balloons', 'Balloon decor', 0),
   ('event_decorator', 'service_category', 'themes', 'Theme setups', 1),
   ('event_decorator', 'service_category', 'props', 'Backdrops and props', 2),
   ('event_decorator', 'designation', 't_decor_designer', 'Decor designer', -10),
   ('event_decorator', 'designation', 't_helper', 'Helper', -9),
   ('event_decorator', 'vendor_category', 't_balloon_supplier', 'Balloon supplier', -10),
   ('event_decorator', 'vendor_category', 't_props_rental', 'Props rental', -9),
   ('event_decorator', 'vendor_category', 't_cake_and_bakery', 'Cake and bakery', -8),
   ('photographer', 'service_category', 'photo', 'Photography', 0),
   ('photographer', 'service_category', 'film', 'Films', 1),
   ('photographer', 'service_category', 'prewedding', 'Pre-wedding', 2),
   ('photographer', 'service_category', 'albums', 'Albums and prints', 3),
   ('photographer', 'service_category', 'addons', 'Add-ons', 4),
   ('photographer', 'designation', 't_second_shooter', 'Second shooter', -10),
   ('photographer', 'designation', 't_drone_operator', 'Drone operator', -9),
   ('photographer', 'designation', 't_cinematographer', 'Cinematographer', -8),
   ('photographer', 'vendor_category', 't_album_printer', 'Album printer', -10),
   ('photographer', 'vendor_category', 't_equipment_rental', 'Equipment rental', -9),
   ('photographer', 'vendor_category', 't_freelance_photographer', 'Freelance photographer', -8),
   ('content_creator', 'service_category', 'reels', 'Reels', 0),
   ('content_creator', 'service_category', 'coverage', 'Coverage', 1),
   ('content_creator', 'service_category', 'addons', 'Add-ons', 2),
   ('content_creator', 'designation', 't_content_creator', 'Content creator', -10),
   ('content_creator', 'designation', 't_reel_editor', 'Reel editor', -9),
   ('content_creator', 'vendor_category', 't_equipment_rental', 'Equipment rental', -10),
   ('content_creator', 'vendor_category', 't_music_licences', 'Music licences', -9),
   ('sound_lighting', 'service_category', 'sound', 'Sound and DJ', 0),
   ('sound_lighting', 'service_category', 'lighting', 'Lighting', 1),
   ('sound_lighting', 'service_category', 'screens', 'LED and screens', 2),
   ('sound_lighting', 'service_category', 'power', 'Power backup', 3),
   ('sound_lighting', 'designation', 't_dj', 'DJ', -10),
   ('sound_lighting', 'designation', 't_sound_engineer', 'Sound engineer', -9),
   ('sound_lighting', 'designation', 't_lighting_technician', 'Lighting technician', -8),
   ('sound_lighting', 'vendor_category', 't_equipment_rental', 'Equipment rental', -10),
   ('sound_lighting', 'vendor_category', 't_generator', 'Generator', -9),
   ('sound_lighting', 'vendor_category', 't_truss_and_staging', 'Truss and staging', -8),
   ('bar_services', 'service_category', 'bar', 'Bar setups', 0),
   ('bar_services', 'service_category', 'counters', 'Counters', 1),
   ('bar_services', 'service_category', 'staff', 'Bar staff', 2),
   ('bar_services', 'designation', 't_bartender', 'Bartender', -10),
   ('bar_services', 'designation', 't_bar_manager', 'Bar manager', -9),
   ('bar_services', 'vendor_category', 't_beverage_supplier', 'Beverage supplier', -10),
   ('bar_services', 'vendor_category', 't_ice_supplier', 'Ice supplier', -9),
   ('bar_services', 'vendor_category', 't_glassware_rental', 'Glassware rental', -8),
   ('caterer', 'service_category', 'menus', 'Menus', 0),
   ('caterer', 'service_category', 'counters', 'Live counters', 1),
   ('caterer', 'service_category', 'meals', 'Breakfast and hi-tea', 2),
   ('caterer', 'service_category', 'staff', 'Service staff', 3),
   ('caterer', 'designation', 't_head_chef', 'Head chef', -10),
   ('caterer', 'designation', 't_captain', 'Captain', -9),
   ('caterer', 'designation', 't_waiter', 'Waiter', -8),
   ('caterer', 'vendor_category', 't_grocery_supplier', 'Grocery supplier', -10),
   ('caterer', 'vendor_category', 't_gas_supplier', 'Gas supplier', -9),
   ('caterer', 'vendor_category', 't_crockery_rental', 'Crockery rental', -8),
   ('gifting', 'service_category', 'favours', 'Guest favours', 0),
   ('gifting', 'service_category', 'hampers', 'Hampers', 1),
   ('gifting', 'service_category', 'trousseau', 'Trousseau packing', 2),
   ('gifting', 'service_category', 'packaging', 'Packaging', 3),
   ('gifting', 'designation', 't_packer', 'Packer', -10),
   ('gifting', 'designation', 't_delivery', 'Delivery', -9),
   ('gifting', 'vendor_category', 't_packaging_supplier', 'Packaging supplier', -10),
   ('gifting', 'vendor_category', 't_courier', 'Courier', -9),
   ('choreographer', 'service_category', 'sangeet', 'Sangeet', 0),
   ('choreographer', 'service_category', 'couple', 'Couple dance', 1),
   ('choreographer', 'service_category', 'practice', 'Practice sessions', 2),
   ('choreographer', 'designation', 't_choreographer', 'Choreographer', -10),
   ('choreographer', 'designation', 't_assistant_choreographer', 'Assistant choreographer', -9),
   ('choreographer', 'vendor_category', 't_studio_rent', 'Studio rent', -10),
   ('choreographer', 'vendor_category', 't_costumes', 'Costumes', -9),
   ('fireworks', 'service_category', 'entry', 'Entry effects', 0),
   ('fireworks', 'service_category', 'shows', 'Fireworks shows', 1),
   ('fireworks', 'service_category', 'effects', 'Smoke and CO2', 2),
   ('fireworks', 'designation', 't_pyro_technician', 'Pyro technician', -10),
   ('fireworks', 'vendor_category', 't_fireworks_stock', 'Fireworks stock', -10),
   ('fireworks', 'vendor_category', 't_permits', 'Permits', -9)
  ) AS t (trade, list, key, label, position) ON t.trade = w.business_type_id
ON CONFLICT DO NOTHING;

-- A trade with nothing of its own gets two plain service categories.
INSERT INTO custom_options (workspace_id, list, key, label, position)
SELECT w.id, 'service_category', g.key, g.label, g.position
  FROM workspaces w
 CROSS JOIN (VALUES ('main', 'Main services', 0), ('addons', 'Add-ons', 1)) AS g (key, label, position)
 WHERE NOT EXISTS (SELECT 1 FROM custom_options o WHERE o.workspace_id = w.id AND o.list = 'service_category')
ON CONFLICT DO NOTHING;

ALTER TABLE catalogue_items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE catalogue_items DROP CONSTRAINT IF EXISTS catalogue_items_unit_check;
ALTER TABLE catalogue_items ADD CONSTRAINT catalogue_items_unit_check
  CHECK (unit IN ('event', 'day', 'hour', 'plate', 'piece', 'set', 'person', 'look', 'session', 'song', 'kg', 'sqft'));

-- The starter services still named as they came get their trade's category.
UPDATE catalogue_items ci SET category = m.key
  FROM workspaces w
  JOIN (VALUES
   ('makeup_artist', 'Bridal HD makeup', 'bridal'),
   ('makeup_artist', 'Airbrush bridal makeup', 'bridal'),
   ('makeup_artist', 'Engagement / reception makeup', 'bridal'),
   ('makeup_artist', 'Family & guest makeup', 'party'),
   ('makeup_artist', 'Hair styling', 'hair'),
   ('makeup_artist', 'Saree / dupatta draping', 'hair'),
   ('mehendi_artist', 'Bridal mehendi (full hands & feet)', 'bridal'),
   ('mehendi_artist', 'Guest mehendi', 'guest'),
   ('mehendi_artist', 'Groom mehendi', 'bridal'),
   ('mehendi_artist', 'Artist per hour', 'addons'),
   ('wedding_planner', 'Full wedding planning', 'planning'),
   ('wedding_planner', 'Day-of coordination', 'coordination'),
   ('wedding_planner', 'Destination wedding management', 'destination'),
   ('wedding_planner', 'Vendor sourcing only', 'planning'),
   ('wedding_planner', 'Guest hospitality desk', 'hospitality'),
   ('decorator', 'Mandap decor', 'mandap'),
   ('decorator', 'Stage decor', 'mandap'),
   ('decorator', 'Entrance and pathway', 'entrance'),
   ('decorator', 'Floral centrepieces', 'floral'),
   ('decorator', 'Haldi / mehendi setup', 'functions'),
   ('event_decorator', 'Balloon decor package', 'balloons'),
   ('event_decorator', 'Theme birthday setup', 'themes'),
   ('event_decorator', 'Backdrop and props', 'props'),
   ('event_decorator', 'Table decor', 'props'),
   ('photographer', 'Wedding photography', 'photo'),
   ('photographer', 'Cinematic wedding film', 'film'),
   ('photographer', 'Pre-wedding shoot', 'prewedding'),
   ('photographer', 'Candid photographer', 'photo'),
   ('photographer', 'Photo album (40 pages)', 'albums'),
   ('photographer', 'Drone coverage', 'addons'),
   ('content_creator', 'Same-day reels package', 'reels'),
   ('content_creator', 'Full wedding content coverage', 'coverage'),
   ('content_creator', 'Behind-the-scenes stories', 'coverage'),
   ('content_creator', 'Extra reel', 'addons'),
   ('sound_lighting', 'DJ with sound (up to 300 guests)', 'sound'),
   ('sound_lighting', 'Line array sound system', 'sound'),
   ('sound_lighting', 'Stage and venue lighting', 'lighting'),
   ('sound_lighting', 'LED wall', 'screens'),
   ('sound_lighting', 'Generator backup', 'power'),
   ('bar_services', 'Bartender', 'staff'),
   ('bar_services', 'Mocktail counter', 'counters'),
   ('bar_services', 'Cocktail bar setup', 'bar'),
   ('bar_services', 'Glassware and bar setup', 'bar'),
   ('caterer', 'Veg buffet', 'menus'),
   ('caterer', 'Non-veg buffet', 'menus'),
   ('caterer', 'Live counters', 'counters'),
   ('caterer', 'Breakfast / hi-tea', 'meals'),
   ('caterer', 'Service staff', 'staff'),
   ('gifting', 'Guest favour', 'favours'),
   ('gifting', 'Premium hamper', 'hampers'),
   ('gifting', 'Trousseau packing', 'trousseau'),
   ('gifting', 'Custom packaging', 'packaging'),
   ('choreographer', 'Sangeet choreography package', 'sangeet'),
   ('choreographer', 'Couple dance', 'couple'),
   ('choreographer', 'Family dance (per song)', 'sangeet'),
   ('choreographer', 'Practice session', 'practice'),
   ('fireworks', 'Cold pyro (per piece)', 'entry'),
   ('fireworks', 'Couple entry effects', 'entry'),
   ('fireworks', 'Fireworks show', 'shows'),
   ('fireworks', 'Smoke / CO2 effects', 'effects')
  ) AS m (trade, name, key) ON m.trade = w.business_type_id
 WHERE ci.workspace_id = w.id AND ci.category IS NULL AND ci.name = m.name;

CREATE TABLE IF NOT EXISTS service_packages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  unit          TEXT NOT NULL DEFAULT 'event'
                CHECK (unit IN ('event', 'day', 'hour', 'plate', 'piece', 'set', 'person', 'look', 'session', 'song', 'kg', 'sqft')),
  price         NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  tax_rate      NUMERIC(5, 2) NOT NULL DEFAULT 0,
  sac           TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  position      INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_packages_workspace_idx ON service_packages (workspace_id, position);
DROP TRIGGER IF EXISTS service_packages_updated_at ON service_packages;
CREATE TRIGGER service_packages_updated_at BEFORE UPDATE ON service_packages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- What a package includes: a service from the price list (with how many), or a plain line.
CREATE TABLE IF NOT EXISTS service_package_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id         UUID NOT NULL REFERENCES service_packages (id) ON DELETE CASCADE,
  workspace_id       UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  catalogue_item_id  UUID REFERENCES catalogue_items (id),
  text               TEXT,
  quantity           NUMERIC(10, 2) CHECK (quantity IS NULL OR quantity > 0),
  position           INTEGER NOT NULL DEFAULT 0,
  CHECK (catalogue_item_id IS NOT NULL OR text IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS service_package_items_package_idx ON service_package_items (package_id, position);
