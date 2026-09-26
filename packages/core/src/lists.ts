/**
 * The business's own lists. Every option has a fixed key, which records store, and a
 * name the business can change. Built-in options keep short keys (upi, cash, materials);
 * ones the business adds get a generated key. Renaming never touches old records, and a
 * hidden option still shows its name on the records that use it.
 */

export const OPTION_LISTS = ["payment_method", "expense_category", "task_tag"] as const;
export type OptionList = (typeof OPTION_LISTS)[number];

export const OPTION_LIST_INFO: Record<OptionList, { title: string; one: string; about: string }> = {
  payment_method: { title: "Payment modes", one: "payment mode", about: "How clients pay you and how you pay others." },
  expense_category: { title: "Expense categories", one: "category", about: "What your money goes on. Reports group expenses by these." },
  task_tag: { title: "Task tags", one: "tag", about: "Group tasks by kind of work, and filter the task board by them." },
};

export interface OptionSeed {
  key: string;
  label: string;
}

export const BUILTIN_OPTIONS: Record<OptionList, OptionSeed[]> = {
  payment_method: [
    { key: "upi", label: "UPI" },
    { key: "cash", label: "Cash" },
    { key: "bank", label: "Bank transfer" },
    { key: "cheque", label: "Cheque" },
    { key: "card", label: "Card" },
    { key: "other", label: "Other" },
  ],
  expense_category: [
    { key: "materials", label: "Materials" },
    { key: "vendor", label: "Vendors & helpers" },
    { key: "staff", label: "Staff pay" },
    { key: "travel", label: "Travel" },
    { key: "food", label: "Food" },
    { key: "equipment", label: "Equipment" },
    { key: "rent", label: "Rent & bills" },
    { key: "marketing", label: "Ads & marketing" },
    { key: "other", label: "Other" },
  ],
  task_tag: [
    { key: "client", label: "Client" },
    { key: "event", label: "Event prep" },
    { key: "delivery", label: "Delivery" },
    { key: "vendors", label: "Vendors" },
    { key: "marketing", label: "Marketing" },
    { key: "admin", label: "Admin" },
  ],
};

/** Extra expense categories each trade usually needs, added when the business is made. */
export const TRADE_EXPENSE_CATEGORIES: Record<string, string[]> = {
  makeup_artist: ["Makeup products", "Hair accessories", "Kit refills"],
  mehendi_artist: ["Henna cones", "Assistants"],
  photographer: ["Albums and prints", "Hard drives", "Second shooter", "Editing"],
  content_creator: ["Editing", "Props", "Music licences"],
  decorator: ["Flowers", "Rentals", "Labour", "Transport", "Lighting"],
  event_decorator: ["Flowers", "Balloons", "Props", "Labour"],
  sound_lighting: ["Generator", "Transport", "Crew", "Repairs"],
  caterer: ["Groceries", "Gas", "Crockery", "Kitchen staff", "Transport"],
  bar_services: ["Liquor", "Mixers and ice", "Glassware", "Licence fees"],
  wedding_planner: ["Venue deposits", "Coordinators", "Printing"],
  gifting: ["Packaging", "Hamper items", "Courier"],
  choreographer: ["Studio rent", "Dancers", "Costumes"],
  fireworks: ["Fireworks stock", "Permits", "Transport"],
};

/** A label for any key: the business's own name for it, else a built-in name, else the key. */
export function optionLabel(options: { key: string; label: string }[] | undefined, list: OptionList, key: string | null | undefined): string {
  if (!key) return "";
  return options?.find((o) => o.key === key)?.label ?? BUILTIN_OPTIONS[list].find((o) => o.key === key)?.label ?? key;
}
