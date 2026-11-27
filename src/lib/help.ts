/**
 * The "How do I…?" guides behind Help, and the walkthroughs they start.
 *
 * Plain data on purpose: adding a guide when someone asks a new question is a
 * matter of adding an entry here, and the same file is what gets copied into
 * the next tradesperson's app.
 *
 * Each step is one thing to tap. `target` is a CSS selector for the button
 * the walkthrough highlights; most are `[data-help="…"]` markers on the
 * buttons themselves, so renaming a button's wording does not break a guide.
 * A step with `path` can take the user to that screen; a step that happens on
 * one particular job or invoice says so in `where` instead, because the guide
 * cannot know which one they mean.
 */

export interface HelpStep {
  /** What to do, in a sentence. */
  text: string;
  /** The button or field to highlight, when there is one. */
  target?: string;
  /** The screen this step happens on, when it is always the same one. */
  path?: string;
  /** Where to be, when it is "whichever job you mean". */
  where?: string;
  /**
   * Typing or choosing, not tapping: the walkthrough waits for "Next"
   * instead of moving on when the highlighted thing is touched.
   */
  manual?: boolean;
}

export interface HelpArticle {
  id: string;
  question: string;
  topic: HelpTopic;
  /** Extra words people might search with. */
  keywords: string[];
  /** One line under the question. */
  summary: string;
  steps: HelpStep[];
}

export type HelpTopic = "Money" | "Jobs and diary" | "Customers" | "Your phone" | "Your business";

export const HELP_TOPICS: HelpTopic[] = ["Money", "Jobs and diary", "Customers", "Your phone", "Your business"];

const nav = (href: string) => `nav a[href="${href}"], a[href="${href}"]`;

export const HELP_ARTICLES: HelpArticle[] = [
  // --- Money ----------------------------------------------------------------
  {
    id: "invoice-any-customer",
    question: "How do I invoice a customer for work that wasn't booked through the app?",
    topic: "Money",
    keywords: ["invoice", "bill", "new invoice", "no job", "customer", "standalone", "charge"],
    summary: "Any customer, any work. You don't need a job first.",
    steps: [
      { text: "Open Money.", target: nav("/app/invoices") },
      { text: "Tap New invoice.", target: '[data-help="new-invoice"]', path: "/app/invoices" },
      {
        text: "Pick the customer. Not on the list? Leave it on 'Someone new' and type their name, email and phone.",
        target: '[name="client_id"]',
        path: "/app/invoices/new",
        manual: true,
      },
      {
        text: "Add what you're charging for: Add labour for your time, Add materials for parts. Put in how many and the price each.",
        target: '[data-help="add-lines"]',
        path: "/app/invoices/new",
        manual: true,
      },
      { text: "Tap Save invoice. Nothing is sent yet.", target: '[data-help="save-invoice"]', path: "/app/invoices/new" },
      {
        text: "Check it, then tap Send to email it to them. It's only sent when you confirm.",
        target: '[data-help="send-invoice"]',
        where: "On the invoice you just saved",
      },
    ],
  },
  {
    id: "add-materials",
    question: "How do I add materials to an invoice or quote?",
    topic: "Money",
    keywords: ["materials", "parts", "items", "line", "pipe", "boiler", "add a line", "labour"],
    summary: "Each line is labour, materials or other. Use the buttons under the lines.",
    steps: [
      {
        text: "Open the invoice or quote you're writing (or start one from a job, or Money → New invoice).",
        where: "On a new invoice or quote",
      },
      {
        text: "Tap Add materials. A new line appears, already marked Materials.",
        target: '[data-help="add-materials"]',
        where: "Under the lines on the invoice or quote",
      },
      {
        text: "Type what it is (e.g. '15mm copper pipe, 3 metres'), how many, and the price each. The total works itself out.",
        manual: true,
      },
      {
        text: "Saved prices you use a lot? Pick them from 'Or take one from your price list' instead of typing them each time.",
        target: '[name="price-list-picker"]',
        manual: true,
      },
    ],
  },
  {
    id: "invoice-a-job",
    question: "How do I invoice a job I've finished?",
    topic: "Money",
    keywords: ["invoice", "job", "finished", "bill", "quote", "accepted"],
    summary: "Start it from the job, and the quote's lines come across for you.",
    steps: [
      { text: "Open Jobs and tap the job.", target: nav("/app/jobs") },
      {
        text: "Tap New invoice on the job. If the customer accepted a quote, its lines are already filled in.",
        target: 'a[href^="/app/jobs/"][href*="/invoice"]',
        where: "On the job's page",
      },
      { text: "Add or change any lines, then tap Save invoice.", target: '[data-help="save-invoice"]' },
      { text: "Tap Send to email it to the customer.", target: '[data-help="send-invoice"]' },
    ],
  },
  {
    id: "record-payment",
    question: "A customer has paid. How do I mark the invoice paid?",
    topic: "Money",
    keywords: ["paid", "payment", "cash", "bank transfer", "card", "receipt", "money in", "part paid", "record"],
    summary: "Record what came in. Part payments add up until it's paid.",
    steps: [
      { text: "Open Money and tap the invoice.", target: nav("/app/invoices") },
      {
        text: "Under Money in, fill in How much, How they paid and When.",
        target: '[name="method"]',
        where: "On the invoice",
        manual: true,
      },
      {
        text: "Tap Record the payment. When it adds up to the total, the invoice shows as paid.",
        target: '[data-help="record-payment"]',
        where: "On the invoice",
      },
    ],
  },
  {
    id: "send-quote",
    question: "How do I send a customer a quote?",
    topic: "Money",
    keywords: ["quote", "estimate", "price", "send", "accept"],
    summary: "Quotes belong to a job. They can accept it with one tap from the email.",
    steps: [
      { text: "Open Jobs and tap the job.", target: nav("/app/jobs") },
      {
        text: "Tap New quote.",
        target: 'a[href^="/app/jobs/"][href$="/quote"]',
        where: "On the job's page",
      },
      {
        text: "Add labour and materials, and a note if you like. Then tap Save quote.",
        target: '[data-help="save-quote"]',
      },
      { text: "Tap Send to email it. They can accept it from the email.", target: '[data-help="send-quote"]' },
    ],
  },

  // --- Jobs and diary ---------------------------------------------------------
  {
    id: "job-from-call",
    question: "A customer rang me. How do I add the job?",
    topic: "Jobs and diary",
    keywords: ["phone", "call", "rang", "new job", "add job", "create job", "customer"],
    summary: "Jobs → Job from a call. It adds the customer too if they're new.",
    steps: [
      { text: "Open Jobs.", target: nav("/app/jobs") },
      { text: "Tap Job from a call.", target: 'a[href="/app/jobs/new"]', path: "/app/jobs" },
      { text: "Fill in who, where and what the job is.", path: "/app/jobs/new", manual: true },
      { text: "Tap Save the job.", target: '[data-help="save-job"]', path: "/app/jobs/new" },
    ],
  },
  {
    id: "enquiry-to-job",
    question: "Someone sent a request on the website. What do I do with it?",
    topic: "Jobs and diary",
    keywords: ["enquiry", "request", "website", "form", "lead", "decline"],
    summary: "Open it from Enquiries, then make it a job or decline it.",
    steps: [
      { text: "Open Enquiries and tap the request.", target: nav("/app/enquiries") },
      {
        text: "Want the work? Tap Turn this into a job. Everything they told you comes across.",
        target: '[data-help="enquiry-to-job"]',
        where: "On the request",
      },
    ],
  },
  {
    id: "book-a-job",
    question: "How do I book a job in for a day?",
    topic: "Jobs and diary",
    keywords: ["book", "schedule", "diary", "date", "time", "appointment", "visit"],
    summary: "From the job. The customer gets one email with the date.",
    steps: [
      { text: "Open Jobs and tap the job.", target: nav("/app/jobs") },
      {
        text: "Under Book it in, pick the date, arrival time and how long you'll be there.",
        target: "#schedule",
        where: "On the job's page",
        manual: true,
      },
      { text: "Tap Book it in. Longer jobs: tap Add another day for each extra day.", target: '[data-help="book-day"]' },
    ],
  },
  {
    id: "move-a-day",
    question: "How do I move a booked job to another day?",
    topic: "Jobs and diary",
    keywords: ["move", "reschedule", "change date", "rebook", "postpone"],
    summary: "Move it in place. The customer gets one 'your booking has moved' email.",
    steps: [
      { text: "Open the job from Jobs or the Diary.", target: nav("/app/jobs") },
      { text: "Next to the day, tap Move.", target: '[data-help="move-day"]', where: "On the job's page, under Days on site" },
      {
        text: "Pick the new date and time. Leave 'Email the customer the new time' on to tell them.",
        manual: true,
      },
      { text: "Tap Move this day.", target: '[data-help="book-day"]' },
    ],
  },
  {
    id: "time-off",
    question: "How do I book a holiday or days off?",
    topic: "Jobs and diary",
    keywords: ["holiday", "time off", "away", "closed", "day off", "vacation", "christmas"],
    summary: "The website tells customers you're away, so nobody waits on a reply.",
    steps: [
      { text: "Open the Diary.", target: nav("/app/diary") },
      { text: "Tap Book time off.", target: '[data-help="book-time-off"]', path: "/app/diary" },
      { text: "Pick the first and last day away, and what to tell customers. Then Save.", path: "/app/diary", manual: true },
      {
        text: "Plans changed? Tap the pencil next to it to change the dates.",
        target: 'button[title="Change this time off"]',
        path: "/app/diary",
      },
    ],
  },
  {
    id: "reminder",
    question: "How do I set a reminder, or change one?",
    topic: "Jobs and diary",
    keywords: ["reminder", "remind", "to do", "todo", "note", "alarm", "edit reminder", "snooze"],
    summary: "Your phone buzzes at the time you pick. They show under To do on Today.",
    steps: [
      { text: "Open Today.", target: nav("/app") },
      { text: "Under To do, tap Add. (Or tap Remind me about this on any job or customer.)", target: '[data-help="add-todo"]', path: "/app" },
      { text: "Say what it's for and pick when. Then tap Set reminder.", path: "/app", manual: true },
      { text: "To change one later, tap Edit on it.", target: '[data-help="edit-todo"]', path: "/app" },
    ],
  },

  // --- Customers --------------------------------------------------------------
  {
    id: "find-customer",
    question: "Where do I find a customer and everything I've done for them?",
    topic: "Customers",
    keywords: ["customer", "client", "history", "address", "phone", "find", "contact"],
    summary: "Customers lists everyone. Each one shows their jobs, quotes and invoices.",
    steps: [
      { text: "On Today, tap Customers.", target: 'a[href="/app/clients"]', path: "/app" },
      { text: "Tap the customer. Their jobs, quotes, invoices and contact details are all on one page.", path: "/app/clients", manual: true },
    ],
  },
  {
    id: "portal",
    question: "How do I let a customer see their quotes and invoices online?",
    topic: "Customers",
    keywords: ["portal", "login", "account", "customer access", "online"],
    summary: "Send them a link. They sign in with a code, no password.",
    steps: [
      { text: "On Today, tap Customers, then the customer.", target: 'a[href="/app/clients"]', path: "/app" },
      { text: "Under Seeing their jobs online, tap Send them a link.", target: '[data-help="portal-invite"]', where: "On the customer's page" },
    ],
  },

  // --- Your phone -------------------------------------------------------------
  {
    id: "notifications",
    question: "How do I get my phone to buzz when a request comes in?",
    topic: "Your phone",
    keywords: ["notifications", "push", "buzz", "alert", "home screen", "install", "iphone", "android"],
    summary: "Add the app to your home screen, then turn notifications on.",
    steps: [
      {
        text: "iPhone: in Safari, tap Share, then Add to Home Screen, and open the app from the new icon. Android: Chrome usually offers 'Install app'.",
        manual: true,
      },
      { text: "On Today, tap Settings.", target: 'a[href="/app/settings"]', path: "/app" },
      { text: "Tap Notifications.", target: 'a[href="/app/settings/notifications"]', path: "/app/settings" },
      { text: "Tap Turn notifications on, and say Allow when your phone asks.", target: '[data-help="push-on"]', path: "/app/settings/notifications" },
    ],
  },

  // --- Your business ----------------------------------------------------------
  {
    id: "price-list",
    question: "How do I save prices I use a lot?",
    topic: "Your business",
    keywords: ["price list", "prices", "rates", "saved", "call out", "hourly"],
    summary: "Save them once, then pick them on any quote or invoice.",
    steps: [
      { text: "On Today, tap Settings.", target: 'a[href="/app/settings"]', path: "/app" },
      { text: "Tap Price list.", target: 'a[href="/app/settings/prices"]', path: "/app/settings" },
      { text: "Tap Add an item, then fill in what it is, the type and the price.", target: '[data-help="add-price"]', path: "/app/settings/prices" },
    ],
  },
  {
    id: "add-staff",
    question: "How do I give someone who works for me a login?",
    topic: "Your business",
    keywords: ["staff", "team", "employee", "login", "access", "permissions", "apprentice"],
    summary: "You choose what each person can see and do.",
    steps: [
      { text: "On Today, tap Settings.", target: 'a[href="/app/settings"]', path: "/app" },
      { text: "Tap Team.", target: 'a[href="/app/settings/team"]', path: "/app/settings" },
      { text: "Tap Add someone.", target: '[data-help="add-staff"]', path: "/app/settings/team" },
      {
        text: "Put in their name and email, pick what they can do, then tap Add and email them. They get an email to sign in.",
        path: "/app/settings/team",
        manual: true,
      },
    ],
  },
  {
    id: "work-photos",
    question: "How do I put photos of my work on the website?",
    topic: "Your business",
    keywords: ["photos", "gallery", "our work", "website", "pictures", "before and after"],
    summary: "They show on the Our work page of your website.",
    steps: [
      { text: "On Today, tap Our work.", target: 'a[href="/app/portfolio"]', path: "/app" },
      {
        text: "Tap Add a job. (Got a batch of photos for one category? Add several photos does them in one go.)",
        target: '[data-help="add-work"]',
        path: "/app/portfolio",
      },
      {
        text: "Add the photo of the finished job (and a before photo if you have one), say what the job was and where, then tap Add to the gallery.",
        path: "/app/portfolio",
        manual: true,
      },
    ],
  },
];

export function findArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.id === id);
}

/** Simple, forgiving search: every word typed must appear somewhere. */
export function searchArticles(query: string): HelpArticle[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return HELP_ARTICLES;
  return HELP_ARTICLES.filter((article) => {
    const haystack = [
      article.question,
      article.summary,
      article.topic,
      ...article.keywords,
      ...article.steps.map((step) => step.text),
    ]
      .join(" ")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
