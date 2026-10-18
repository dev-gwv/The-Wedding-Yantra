/** Every kind of work a business (aliased w) does, by name, main first: "Wedding planner · Photographer & filmmaker". */
export const TYPE_NAMES = `(SELECT string_agg(t.name, ' · ' ORDER BY array_position(w.business_type_ids, t.id))
                             FROM business_types t WHERE t.id = ANY(w.business_type_ids))`;
