/**
 * What each kind of wedding business starts with, beyond the lists every business gets:
 * how it groups its services, who works for it, who it buys from, and example packages.
 * Everything here is a starting point the business edits. Keys are fixed so installing
 * twice never adds a second copy.
 */
import type { OptionSeed } from "./lists.js";

export interface PackageSeed {
  name: string;
  description: string;
  /** How the package is charged: per event for most, per plate or per person for food and bar */
  unit: "event" | "day" | "plate" | "person" | "piece";
  price: number;
  /** A starter service by name, with how many; or a plain line of what's included */
  items: ({ service: string; quantity: number } | { text: string })[];
}

export interface TradeSeed {
  /** How its price list is grouped */
  serviceCategories: OptionSeed[];
  /** Which category each starter service goes in, by service name */
  serviceCategoryOf: Record<string, string>;
  /** Added to the everyday designations */
  designations: OptionSeed[];
  /** Added to the everyday vendor categories */
  vendorCategories: OptionSeed[];
  packages: PackageSeed[];
}

/** For a business whose trade has nothing of its own. */
export const GENERAL_SERVICE_CATEGORIES: OptionSeed[] = [
  { key: "main", label: "Main services" },
  { key: "addons", label: "Add-ons" },
];

const t = (label: string): OptionSeed => ({ key: `t_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`, label });

export const TRADE_SEEDS: Record<string, TradeSeed> = {
  makeup_artist: {
    serviceCategories: [
      { key: "bridal", label: "Bridal" },
      { key: "party", label: "Party and family" },
      { key: "hair", label: "Hair and draping" },
      { key: "addons", label: "Add-ons and travel" },
    ],
    serviceCategoryOf: {
      "Bridal HD makeup": "bridal",
      "Airbrush bridal makeup": "bridal",
      "Engagement / reception makeup": "bridal",
      "Family & guest makeup": "party",
      "Hair styling": "hair",
      "Saree / dupatta draping": "hair",
    },
    designations: [t("Hair stylist"), t("Draper"), t("Assistant artist")],
    vendorCategories: [t("Product supplier"), t("Hair accessories"), t("Freelance artist")],
    packages: [
      {
        name: "Bridal package",
        description: "Everything the bride needs on the wedding day.",
        unit: "event",
        price: 32000,
        items: [
          { service: "Bridal HD makeup", quantity: 1 },
          { service: "Hair styling", quantity: 1 },
          { service: "Saree / dupatta draping", quantity: 1 },
          { text: "Trial session before the wedding" },
          { text: "Touch-up kit for the day" },
        ],
      },
      {
        name: "Family package (5 people)",
        description: "Makeup and hair for five family members.",
        unit: "event",
        price: 25000,
        items: [
          { service: "Family & guest makeup", quantity: 5 },
          { service: "Hair styling", quantity: 5 },
        ],
      },
    ],
  },
  mehendi_artist: {
    serviceCategories: [
      { key: "bridal", label: "Bridal mehendi" },
      { key: "guest", label: "Guest mehendi" },
      { key: "addons", label: "Add-ons" },
    ],
    serviceCategoryOf: { "Bridal mehendi (full hands & feet)": "bridal", "Guest mehendi": "guest", "Groom mehendi": "bridal", "Artist per hour": "addons" },
    designations: [t("Mehendi artist"), t("Assistant artist")],
    vendorCategories: [t("Henna supplier"), t("Freelance artist")],
    packages: [
      {
        name: "Bride and 20 guests",
        description: "Bridal mehendi with guest mehendi for the family.",
        unit: "event",
        price: 22000,
        items: [
          { service: "Bridal mehendi (full hands & feet)", quantity: 1 },
          { service: "Guest mehendi", quantity: 20 },
          { text: "Organic henna, no chemicals" },
        ],
      },
    ],
  },
  wedding_planner: {
    serviceCategories: [
      { key: "planning", label: "Planning" },
      { key: "coordination", label: "Coordination" },
      { key: "hospitality", label: "Hospitality and logistics" },
      { key: "destination", label: "Destination weddings" },
    ],
    serviceCategoryOf: {
      "Full wedding planning": "planning",
      "Day-of coordination": "coordination",
      "Destination wedding management": "destination",
      "Vendor sourcing only": "planning",
      "Guest hospitality desk": "hospitality",
    },
    designations: [t("Wedding planner"), t("Hospitality executive"), t("Logistics coordinator")],
    vendorCategories: [t("Hotel and stay"), t("Invitations"), t("Artists and performers")],
    packages: [
      {
        name: "Complete wedding (3 functions)",
        description: "Planning, vendors and coordination for the whole wedding.",
        unit: "event",
        price: 600000,
        items: [
          { service: "Full wedding planning", quantity: 1 },
          { service: "Guest hospitality desk", quantity: 3 },
          { text: "Vendor sourcing and negotiation" },
          { text: "A coordinator at every function" },
        ],
      },
    ],
  },
  decorator: {
    serviceCategories: [
      { key: "mandap", label: "Mandap and stage" },
      { key: "entrance", label: "Entrance and pathway" },
      { key: "floral", label: "Floral" },
      { key: "functions", label: "Haldi and mehendi setups" },
      { key: "rentals", label: "Props and rentals" },
    ],
    serviceCategoryOf: {
      "Mandap decor": "mandap",
      "Stage decor": "mandap",
      "Entrance and pathway": "entrance",
      "Floral centrepieces": "floral",
      "Haldi / mehendi setup": "functions",
    },
    designations: [t("Decor designer"), t("Florist"), t("Site supervisor"), t("Labour")],
    vendorCategories: [t("Flower supplier"), t("Tent house"), t("Fabric and props"), t("Labour contractor")],
    packages: [
      {
        name: "Wedding decor package",
        description: "Mandap, stage, entrance and tables, in one look.",
        unit: "event",
        price: 280000,
        items: [
          { service: "Mandap decor", quantity: 1 },
          { service: "Stage decor", quantity: 1 },
          { service: "Entrance and pathway", quantity: 1 },
          { service: "Floral centrepieces", quantity: 10 },
          { text: "Setup and teardown" },
        ],
      },
    ],
  },
  event_decorator: {
    serviceCategories: [
      { key: "balloons", label: "Balloon decor" },
      { key: "themes", label: "Theme setups" },
      { key: "props", label: "Backdrops and props" },
    ],
    serviceCategoryOf: { "Balloon decor package": "balloons", "Theme birthday setup": "themes", "Backdrop and props": "props", "Table decor": "props" },
    designations: [t("Decor designer"), t("Helper")],
    vendorCategories: [t("Balloon supplier"), t("Props rental"), t("Cake and bakery")],
    packages: [
      {
        name: "Birthday combo",
        description: "Theme setup, backdrop and tables for a birthday party.",
        unit: "event",
        price: 30000,
        items: [
          { service: "Theme birthday setup", quantity: 1 },
          { service: "Backdrop and props", quantity: 1 },
          { service: "Table decor", quantity: 10 },
        ],
      },
    ],
  },
  photographer: {
    serviceCategories: [
      { key: "photo", label: "Photography" },
      { key: "film", label: "Films" },
      { key: "prewedding", label: "Pre-wedding" },
      { key: "albums", label: "Albums and prints" },
      { key: "addons", label: "Add-ons" },
    ],
    serviceCategoryOf: {
      "Wedding photography": "photo",
      "Cinematic wedding film": "film",
      "Pre-wedding shoot": "prewedding",
      "Candid photographer": "photo",
      "Photo album (40 pages)": "albums",
      "Drone coverage": "addons",
    },
    designations: [t("Second shooter"), t("Drone operator"), t("Cinematographer")],
    vendorCategories: [t("Album printer"), t("Equipment rental"), t("Freelance photographer")],
    packages: [
      {
        name: "Wedding Gold (2 days)",
        description: "Photos, film and an album for a two-day wedding.",
        unit: "event",
        price: 275000,
        items: [
          { service: "Wedding photography", quantity: 2 },
          { service: "Cinematic wedding film", quantity: 1 },
          { service: "Photo album (40 pages)", quantity: 1 },
          { service: "Drone coverage", quantity: 1 },
          { text: "All edited photos online in 30 days" },
        ],
      },
    ],
  },
  content_creator: {
    serviceCategories: [
      { key: "reels", label: "Reels" },
      { key: "coverage", label: "Coverage" },
      { key: "addons", label: "Add-ons" },
    ],
    serviceCategoryOf: {
      "Same-day reels package": "reels",
      "Full wedding content coverage": "coverage",
      "Behind-the-scenes stories": "coverage",
      "Extra reel": "addons",
    },
    designations: [t("Content creator"), t("Reel editor")],
    vendorCategories: [t("Equipment rental"), t("Music licences")],
    packages: [
      {
        name: "Wedding content (2 days)",
        description: "Two days of content with same-day reels.",
        unit: "event",
        price: 65000,
        items: [
          { service: "Full wedding content coverage", quantity: 2 },
          { service: "Same-day reels package", quantity: 1 },
          { text: "Raw clips shared the same night" },
        ],
      },
    ],
  },
  sound_lighting: {
    serviceCategories: [
      { key: "sound", label: "Sound and DJ" },
      { key: "lighting", label: "Lighting" },
      { key: "screens", label: "LED and screens" },
      { key: "power", label: "Power backup" },
    ],
    serviceCategoryOf: {
      "DJ with sound (up to 300 guests)": "sound",
      "Line array sound system": "sound",
      "Stage and venue lighting": "lighting",
      "LED wall": "screens",
      "Generator backup": "power",
    },
    designations: [t("DJ"), t("Sound engineer"), t("Lighting technician")],
    vendorCategories: [t("Equipment rental"), t("Generator"), t("Truss and staging")],
    packages: [
      {
        name: "Sangeet night",
        description: "DJ, lights, LED wall and backup power for the sangeet.",
        unit: "event",
        price: 125000,
        items: [
          { service: "DJ with sound (up to 300 guests)", quantity: 1 },
          { service: "Stage and venue lighting", quantity: 1 },
          { service: "LED wall", quantity: 1 },
          { service: "Generator backup", quantity: 1 },
        ],
      },
    ],
  },
  bar_services: {
    serviceCategories: [
      { key: "bar", label: "Bar setups" },
      { key: "counters", label: "Counters" },
      { key: "staff", label: "Bar staff" },
    ],
    serviceCategoryOf: { Bartender: "staff", "Mocktail counter": "counters", "Cocktail bar setup": "bar", "Glassware and bar setup": "bar" },
    designations: [t("Bartender"), t("Bar manager")],
    vendorCategories: [t("Beverage supplier"), t("Ice supplier"), t("Glassware rental")],
    packages: [
      {
        name: "Mocktail bar",
        description: "Priced per guest.",
        unit: "person",
        price: 350,
        items: [{ text: "Six mocktails" }, { text: "Glassware and garnish" }, { text: "Two bartenders for every 150 guests" }],
      },
    ],
  },
  caterer: {
    serviceCategories: [
      { key: "menus", label: "Menus" },
      { key: "counters", label: "Live counters" },
      { key: "meals", label: "Breakfast and hi-tea" },
      { key: "staff", label: "Service staff" },
    ],
    serviceCategoryOf: { "Veg buffet": "menus", "Non-veg buffet": "menus", "Live counters": "counters", "Breakfast / hi-tea": "meals", "Service staff": "staff" },
    designations: [t("Head chef"), t("Captain"), t("Waiter")],
    vendorCategories: [t("Grocery supplier"), t("Gas supplier"), t("Crockery rental")],
    packages: [
      {
        name: "Silver veg menu",
        description: "Priced per plate.",
        unit: "plate",
        price: 950,
        items: [
          { text: "2 welcome drinks" },
          { text: "3 starters" },
          { text: "Paneer main course, dal and 2 vegetables" },
          { text: "Rice and 3 kinds of bread" },
          { text: "2 desserts" },
        ],
      },
    ],
  },
  gifting: {
    serviceCategories: [
      { key: "favours", label: "Guest favours" },
      { key: "hampers", label: "Hampers" },
      { key: "trousseau", label: "Trousseau packing" },
      { key: "packaging", label: "Packaging" },
    ],
    serviceCategoryOf: { "Guest favour": "favours", "Premium hamper": "hampers", "Trousseau packing": "trousseau", "Custom packaging": "packaging" },
    designations: [t("Packer"), t("Delivery")],
    vendorCategories: [t("Packaging supplier"), t("Courier")],
    packages: [
      {
        name: "Premium hamper, packed",
        description: "Priced per hamper.",
        unit: "piece",
        price: 2600,
        items: [
          { service: "Premium hamper", quantity: 1 },
          { service: "Custom packaging", quantity: 1 },
          { text: "Name tag for each guest" },
        ],
      },
    ],
  },
  choreographer: {
    serviceCategories: [
      { key: "sangeet", label: "Sangeet" },
      { key: "couple", label: "Couple dance" },
      { key: "practice", label: "Practice sessions" },
    ],
    serviceCategoryOf: {
      "Sangeet choreography package": "sangeet",
      "Couple dance": "couple",
      "Family dance (per song)": "sangeet",
      "Practice session": "practice",
    },
    designations: [t("Choreographer"), t("Assistant choreographer")],
    vendorCategories: [t("Studio rent"), t("Costumes")],
    packages: [
      {
        name: "Sangeet complete",
        description: "The couple's dance and three family songs.",
        unit: "event",
        price: 90000,
        items: [
          { service: "Sangeet choreography package", quantity: 1 },
          { service: "Couple dance", quantity: 1 },
          { service: "Family dance (per song)", quantity: 3 },
        ],
      },
    ],
  },
  fireworks: {
    serviceCategories: [
      { key: "entry", label: "Entry effects" },
      { key: "shows", label: "Fireworks shows" },
      { key: "effects", label: "Smoke and CO2" },
    ],
    serviceCategoryOf: {
      "Cold pyro (per piece)": "entry",
      "Couple entry effects": "entry",
      "Fireworks show": "shows",
      "Smoke / CO2 effects": "effects",
    },
    designations: [t("Pyro technician")],
    vendorCategories: [t("Fireworks stock"), t("Permits")],
    packages: [
      {
        name: "Grand entry",
        description: "Effects for the couple's entry.",
        unit: "event",
        price: 32000,
        items: [
          { service: "Couple entry effects", quantity: 1 },
          { service: "Cold pyro (per piece)", quantity: 10 },
        ],
      },
    ],
  },
};

export const tradeSeed = (businessTypeId: string | null | undefined): TradeSeed | undefined =>
  businessTypeId ? TRADE_SEEDS[businessTypeId] : undefined;
