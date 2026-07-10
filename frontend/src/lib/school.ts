/**
 * School identity — single source of truth for public-facing branding
 * (home page, login, footer, receipts).
 *
 * NOTE: `phone`, `email` and `established` are intentionally left blank. Fill
 * them with the school's real details and they'll automatically appear on the
 * site; while blank they're simply hidden (nothing fake is shown).
 */
export const SCHOOL = {
  name: "R K Public School",
  place: "Garhwa",
  fullName: "R K Public School, Garhwa",
  shortName: "RKPS",
  tagline: "Nurturing knowledge, character & confidence.",
  intro:
    "A co-educational English-medium school in Garhwa offering quality education from Nursery to Class 12, with a focus on strong academics, values and all-round development.",
  director: { name: "Mr. Alakh Nath Panday", role: "Director" },
  principal: { name: "Mr. Santosh Panday", role: "Principal" },
  address: "Garhwa, Jharkhand",
  // Fill these in to display them on the site:
  phone: "",
  email: "",
  established: "",
} as const;

/** Two-letter monogram for the crest, e.g. "RK". */
export const SCHOOL_MONOGRAM = "RK";
