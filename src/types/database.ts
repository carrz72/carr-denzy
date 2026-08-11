/**
 * Database types.
 *
 * Hand-maintained rather than generated, because the project has no Supabase
 * CLI link at build time. Keep in step with `supabase/migrations/*`.
 *
 * Convention: every `*_pence` field is an integer number of pence, and every
 * `*_milli` field is a quantity multiplied by 1000. Nothing here is a float.
 *
 * These are `type` aliases, not `interface` declarations, and that is load-
 * bearing. postgrest-js constrains every table to `Record<string, unknown>`.
 * A type alias gets an implicit index signature and satisfies that; an
 * interface does not, and the whole schema silently degrades to `never` — so
 * `.update({ role })` fails with "not assignable to type 'never'" rather than
 * anything that points at the real cause. Do not convert these to interfaces.
 */

export type UserRole = "owner" | "staff" | "client";
export type UrgencyLevel = "emergency" | "soon" | "flexible";
export type EnquiryStatus = "new" | "read" | "converted" | "declined";
export type JobStatus =
  | "new"
  | "quoted"
  | "accepted"
  | "declined"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "invoiced"
  | "paid"
  | "cancelled";
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";
export type InvoiceStatus = "draft" | "sent" | "part_paid" | "paid" | "overdue" | "void";
export type PaymentMethod = "bank_transfer" | "cash" | "cheque" | "card" | "other";
export type LineKind = "labour" | "materials" | "other";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export type Settings = {
  id: boolean;
  trading_name: string;
  legal_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  vat_registered: boolean;
  vat_number: string | null;
  default_vat_rate_bp: number;
  cis_enabled: boolean;
  cis_deduction_rate_bp: number;
  utr: string | null;
  bank_account_name: string | null;
  bank_sort_code: string | null;
  bank_account_number: string | null;
  payment_terms_days: number;
  quote_valid_days: number;
  invoice_footer_note: string | null;
  created_at: string;
  updated_at: string;
}

export type Service = {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  description: string | null;
  icon: string | null;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export type Client = {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type Property = {
  id: string;
  client_id: string;
  label: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  postcode: string;
  access_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type Enquiry = {
  id: string;
  reference: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  service_id: string | null;
  service_label: string | null;
  description: string;
  urgency: UrgencyLevel;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  preferred_dates: string | null;
  status: EnquiryStatus;
  decline_reason: string | null;
  client_id: string | null;
  job_id: string | null;
  source_ip_hash: string | null;
  created_at: string;
  updated_at: string;
}

export type Job = {
  id: string;
  reference: string;
  client_id: string;
  property_id: string | null;
  service_id: string | null;
  title: string;
  description: string | null;
  status: JobStatus;
  urgency: UrgencyLevel;
  assigned_to: string | null;
  scheduled_start: string | null;
  duration_minutes: number | null;
  completed_at: string | null;
  private_notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type JobEvent = {
  id: string;
  job_id: string;
  from_status: JobStatus | null;
  to_status: JobStatus;
  note: string | null;
  actor_id: string | null;
  created_at: string;
}

export type JobNote = {
  id: string;
  job_id: string;
  author_id: string | null;
  body: string;
  visible_to_client: boolean;
  client_key: string | null;
  created_at: string;
}

export type JobPhoto = {
  id: string;
  job_id: string | null;
  enquiry_id: string | null;
  storage_path: string;
  caption: string | null;
  visible_to_client: boolean;
  uploaded_by: string | null;
  byte_size: number | null;
  created_at: string;
}

export type Message = {
  id: string;
  job_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export type PriceItem = {
  id: string;
  description: string;
  unit_price_pence: number;
  kind: LineKind;
  unit: string;
  times_used: number;
  created_at: string;
}

export type Quote = {
  id: string;
  reference: string;
  job_id: string;
  client_id: string;
  status: QuoteStatus;
  intro_note: string | null;
  terms: string | null;
  subtotal_pence: number;
  tax_pence: number;
  total_pence: number;
  valid_until: string | null;
  sent_at: string | null;
  responded_at: string | null;
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type QuoteItem = {
  id: string;
  quote_id: string;
  description: string;
  kind: LineKind;
  quantity_milli: number;
  unit_price_pence: number;
  vat_rate_bp: number;
  sort_order: number;
  created_at: string;
}

export type Invoice = {
  id: string;
  reference: string;
  job_id: string | null;
  client_id: string;
  quote_id: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  business_snapshot: Record<string, unknown> | null;
  client_snapshot: Record<string, unknown> | null;
  subtotal_pence: number;
  vat_pence: number;
  cis_deduction_pence: number;
  total_pence: number;
  paid_pence: number;
  reverse_charge: boolean;
  notes: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  credit_note_for: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  description: string;
  kind: LineKind;
  quantity_milli: number;
  unit_price_pence: number;
  vat_rate_bp: number;
  sort_order: number;
  created_at: string;
}

export type Payment = {
  id: string;
  invoice_id: string;
  amount_pence: number;
  method: PaymentMethod;
  paid_on: string;
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
}

/**
 * One row is one JOB, not one photograph.
 *
 * `before_path` is what makes a row a pair. Two separate rows would render as
 * two neighbouring cards, which is precisely what made a before-and-after read
 * as two unrelated projects.
 */
export type PortfolioItem = {
  id: string;
  after_path: string;
  before_path: string | null;
  caption: string;
  location: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * A stretch of days the business is not working.
 *
 * A range, not one row per day: a fortnight away is one fact, and storing it as
 * fourteen rows would make cancelling it fourteen deletes.
 */
export type Closure = {
  id: string;
  starts_on: string;
  ends_on: string;
  reason: string | null;
  emergencies_only: boolean;
  created_at: string;
  updated_at: string;
}

export type AuditLogEntry = {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

/**
 * A foreign key, in the shape postgrest-js's select-query parser expects.
 *
 * These are not decoration. The parser resolves `property:properties(...)` in a
 * select string by looking the relation up here — with an empty array it cannot
 * find one and the whole row type collapses to a `SelectQueryError`. Every
 * foreign key the UI joins across has to be declared.
 */
type Rel<
  Name extends string,
  Column extends string,
  Referenced extends string,
> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Referenced;
  referencedColumns: ["id"];
};

/**
 * Shapes a row type into the Row/Insert/Update triple `@supabase/supabase-js`
 * expects. Columns with database defaults are optional on insert, which is why
 * `Insert` is a partial of everything plus whatever the caller must supply.
 */
type Table<
  Row,
  RequiredOnInsert extends keyof Row = never,
  Relationships extends readonly unknown[] = [],
> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, RequiredOnInsert>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, "id" | "email">;
      settings: Table<Settings>;
      services: Table<Service, "slug" | "name" | "blurb">;

      clients: Table<
        Client,
        "full_name",
        [Rel<"clients_profile_id_fkey", "profile_id", "profiles">]
      >;

      properties: Table<
        Property,
        "client_id" | "address_line1" | "postcode",
        [Rel<"properties_client_id_fkey", "client_id", "clients">]
      >;

      enquiries: Table<
        Enquiry,
        "full_name" | "description",
        [
          Rel<"enquiries_service_id_fkey", "service_id", "services">,
          Rel<"enquiries_client_id_fkey", "client_id", "clients">,
          Rel<"enquiries_job_id_fkey", "job_id", "jobs">,
        ]
      >;

      jobs: Table<
        Job,
        "client_id" | "title",
        [
          Rel<"jobs_client_id_fkey", "client_id", "clients">,
          Rel<"jobs_property_id_fkey", "property_id", "properties">,
          Rel<"jobs_service_id_fkey", "service_id", "services">,
          Rel<"jobs_assigned_to_fkey", "assigned_to", "profiles">,
        ]
      >;

      job_events: Table<
        JobEvent,
        "job_id" | "to_status",
        [
          Rel<"job_events_job_id_fkey", "job_id", "jobs">,
          Rel<"job_events_actor_id_fkey", "actor_id", "profiles">,
        ]
      >;

      job_notes: Table<
        JobNote,
        "job_id" | "body",
        [
          Rel<"job_notes_job_id_fkey", "job_id", "jobs">,
          Rel<"job_notes_author_id_fkey", "author_id", "profiles">,
        ]
      >;

      job_photos: Table<
        JobPhoto,
        "storage_path",
        [
          Rel<"job_photos_job_id_fkey", "job_id", "jobs">,
          Rel<"job_photos_enquiry_id_fkey", "enquiry_id", "enquiries">,
        ]
      >;

      messages: Table<
        Message,
        "job_id" | "sender_id" | "body",
        [
          Rel<"messages_job_id_fkey", "job_id", "jobs">,
          Rel<"messages_sender_id_fkey", "sender_id", "profiles">,
        ]
      >;

      price_items: Table<PriceItem, "description" | "unit_price_pence">;

      quotes: Table<
        Quote,
        "job_id" | "client_id",
        [
          Rel<"quotes_job_id_fkey", "job_id", "jobs">,
          Rel<"quotes_client_id_fkey", "client_id", "clients">,
        ]
      >;

      quote_items: Table<
        QuoteItem,
        "quote_id" | "description" | "unit_price_pence",
        [Rel<"quote_items_quote_id_fkey", "quote_id", "quotes">]
      >;

      invoices: Table<
        Invoice,
        "client_id",
        [
          Rel<"invoices_job_id_fkey", "job_id", "jobs">,
          Rel<"invoices_client_id_fkey", "client_id", "clients">,
          Rel<"invoices_quote_id_fkey", "quote_id", "quotes">,
        ]
      >;

      invoice_items: Table<
        InvoiceItem,
        "invoice_id" | "description" | "unit_price_pence",
        [Rel<"invoice_items_invoice_id_fkey", "invoice_id", "invoices">]
      >;

      payments: Table<
        Payment,
        "invoice_id" | "amount_pence",
        [Rel<"payments_invoice_id_fkey", "invoice_id", "invoices">]
      >;

      portfolio_items: Table<PortfolioItem, "after_path" | "caption">;

      closures: Table<Closure, "starts_on" | "ends_on">;

      audit_log: Table<AuditLogEntry, "action">;
    };
    Views: Record<string, never>;
    Functions: {
      accept_quote: { Args: { p_quote_id: string }; Returns: undefined };
      decline_quote: { Args: { p_quote_id: string; p_reason?: string | null }; Returns: undefined };
      mark_overdue_invoices: { Args: Record<string, never>; Returns: number };
      current_closure: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          starts_on: string;
          ends_on: string;
          reason: string | null;
          emergencies_only: boolean;
          is_active: boolean;
        }[];
      };
      record_audit_entry: {
        Args: {
          p_action: string;
          p_entity?: string | null;
          p_entity_id?: string | null;
          p_detail?: Record<string, unknown> | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      urgency_level: UrgencyLevel;
      enquiry_status: EnquiryStatus;
      job_status: JobStatus;
      quote_status: QuoteStatus;
      invoice_status: InvoiceStatus;
      payment_method: PaymentMethod;
      line_kind: LineKind;
    };
    CompositeTypes: Record<string, never>;
  };
}

/** A job with the joins the UI almost always needs alongside it. */
export type JobWithRelations = Job & {
  client: Pick<Client, "id" | "full_name" | "email" | "phone"> | null;
  property: Pick<Property, "id" | "address_line1" | "address_line2" | "city" | "postcode"> | null;
  service: Pick<Service, "id" | "name" | "slug"> | null;
};
