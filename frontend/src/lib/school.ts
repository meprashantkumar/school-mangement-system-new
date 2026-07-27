/**
 * School identity — single source of truth for public-facing branding
 * (home page, login, footer, receipts, certificates, report cards).
 *
 * Every value can be overridden per school with a VITE_SCHOOL_* environment
 * variable — see frontend/.env.example. These are read at BUILD time (Vite),
 * so after changing them you must rebuild the frontend. Any variable left unset
 * falls back to the default below, so the app always works out of the box.
 */

// Use the env value when it's a non-empty string, otherwise the built-in default.
const pick = (val: unknown, fallback: string): string => {
  const s = val == null ? "" : String(val).trim();
  return s !== "" ? s : fallback;
};

const name = pick(import.meta.env.VITE_SCHOOL_NAME, "R K Public School");
const place = pick(import.meta.env.VITE_SCHOOL_PLACE, "Garhwa");

export const SCHOOL = {
  name,
  place,
  fullName: pick(import.meta.env.VITE_SCHOOL_FULL_NAME, place ? `${name}, ${place}` : name),
  shortName: pick(import.meta.env.VITE_SCHOOL_SHORT_NAME, "RKPS"),
  tagline: pick(
    import.meta.env.VITE_SCHOOL_TAGLINE,
    "Nurturing knowledge, character & confidence."
  ),
  intro: pick(
    import.meta.env.VITE_SCHOOL_INTRO,
    `A co-educational English-medium school in ${place} offering quality education from Nursery to Class 12, with a focus on strong academics, values and all-round development.`
  ),
  director: {
    name: pick(import.meta.env.VITE_SCHOOL_DIRECTOR_NAME, "Mr. Alakh Nath Panday"),
    role: pick(import.meta.env.VITE_SCHOOL_DIRECTOR_ROLE, "Director"),
  },
  principal: {
    name: pick(import.meta.env.VITE_SCHOOL_PRINCIPAL_NAME, "Mr. Santosh Panday"),
    role: pick(import.meta.env.VITE_SCHOOL_PRINCIPAL_ROLE, "Principal"),
  },
  address: pick(import.meta.env.VITE_SCHOOL_ADDRESS, place ? `${place}, Jharkhand` : ""),
  // Left blank by default — filled only when the env var is set, so nothing fake shows.
  phone: pick(import.meta.env.VITE_SCHOOL_PHONE, ""),
  email: pick(import.meta.env.VITE_SCHOOL_EMAIL, ""),
  established: pick(import.meta.env.VITE_SCHOOL_ESTABLISHED, ""),
  affiliation: pick(import.meta.env.VITE_SCHOOL_AFFILIATION, ""),
};

/** Two-letter monogram for the crest, e.g. "RK". */
export const SCHOOL_MONOGRAM = pick(import.meta.env.VITE_SCHOOL_MONOGRAM, "RK");
