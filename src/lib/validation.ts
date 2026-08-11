import { z } from "zod";

/**
 * Server-side validation schemas.
 *
 * Every server action runs its input through one of these. Client-side
 * validation exists purely so the user gets a fast, kind error message — it is
 * never the thing standing between a hostile payload and the database.
 */

const trimmed = (max: number) => z.string().trim().max(max);

/** UK numbers arrive as "07700 900412", "+44 7700 900412", "(0115) 4960123". */
export const ukPhone = z
  .string()
  .trim()
  .min(10, "That phone number looks too short")
  .max(20, "That phone number looks too long")
  .refine(
    (value) => /^[0-9+()\s-]+$/.test(value) && value.replace(/\D/g, "").length >= 10,
    "Please enter a UK phone number, for example 07700 900412",
  );

export const ukPostcode = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    (value) => /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/.test(value.replace(/\s+/g, " ")),
    "Please enter a full UK postcode, for example NG1 5AA",
  );

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please check the email address — it needs an @ and a domain");

// ---------------------------------------------------------------------------
// Enquiry
// ---------------------------------------------------------------------------

export const enquirySchema = z
  .object({
    full_name: trimmed(120).min(2, "Please tell us your name"),
    email: z.union([emailSchema, z.literal("")]).optional(),
    phone: z.union([ukPhone, z.literal("")]).optional(),
    service_slug: trimmed(80).optional(),
    service_label: trimmed(120).optional(),
    description: z
      .string()
      .trim()
      .min(10, "Please describe the problem in a sentence or two")
      .max(4000, "That is longer than we can store — please summarise the key points"),
    urgency: z.enum(["emergency", "soon", "flexible"]),
    address_line1: trimmed(200).optional(),
    address_line2: trimmed(200).optional(),
    city: trimmed(100).optional(),
    postcode: z.union([ukPostcode, z.literal("")]).optional(),
    preferred_dates: trimmed(400).optional(),
    photo_paths: z.array(trimmed(400)).max(6, "Up to 6 photos, please").optional(),
    // Honeypot. A real person never sees this field, so anything in it is a bot.
    company_website: z.string().max(0).optional(),
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: "Please give us either an email address or a phone number so we can reply",
    path: ["phone"],
  });

export type EnquiryInput = z.infer<typeof enquirySchema>;

// ---------------------------------------------------------------------------
// Clients and properties
// ---------------------------------------------------------------------------

export const clientSchema = z
  .object({
    full_name: trimmed(120).min(2, "Please enter the customer's name"),
    email: z.union([emailSchema, z.literal("")]).optional(),
    phone: z.union([ukPhone, z.literal("")]).optional(),
    company_name: trimmed(160).optional(),
    notes: trimmed(4000).optional(),
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: "Add an email address or a phone number so you can reach them",
    path: ["phone"],
  });

/**
 * What a signed-in customer may change about themselves.
 *
 * Deliberately not `clientSchema`: that one carries `notes`, which are the
 * owner's private notes *about* the customer. The RLS policy lets a client
 * update their own row, so the column list here is the thing standing between
 * that and a customer editing the owner's notes on them.
 */
export const myDetailsSchema = z
  .object({
    full_name: trimmed(120).min(2, "Please enter your name"),
    email: z.union([emailSchema, z.literal("")]).optional(),
    phone: z.union([ukPhone, z.literal("")]).optional(),
    company_name: trimmed(160).optional(),
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: "Please leave us either an email address or a phone number",
    path: ["phone"],
  });

export const propertySchema = z.object({
  client_id: z.string().uuid(),
  label: trimmed(80).optional(),
  address_line1: trimmed(200).min(3, "Please enter the first line of the address"),
  address_line2: trimmed(200).optional(),
  city: trimmed(100).optional(),
  postcode: ukPostcode,
  access_notes: trimmed(2000).optional(),
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const jobSchema = z.object({
  client_id: z.string().uuid(),
  property_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  service_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  title: trimmed(200).min(3, "Give the job a short title, for example 'Boiler not firing'"),
  description: trimmed(4000).optional(),
  urgency: z.enum(["emergency", "soon", "flexible"]).default("soon"),
});

/**
 * A job taken over the phone.
 *
 * This is how most work arrives at a word-of-mouth business, and it has to be
 * fillable while the customer is still talking. So: one schema covering the
 * customer, the address and the job, with almost everything optional. The only
 * hard requirements are a name to call them, a way to call them back, and a
 * line saying what is wrong.
 *
 * An address is NOT required — plenty of calls end with "I'll text you the
 * postcode". Refusing to save the job over that would send the owner back to
 * the paper book, which is the entire thing this replaces.
 */
export const phoneJobSchema = z
  .object({
    // Empty means "the customer is new and their details follow".
    client_id: z.union([z.string().uuid(), z.literal("")]).optional(),
    full_name: trimmed(120).optional(),
    phone: z.union([ukPhone, z.literal("")]).optional(),
    email: z.union([emailSchema, z.literal("")]).optional(),

    address_line1: trimmed(200).optional(),
    address_line2: trimmed(200).optional(),
    city: trimmed(100).optional(),
    postcode: z.union([ukPostcode, z.literal("")]).optional(),
    access_notes: trimmed(2000).optional(),

    title: trimmed(200).min(3, "Give it a short title, for example 'Boiler not firing'"),
    description: trimmed(4000).optional(),
    service_id: z.union([z.string().uuid(), z.literal("")]).optional(),
    urgency: z.enum(["emergency", "soon", "flexible"]).default("soon"),

    // Optional: book it in during the same call, which is the whole point.
    date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
    time: z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal("")]).optional(),
    duration_minutes: z.coerce.number().int().min(15).max(60 * 24).default(60),
  })
  .refine((data) => Boolean(data.client_id) || Boolean(data.full_name), {
    message: "Pick an existing customer, or put the new customer's name in",
    path: ["full_name"],
  })
  .refine(
    // Only enforced for a NEW customer — an existing one already has whatever
    // contact details they have.
    (data) => Boolean(data.client_id) || Boolean(data.phone) || Boolean(data.email),
    {
      message: "Take a phone number or an email, or you cannot ring them back",
      path: ["phone"],
    },
  )
  .refine((data) => !data.date || Boolean(data.time), {
    message: "Put a time in as well, or clear the date",
    path: ["time"],
  });

export const scheduleSchema = z.object({
  job_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Please pick a start time"),
  duration_minutes: z.coerce
    .number()
    .int()
    .min(15, "Give it at least 15 minutes")
    .max(60 * 24, "That is longer than a day — split it into separate visits"),
  confirm_overlap: z.coerce.boolean().optional(),
});

export const jobStatusSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum([
    "new",
    "quoted",
    "accepted",
    "declined",
    "scheduled",
    "in_progress",
    "completed",
    "invoiced",
    "paid",
    "cancelled",
  ]),
});

export const jobNoteSchema = z.object({
  job_id: z.string().uuid(),
  body: trimmed(5000).min(1, "Write the note first"),
  visible_to_client: z.coerce.boolean().default(false),
  // Lets the offline outbox replay safely: a second delivery of the same note
  // hits a unique index and is discarded rather than duplicated.
  client_key: trimmed(64).optional(),
});

// ---------------------------------------------------------------------------
// Quotes and invoices
// ---------------------------------------------------------------------------

export const lineItemSchema = z.object({
  description: trimmed(500).min(1, "Describe what this line is for"),
  kind: z.enum(["labour", "materials", "other"]).default("labour"),
  quantity_milli: z.coerce.number().int().positive("Quantity must be more than zero"),
  unit_price_pence: z.coerce.number().int().min(0, "Price cannot be negative"),
  vat_rate_bp: z.coerce.number().int().min(0).max(10000).default(0),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export const quoteSchema = z.object({
  job_id: z.string().uuid(),
  intro_note: trimmed(2000).optional(),
  terms: trimmed(4000).optional(),
  valid_until: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  // Totals are deliberately absent. They are computed by database trigger, so
  // there is nothing here for a forged request to overwrite (spec AC-5).
  items: z.array(lineItemSchema).min(1, "Add at least one line to the quote"),
});

/**
 * An invoice.
 *
 * `job_id` is optional because plenty of work predates the app or never became
 * a job in it — a favour for a neighbour, a call-out settled on the day. And
 * `client_id` is optional in the same way the phone-job form allows: an invoice
 * for someone not yet on file should not require a detour to create them first.
 * One of the two must resolve to a customer, which the refinement enforces.
 */
export const invoiceSchema = z
  .object({
    job_id: z.union([z.string().uuid(), z.literal("")]).optional(),
    client_id: z.union([z.string().uuid(), z.literal("")]).optional(),

    // Only read when client_id is empty.
    full_name: trimmed(120).optional(),
    phone: z.union([ukPhone, z.literal("")]).optional(),
    email: z.union([emailSchema, z.literal("")]).optional(),

    quote_id: z.union([z.string().uuid(), z.literal("")]).optional(),
    issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please set an issue date"),
    due_date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
    notes: trimmed(2000).optional(),
    reverse_charge: z.coerce.boolean().default(false),
    items: z.array(lineItemSchema).min(1, "Add at least one line to the invoice"),
  })
  .refine((data) => Boolean(data.client_id) || Boolean(data.full_name), {
    message: "Pick a customer, or put a new customer's name in",
    path: ["full_name"],
  })
  .refine(
    (data) => Boolean(data.client_id) || Boolean(data.phone) || Boolean(data.email),
    {
      message: "A new customer needs an email or a phone number to send this to",
      path: ["email"],
    },
  );

export const paymentSchema = z.object({
  invoice_id: z.string().uuid(),
  amount_pence: z.coerce.number().int().positive("Enter how much was paid"),
  method: z.enum(["bank_transfer", "cash", "cheque", "card", "other"]).default("bank_transfer"),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please set the date it was paid"),
  reference: trimmed(120).optional(),
  note: trimmed(1000).optional(),
});

// ---------------------------------------------------------------------------
// Settings, messages, quote responses
// ---------------------------------------------------------------------------

export const settingsSchema = z.object({
  trading_name: trimmed(160).min(2, "The business needs a trading name"),
  legal_name: trimmed(160).optional(),
  address_line1: trimmed(200).optional(),
  address_line2: trimmed(200).optional(),
  city: trimmed(100).optional(),
  postcode: z.union([ukPostcode, z.literal("")]).optional(),
  phone: z.union([ukPhone, z.literal("")]).optional(),
  email: z.union([emailSchema, z.literal("")]).optional(),

  vat_registered: z.coerce.boolean().default(false),
  vat_number: trimmed(20).optional(),
  default_vat_rate_bp: z.coerce.number().int().min(0).max(10000).default(2000),
  cis_enabled: z.coerce.boolean().default(false),
  cis_deduction_rate_bp: z.coerce.number().int().min(0).max(10000).default(2000),
  utr: trimmed(20).optional(),

  bank_account_name: trimmed(120).optional(),
  bank_sort_code: z
    .union([
      z.string().trim().regex(/^\d{2}-?\d{2}-?\d{2}$/, "Sort code should be six digits"),
      z.literal(""),
    ])
    .optional(),
  bank_account_number: z
    .union([z.string().trim().regex(/^\d{8}$/, "Account number should be eight digits"), z.literal("")])
    .optional(),

  payment_terms_days: z.coerce.number().int().min(0).max(180).default(14),
  quote_valid_days: z.coerce.number().int().min(1).max(365).default(30),
  invoice_footer_note: trimmed(1000).optional(),
})
  .refine((data) => !data.vat_registered || Boolean(data.vat_number), {
    message: "A VAT number is required once you mark the business VAT-registered",
    path: ["vat_number"],
  })
  .refine((data) => !data.cis_enabled || Boolean(data.utr), {
    message: "Your UTR is required once CIS is switched on — it must appear on CIS invoices",
    path: ["utr"],
  });

/**
 * A portfolio entry.
 *
 * `before_path` being optional is what makes a row a before-and-after rather
 * than a single photograph; there is no separate "kind" flag to keep in step
 * with it.
 */
export const portfolioItemSchema = z.object({
  after_path: trimmed(400).min(1, "Add the finished photo first"),
  before_path: trimmed(400).optional(),
  caption: trimmed(200).min(3, "Say what the job was, for example 'Garage conversion'"),
  location: trimmed(80).optional(),
});

/**
 * A stretch of time off.
 *
 * The reason is optional but shown to customers when given, so it is capped
 * short and treated as public copy — "family holiday", not a note to self.
 */
export const closureSchema = z
  .object({
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the first day you are away"),
    ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the day you are back"),
    reason: trimmed(120).optional(),
    emergencies_only: z.coerce.boolean().default(true),
  })
  .refine((data) => data.ends_on >= data.starts_on, {
    message: "The last day cannot be before the first",
    path: ["ends_on"],
  });

export const messageSchema = z.object({
  job_id: z.string().uuid(),
  body: trimmed(5000).min(1, "Write your message first"),
});

export const quoteResponseSchema = z.object({
  quote_id: z.string().uuid(),
  reason: trimmed(1000).optional(),
});

export const convertEnquirySchema = z.object({
  enquiry_id: z.string().uuid(),
  // Empty means "create a new client from the enquiry details".
  client_id: z.union([z.string().uuid(), z.literal("")]).optional(),
});

/**
 * Turns a Zod failure into `{ fieldName: "message" }`, which is what the form
 * components expect. Only the first error per field survives — showing three
 * complaints about one input helps nobody.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!(key in result)) {
      result[key] = issue.message;
    }
  }

  return result;
}
