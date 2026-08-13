/**
 * Business facts and the service catalogue.
 *
 * Deliberately static rather than fetched.
 *
 * The marketing pages are the ones a stranger with a burst pipe hits first,
 * and they must render whether or not Supabase is reachable, configured, or
 * having a bad afternoon. Keeping the catalogue here makes every public page
 * statically renderable with no database round trip — which is also how they
 * hit the performance budget in spec NFR-1.
 *
 * `supabase/migrations/20260810093000_seed.sql` mirrors these slugs so a job
 * can be filed against a service. If you add one here, add it there too.
 */

export const business = {
  name: "Carr Denzy Plumbing & Gas",
  shortName: "Carr Denzy",
  // Fallback only — the live value comes from Settings via getBusiness().
  // Kept in step with it deliberately: this is what the public site shows if
  // the database is ever unreachable, so a wrong number here is a silent
  // failure that only appears on the worst day.
  phone: "07938 463358",
  phoneHref: "tel:+447938463358",
  email: "carrdenzy@gmail.com",
  /**
   * Locality and region only, with no street address — deliberately.
   *
   * This is a mobile trade business working out of a van. There is no premises
   * for anyone to visit, and publishing a home address invites post and callers
   * to somewhere nobody works. The old static site listed exactly this much,
   * and it is what Google expects of a service-area business.
   *
   * The trading address that must appear on an invoice is a separate thing: it
   * lives in the `settings` table, is entered once on /app/settings, and is
   * snapshotted onto each invoice as it is issued.
   */
  address: {
    city: "Nottingham",
    region: "Nottinghamshire",
    country: "GB",
  },
  serviceAreas: ["Nottingham", "Nottinghamshire", "Derbyshire", "Leicestershire"],
  hours: {
    weekdays: "9:00am – 5:00pm",
    saturday: "9:00am – 5:00pm",
    /**
     * Sunday is closed. Not "emergencies only" — closed.
     *
     * The request form still accepts submissions, because a burst pipe on a
     * Sunday afternoon should not be met with a disabled form, but they are
     * answered Monday and the wording says so. Out-of-hours emergency call-outs
     * run Monday to Saturday only.
     *
     * The failure this line exists to prevent is somebody sitting by the phone
     * on a Sunday waiting for a reply that was never coming.
     */
    sunday: "Closed — enquiries answered Monday",
  },
  established: 2004,
  credentials: [
    "Gas Safe registered",
    "Accredited installers of Worcester and Bosch",
    "REFCOM registered",
    "Public liability insured to £5m",
  ],
} as const;

export interface ServiceDefinition {
  slug: string;
  name: string;
  /** One sentence for cards and the enquiry form. */
  blurb: string;
  /** Two or three sentences for the service page. */
  description: string;
  /** Concrete jobs, so a visitor can recognise their own problem in the list. */
  examples: string[];
  /** Phosphor icon name, rendered by `ServiceIcon`. */
  icon: string;
  /** From the existing image library in /public/images. */
  image: string;
}

export const services: ServiceDefinition[] = [
  {
    slug: "leaks-and-repairs",
    name: "Leaks & repairs",
    blurb: "Dripping taps, burst pipes, blocked drains and the emergencies that will not wait.",
    description:
      "Most of what we do starts with something that has gone wrong. We carry the common parts on the van, so a large share of these are fixed on the first visit rather than booked back in for a second.",
    examples: [
      "Burst or leaking pipework",
      "Taps that will not shut off",
      "Toilets that keep running",
      "Blocked sinks, baths and drains",
      "Leaking radiators and valves",
      "Water damage traced back to source",
    ],
    icon: "Wrench",
    image: "/images/plumber.webp",
  },
  {
    slug: "gas-and-boilers",
    name: "Gas & boilers",
    blurb: "Gas Safe registered. Servicing, repairs, replacements and landlord certificates.",
    description:
      "All gas work is carried out by Gas Safe registered engineers, and we are accredited installers for Worcester and Bosch. If your boiler has locked out, we will diagnose it before quoting to replace it — a new boiler is not always the answer.",
    examples: [
      "Annual boiler servicing",
      "Boiler fault-finding and repair",
      "Full boiler replacement",
      "CP12 landlord gas safety records",
      "Gas cooker and hob installation",
      "Gas leak detection",
    ],
    icon: "Flame",
    image: "/images/gas-fuel.webp",
  },
  {
    slug: "heating",
    name: "Heating",
    blurb: "Radiators, underfloor heating, system flushing and controls that actually work.",
    description:
      "Cold at the top, cold at the bottom, or one room that never warms up — each points at something different, and we will tell you which before doing any work. We balance and flush systems, replace radiators, and set controls so the heating runs when you are in.",
    examples: [
      "Power flushing and system cleaning",
      "Radiator replacement and rebalancing",
      "Thermostatic valve fitting",
      "Underfloor heating installation",
      "Smart thermostat setup",
      "Cylinder and immersion repairs",
    ],
    icon: "Thermometer",
    image: "/images/heater.webp",
  },
  {
    slug: "bathrooms-and-kitchens",
    name: "Bathrooms & kitchens",
    blurb: "Full fit-outs, from first fix pipework to the last bead of sealant.",
    description:
      "We install complete bathrooms and kitchens including tiling, waste runs and making good afterwards. If you are working to your own designer's drawings we will fit to them; if not, we will tell you plainly what will and will not fit the space you have.",
    examples: [
      "Complete bathroom installation",
      "Wet rooms and level-access showers",
      "Kitchen plumbing and appliance fitting",
      "Tiling and sealing",
      "Soil and waste pipe alterations",
      "Cloakroom and en-suite additions",
    ],
    icon: "Bathtub",
    image: "/images/plumbing.webp",
  },
  {
    slug: "electrical",
    name: "Electrical",
    blurb: "Sockets, lighting, consumer units, fault-finding and EICR reports.",
    description:
      "Electrical work runs alongside most of our bathroom and building jobs, so it rarely needs a separate trade booked in behind us. That keeps the job moving and stops two contractors blaming each other.",
    examples: [
      "Additional sockets and lighting circuits",
      "Consumer unit upgrades",
      "Intermittent fault tracing",
      "EICR periodic inspection reports",
      "Extractor fan installation",
      "Outdoor and garden power",
    ],
    icon: "Lightning",
    image: "/images/electrician.webp",
  },
  {
    slug: "building-repairs",
    name: "Building repairs",
    blurb: "Brickwork, plastering, damp, and making good after the pipe is fixed.",
    description:
      "A leak that has been running for a week rarely stops at the pipe. We repair the brickwork, plaster and flooring around what we have opened up, so you are not left arranging a second trade to finish someone else's hole.",
    examples: [
      "Plastering and making good",
      "Brickwork and pointing repairs",
      "Damp investigation and treatment",
      "Floor and joist repairs",
      "Ceiling repairs after leaks",
      "Rendering and external repairs",
    ],
    icon: "Wall",
    image: "/images/wall.webp",
  },
  {
    slug: "maintenance-contracts",
    name: "Property maintenance",
    blurb: "Planned maintenance for landlords, letting agents and small commercial sites.",
    description:
      "For landlords and agents with several properties we work to a schedule rather than a crisis. Every job, photograph and certificate stays on file against that address in your portal, so an accountant or a new tenant can be shown the history in a minute.",
    examples: [
      "Annual gas safety checks across a portfolio",
      "Scheduled boiler servicing",
      "Void property inspections",
      "Reactive repairs with agreed response times",
      "Written condition reports",
      "Commercial washroom maintenance",
    ],
    icon: "Buildings",
    image: "/images/house.webp",
  },
  {
    slug: "extensions-and-conversions",
    name: "Extensions & conversions",
    blurb: "Single-storey extensions, loft and garage conversions, managed end to end.",
    description:
      "Larger projects where we handle the trades, the sequencing and the site. You get one point of contact, a written schedule of works, and staged invoices tied to what has actually been completed rather than to a calendar.",
    examples: [
      "Single-storey rear extensions",
      "Loft conversions",
      "Garage conversions",
      "Structural alterations",
      "Full first and second fix",
      "Project management and trade coordination",
    ],
    icon: "HouseLine",
    image: "/images/extension.webp",
  },
];

export function getService(slug: string): ServiceDefinition | undefined {
  return services.find((service) => service.slug === slug);
}

/**
 * The gallery used to live here as a hard-coded array. It now lives in the
 * `portfolio_items` table so the owner can add, caption, reorder and delete
 * photographs without a deploy — see `supabase/migrations/…_portfolio.sql`,
 * `src/lib/portfolio.ts` and `/app/portfolio`.
 *
 * The seed in that migration reproduces exactly what was here, pointing at the
 * same files in /public/images, so nothing had to be re-uploaded.
 */

/**
 * LocalBusiness structured data (spec FR-3).
 *
 * Hard-coded object, never user content — it is the one place in the app that
 * uses dangerouslySetInnerHTML, and it stays safe precisely because nothing
 * dynamic reaches it.
 */
export function localBusinessJsonLd(
  siteUrl: string,
  /**
   * The owner's live contact details from Settings. Optional so this stays
   * usable without a database round trip; omitting it falls back to the static
   * values below. These are the details Google prints beside the business in
   * search, so a stale number here is a customer ringing nobody.
   */
  contact?: { name: string; phone: string; email: string },
) {
  return {
    "@context": "https://schema.org",
    "@type": "Plumber",
    name: contact?.name ?? business.name,
    url: siteUrl,
    telephone: contact?.phone ?? business.phone,
    email: contact?.email ?? business.email,
    image: `${siteUrl}/images/work-33.webp`,
    priceRange: "££",
    // Locality and region, no streetAddress. Schema.org permits this, and for a
    // service-area business it is the honest description.
    address: {
      "@type": "PostalAddress",
      addressLocality: business.address.city,
      addressRegion: business.address.region,
      addressCountry: business.address.country,
    },
    areaServed: business.serviceAreas.map((area) => ({ "@type": "Place", name: area })),
    /**
     * These are the hours Google prints next to the business in search and on
     * Maps, so they have to match `business.hours` above exactly. Sunday is
     * deliberately absent rather than listed with hours — omitting a day is how
     * schema.org says "closed", and claiming a Sunday opening the business does
     * not keep is the version of this that costs a customer.
     */
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        opens: "09:00",
        closes: "17:00",
      },
    ],
    makesOffer: services.map((service) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: service.name, description: service.blurb },
    })),
  };
}
