// A bundled catalog of what startups typically pay for.
//
// Checked by hand against vendor pages and recent sources on the date below.
// Locus shows these as estimates, never as facts about your bill. An entry we
// couldn't verify has no amount, so it shows as unknown rather than as a guess.
// MCP URLs come from vendors' own docs, which is why these need no approval:
// see "Proposals" in docs/PRD.md.

import type { CostUnit } from './types.ts'

export const CATALOG_AS_OF = '2026-11-02'

export interface CatalogEntry {
  name: string
  category: string
  plan: string
  amount: number | null
  unit: CostUnit
  billing: 'annual' | 'monthly'
  note: string
  pricingUrl: string
  verified: boolean
  mcpUrl: string | null
}

export const CATALOG: CatalogEntry[] = [
  {"name": "Figma", "category": "design", "plan": "Professional (Full seat)", "amount": 16, "unit": "seat", "billing": "annual", "note": "Billing basis not stated on page; monthly billing is believed higher", "pricingUrl": "https://www.figma.com/pricing/", "verified": true, "mcpUrl": "https://mcp.figma.com/mcp"},
  {"name": "Notion", "category": "workspace", "plan": "Plus", "amount": null, "unit": "seat", "billing": "annual", "note": "Sources conflict ($10 vs $12 annual); monthly ~ $12. Vendor page geo-served EUR 9.50", "pricingUrl": "https://www.notion.com/pricing", "verified": false, "mcpUrl": "https://mcp.notion.com/mcp"},
  {"name": "Linear", "category": "code", "plan": "Basic", "amount": 10, "unit": "seat", "billing": "annual", "note": "Business is $16/seat annual", "pricingUrl": "https://linear.app/pricing", "verified": true, "mcpUrl": "https://mcp.linear.app/mcp"},
  {"name": "Slack", "category": "workspace", "plan": "Pro", "amount": 7.25, "unit": "seat", "billing": "annual", "note": "monthly billing is $8.75", "pricingUrl": "https://slack.com/pricing/pro", "verified": true, "mcpUrl": "https://mcp.slack.com/mcp"},
  {"name": "GitHub", "category": "code", "plan": "Team", "amount": 4, "unit": "seat", "billing": "monthly", "note": "Billing basis not stated on page", "pricingUrl": "https://github.com/pricing", "verified": true, "mcpUrl": "https://api.githubcopilot.com/mcp/"},
  {"name": "Vercel", "category": "hosting", "plan": "Pro", "amount": 20, "unit": "seat", "billing": "monthly", "note": "Includes $20 usage credit; viewer seats free", "pricingUrl": "https://vercel.com/pricing", "verified": true, "mcpUrl": "https://mcp.vercel.com"},
  {"name": "Netlify", "category": "hosting", "plan": "Pro", "amount": 20, "unit": "flat", "billing": "monthly", "note": "Unlimited members, flat fee; Personal is $9", "pricingUrl": "https://www.netlify.com/pricing/", "verified": true, "mcpUrl": "https://netlify-mcp.netlify.app/mcp"},
  {"name": "Cloudflare", "category": "hosting", "plan": "Pro (per domain)", "amount": null, "unit": "flat", "billing": "annual", "note": "monthly billing is $25 per domain; not read from vendor page", "pricingUrl": "https://www.cloudflare.com/plans/", "verified": false, "mcpUrl": "https://mcp.cloudflare.com/mcp"},
  {"name": "Supabase", "category": "data", "plan": "Pro", "amount": 25, "unit": "flat", "billing": "monthly", "note": "Per project/org base; compute and overage extra", "pricingUrl": "https://supabase.com/pricing", "verified": true, "mcpUrl": "https://mcp.supabase.com/mcp"},
  {"name": "Neon", "category": "data", "plan": "Launch", "amount": null, "unit": "usage", "billing": "monthly", "note": "No monthly minimum; $0.106/CU-hour, $0.35/GB-month storage", "pricingUrl": "https://neon.com/pricing", "verified": true, "mcpUrl": "https://mcp.neon.tech/mcp"},
  {"name": "Railway", "category": "hosting", "plan": "Pro", "amount": 20, "unit": "flat", "billing": "monthly", "note": "Includes $20 usage credit; seats unlimited and free", "pricingUrl": "https://railway.com/pricing", "verified": true, "mcpUrl": "https://mcp.railway.com"},
  {"name": "Render", "category": "hosting", "plan": "Pro", "amount": 25, "unit": "flat", "billing": "monthly", "note": "Flat per workspace since 2026-04-23; replaced $19/member Professional", "pricingUrl": "https://render.com/pricing", "verified": true, "mcpUrl": "https://mcp.render.com/mcp"},
  {"name": "Fly.io", "category": "hosting", "plan": "Pay As You Go", "amount": null, "unit": "usage", "billing": "monthly", "note": "No platform fee; shared-cpu-1x 256MB is $2.19/mo; optional support from $29/mo", "pricingUrl": "https://fly.io/docs/about/pricing/", "verified": true, "mcpUrl": null},
  {"name": "AWS", "category": "hosting", "plan": "Pay as you go", "amount": null, "unit": "usage", "billing": "monthly", "note": "Usage-based only", "pricingUrl": "https://aws.amazon.com/pricing/", "verified": false, "mcpUrl": null},
  {"name": "Google Cloud", "category": "hosting", "plan": "Pay as you go", "amount": null, "unit": "usage", "billing": "monthly", "note": "Usage-based only", "pricingUrl": "https://cloud.google.com/pricing", "verified": false, "mcpUrl": null},
  {"name": "DigitalOcean", "category": "hosting", "plan": "Basic Droplet 1 vCPU / 2 GiB", "amount": 12, "unit": "flat", "billing": "monthly", "note": "Smallest Droplet is $4/mo", "pricingUrl": "https://www.digitalocean.com/pricing/droplets", "verified": true, "mcpUrl": null},
  {"name": "Stripe", "category": "payments", "plan": "Standard", "amount": null, "unit": "usage", "billing": "monthly", "note": "2.9% + 30c per successful domestic card charge", "pricingUrl": "https://stripe.com/us/pricing", "verified": true, "mcpUrl": "https://mcp.stripe.com"},
  {"name": "Paddle", "category": "payments", "plan": "Standard (merchant of record)", "amount": null, "unit": "usage", "billing": "monthly", "note": "5% + 50c per transaction", "pricingUrl": "https://www.paddle.com/pricing", "verified": true, "mcpUrl": null},
  {"name": "Resend", "category": "email", "plan": "Pro", "amount": 20, "unit": "flat", "billing": "monthly", "note": "50,000 emails/mo; $35 for 100,000", "pricingUrl": "https://resend.com/pricing", "verified": true, "mcpUrl": "https://mcp.resend.com/mcp"},
  {"name": "Postmark", "category": "email", "plan": "Basic", "amount": 15, "unit": "flat", "billing": "monthly", "note": "10,000 emails/mo; $1.80 per extra 1,000", "pricingUrl": "https://postmarkapp.com/pricing", "verified": true, "mcpUrl": null},
  {"name": "SendGrid", "category": "email", "plan": "Essentials", "amount": 19.95, "unit": "flat", "billing": "monthly", "note": "50,000 emails/mo; from third-party sources dated Oct 2026", "pricingUrl": "https://sendgrid.com/pricing/", "verified": true, "mcpUrl": null},
  {"name": "Mailchimp", "category": "email", "plan": "Essentials", "amount": null, "unit": "flat", "billing": "monthly", "note": "500 contacts; Standard is $20; price scales with contacts; third-party sources only", "pricingUrl": "https://mailchimp.com/pricing/marketing/", "verified": false, "mcpUrl": null},
  {"name": "Loops", "category": "email", "plan": "Growth", "amount": 49, "unit": "flat", "billing": "monthly", "note": "Up to 5,000 subscribed contacts", "pricingUrl": "https://loops.so/pricing", "verified": true, "mcpUrl": null},
  {"name": "Customer.io", "category": "email", "plan": "Essentials", "amount": 100, "unit": "flat", "billing": "monthly", "note": "Includes 5,000 profiles", "pricingUrl": "https://customer.io/pricing", "verified": true, "mcpUrl": null},
  {"name": "PostHog", "category": "analytics", "plan": "Pay as you go", "amount": null, "unit": "usage", "billing": "monthly", "note": "Usage-based with free tier; rates not read", "pricingUrl": "https://posthog.com/pricing", "verified": false, "mcpUrl": "https://mcp.posthog.com/mcp"},
  {"name": "Mixpanel", "category": "analytics", "plan": "Growth", "amount": null, "unit": "usage", "billing": "monthly", "note": "Starts at $0; one fetch suggested paid starts at 1.5M events (~$100 annual / $140 monthly); unconfirmed", "pricingUrl": "https://mixpanel.com/pricing/", "verified": false, "mcpUrl": "https://mcp.mixpanel.com/mcp"},
  {"name": "Amplitude", "category": "analytics", "plan": "Plus", "amount": null, "unit": "usage", "billing": "monthly", "note": "Starts at $0 with first 2M events/mo free; paid rate not read", "pricingUrl": "https://amplitude.com/pricing", "verified": false, "mcpUrl": "https://mcp.amplitude.com/mcp"},
  {"name": "Sentry", "category": "analytics", "plan": "Team", "amount": 26, "unit": "flat", "billing": "annual", "note": "monthly billing is $29", "pricingUrl": "https://sentry.io/pricing/", "verified": true, "mcpUrl": "https://mcp.sentry.dev/mcp"},
  {"name": "Datadog", "category": "analytics", "plan": "Infrastructure Pro", "amount": 15, "unit": "usage", "billing": "annual", "note": "Per host per month; $18 on-demand", "pricingUrl": "https://www.datadoghq.com/pricing/", "verified": true, "mcpUrl": null},
  {"name": "Intercom", "category": "support", "plan": "Essential", "amount": null, "unit": "seat", "billing": "monthly", "note": "Page showed $19 and $29 (35% new-customer discount); annual/monthly basis unclear", "pricingUrl": "https://www.intercom.com/pricing", "verified": false, "mcpUrl": "https://mcp.intercom.com/mcp"},
  {"name": "Zendesk", "category": "support", "plan": "Suite Team", "amount": 55, "unit": "seat", "billing": "annual", "note": "monthly billing is $69; from third-party 2026 sources", "pricingUrl": "https://www.zendesk.com/pricing/", "verified": true, "mcpUrl": null},
  {"name": "HubSpot", "category": "sales", "plan": "Starter Customer Platform", "amount": 20, "unit": "seat", "billing": "monthly", "note": "New-customer promo $10 monthly or $7 annual per seat", "pricingUrl": "https://www.hubspot.com/pricing/crm", "verified": true, "mcpUrl": "https://mcp.hubspot.com"},
  {"name": "Attio", "category": "sales", "plan": "Plus", "amount": null, "unit": "seat", "billing": "monthly", "note": "USD price not verified (EU page showed EUR 31 annual / EUR 39 monthly)", "pricingUrl": "https://attio.com/pricing", "verified": false, "mcpUrl": "https://mcp.attio.com/mcp"},
  {"name": "Airtable", "category": "data", "plan": "Team", "amount": 20, "unit": "seat", "billing": "annual", "note": "Monthly price not shown", "pricingUrl": "https://www.airtable.com/pricing", "verified": true, "mcpUrl": "https://mcp.airtable.com/mcp"},
  {"name": "Google Workspace", "category": "workspace", "plan": "Business Standard", "amount": 14, "unit": "seat", "billing": "annual", "note": "flexible (monthly) is $16.80; Business Starter is cheaper; third-party sources Oct 2026", "pricingUrl": "https://workspace.google.com/pricing", "verified": true, "mcpUrl": null},
  {"name": "Microsoft 365", "category": "workspace", "plan": "Business Standard", "amount": 14, "unit": "seat", "billing": "annual", "note": "Raised from $12.50 on 2026-07-01; monthly billing ~$16.80 (unconfirmed)", "pricingUrl": "https://www.microsoft.com/en-us/microsoft-365/business/compare-all-microsoft-365-business-products", "verified": true, "mcpUrl": null},
  {"name": "Zoom", "category": "workspace", "plan": "Workplace Pro", "amount": 14.16, "unit": "seat", "billing": "annual", "note": "monthly billing is $16.99", "pricingUrl": "https://www.zoom.com/en/products/collaboration-tools/pricing/", "verified": true, "mcpUrl": null},
  {"name": "Loom", "category": "workspace", "plan": "Business", "amount": 15, "unit": "seat", "billing": "annual", "note": "monthly billing is $18; sources partly conflict", "pricingUrl": "https://www.atlassian.com/software/loom/pricing", "verified": true, "mcpUrl": null},
  {"name": "Canva", "category": "design", "plan": "Business", "amount": null, "unit": "seat", "billing": "annual", "note": "$250/person/year or $25 monthly; replaced Teams ($10); single third-party source", "pricingUrl": "https://www.canva.com/pricing/", "verified": false, "mcpUrl": null},
  {"name": "Framer", "category": "design", "plan": "Basic (per site)", "amount": null, "unit": "flat", "billing": "monthly", "note": "Pro site plan is $30; extra editors $20 each; billing basis unclear", "pricingUrl": "https://www.framer.com/pricing", "verified": false, "mcpUrl": null},
  {"name": "Webflow", "category": "design", "plan": "Premium site plan (CMS)", "amount": 25, "unit": "flat", "billing": "annual", "note": "Per site; monthly is $39; Basic is $15 annual / $25 monthly; May 2026 plan merge", "pricingUrl": "https://webflow.com/pricing", "verified": true, "mcpUrl": "https://mcp.webflow.com/mcp"},
  {"name": "Cursor", "category": "code", "plan": "Teams", "amount": null, "unit": "seat", "billing": "monthly", "note": "Cursor docs say $40/user; pricing page fetch showed '$30+'; repriced July 2026", "pricingUrl": "https://cursor.com/pricing", "verified": false, "mcpUrl": null},
  {"name": "Claude", "category": "ai", "plan": "Team Standard seat", "amount": 20, "unit": "seat", "billing": "annual", "note": "monthly billing is $25; Premium seat $100 annual / $125 monthly", "pricingUrl": "https://claude.com/pricing", "verified": true, "mcpUrl": null},
  {"name": "Anthropic API", "category": "ai", "plan": "Pay as you go", "amount": null, "unit": "usage", "billing": "monthly", "note": "Per MTok in/out: Sonnet 5.5 $2/$10, Opus 5.5 $4/$20, Fable 5.1 $10/$50", "pricingUrl": "https://platform.claude.com/docs/en/about-claude/pricing", "verified": true, "mcpUrl": null},
  {"name": "OpenAI API", "category": "ai", "plan": "Pay as you go", "amount": null, "unit": "usage", "billing": "monthly", "note": "Third-party reports GPT-5.5 at $5/$30 per MTok; vendor page not readable", "pricingUrl": "https://openai.com/api/pricing/", "verified": false, "mcpUrl": null},
  {"name": "ChatGPT Business", "category": "ai", "plan": "Business", "amount": 20, "unit": "seat", "billing": "annual", "note": "monthly billing is $25; 2-seat minimum; cut from $25/$30 on 2026-04-02", "pricingUrl": "https://chatgpt.com/business/pricing", "verified": true, "mcpUrl": null},
  {"name": "ElevenLabs", "category": "ai", "plan": "Creator", "amount": 22, "unit": "flat", "billing": "monthly", "note": "Pro $99, Scale $299; first month discounted", "pricingUrl": "https://elevenlabs.io/pricing", "verified": true, "mcpUrl": "https://api.elevenlabs.io/v1/mcp"},
  {"name": "Midjourney", "category": "ai", "plan": "Basic", "amount": 10, "unit": "flat", "billing": "monthly", "note": "yearly billing is $8/mo; Standard $30", "pricingUrl": "https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans", "verified": true, "mcpUrl": null},
  {"name": "Gusto", "category": "people", "plan": "Simple", "amount": 49, "unit": "flat", "billing": "monthly", "note": "Plus $6 per person per month", "pricingUrl": "https://gusto.com/product/pricing", "verified": true, "mcpUrl": null},
  {"name": "Rippling", "category": "people", "plan": "Starting price", "amount": 8, "unit": "seat", "billing": "monthly", "note": "Per employee/month; modular, some products add a base fee", "pricingUrl": "https://www.rippling.com/pricing", "verified": true, "mcpUrl": null},
  {"name": "Deel", "category": "people", "plan": "Contractor management", "amount": 49, "unit": "seat", "billing": "monthly", "note": "Per contractor per month; EOR from $599", "pricingUrl": "https://www.deel.com/pricing/", "verified": true, "mcpUrl": null},
  {"name": "Carta", "category": "finance", "plan": "Contact sales", "amount": null, "unit": "flat", "billing": "monthly", "note": "Contact sales; not checked", "pricingUrl": "https://carta.com/pricing/", "verified": false, "mcpUrl": null},
  {"name": "Mercury", "category": "finance", "plan": "Mercury Plus", "amount": 29.9, "unit": "flat", "billing": "monthly", "note": "Base Mercury plan is $0; Pro is $299", "pricingUrl": "https://mercury.com/pricing", "verified": true, "mcpUrl": null},
  {"name": "Brex", "category": "finance", "plan": "Premium", "amount": null, "unit": "seat", "billing": "annual", "note": "Essentials is $0; Premium monthly ~$15; third-party sources", "pricingUrl": "https://www.brex.com/pricing", "verified": false, "mcpUrl": null},
  {"name": "Ramp", "category": "finance", "plan": "Plus", "amount": null, "unit": "seat", "billing": "monthly", "note": "annual $12; plus unpublished platform fee; third-party", "pricingUrl": "https://ramp.com/pricing", "verified": false, "mcpUrl": null},
  {"name": "QuickBooks", "category": "finance", "plan": "Simple Start", "amount": null, "unit": "flat", "billing": "monthly", "note": "Third-party sources only; some show $35", "pricingUrl": "https://quickbooks.intuit.com/pricing/", "verified": false, "mcpUrl": null},
  {"name": "Xero", "category": "finance", "plan": "Growing", "amount": 59, "unit": "flat", "billing": "monthly", "note": "Early is $27; intro 90% off for 6 months for new US customers (ends 2026-11-02)", "pricingUrl": "https://www.xero.com/us/pricing-plans/", "verified": true, "mcpUrl": null},
  {"name": "DocuSign", "category": "legal", "plan": "Standard", "amount": null, "unit": "seat", "billing": "annual", "note": "2026 sources conflict ($25 vs $30); billed monthly on annual term", "pricingUrl": "https://www.docusign.com/products/electronic-signature/pricing", "verified": false, "mcpUrl": null},
  {"name": "Vanta", "category": "security", "plan": "Contact sales", "amount": null, "unit": "flat", "billing": "monthly", "note": "Contact sales; not checked", "pricingUrl": "https://www.vanta.com/pricing", "verified": false, "mcpUrl": null},
  {"name": "Drata", "category": "security", "plan": "Contact sales", "amount": null, "unit": "flat", "billing": "monthly", "note": "Contact sales; not checked", "pricingUrl": "https://drata.com/pricing", "verified": false, "mcpUrl": null},
  {"name": "1Password", "category": "security", "plan": "Business", "amount": null, "unit": "seat", "billing": "annual", "note": "Sources conflict ($7.99 vs $8.99); annual only per some sources", "pricingUrl": "https://1password.com/pricing/password-manager", "verified": false, "mcpUrl": null},
  {"name": "Clerk", "category": "security", "plan": "Pro", "amount": 20, "unit": "flat", "billing": "annual", "note": "monthly billing is $25; 50,000 retained users/app included", "pricingUrl": "https://clerk.com/pricing", "verified": true, "mcpUrl": "https://mcp.clerk.com/mcp"},
  {"name": "Auth0", "category": "security", "plan": "B2C Essentials (500 MAU)", "amount": 35, "unit": "usage", "billing": "monthly", "note": "B2B Essentials 500 MAU is $150", "pricingUrl": "https://auth0.com/pricing", "verified": true, "mcpUrl": null},
  {"name": "Twilio", "category": "email", "plan": "Programmable SMS (US)", "amount": null, "unit": "usage", "billing": "monthly", "note": "$0.0083 per segment plus carrier fees", "pricingUrl": "https://www.twilio.com/en-us/sms/pricing/us", "verified": true, "mcpUrl": null},
  {"name": "Cal.com", "category": "scheduling", "plan": "Teams", "amount": 12, "unit": "seat", "billing": "annual", "note": "monthly billing believed $15", "pricingUrl": "https://cal.com/pricing", "verified": true, "mcpUrl": null},
  {"name": "Calendly", "category": "scheduling", "plan": "Standard", "amount": 10, "unit": "seat", "billing": "annual", "note": "Teams is $16 annual; monthly prices not shown", "pricingUrl": "https://calendly.com/pricing", "verified": true, "mcpUrl": null},
  {"name": "Dropbox", "category": "workspace", "plan": "Business", "amount": null, "unit": "seat", "billing": "monthly", "note": "Third-party sources only; conflicting", "pricingUrl": "https://www.dropbox.com/business/plans-comparison", "verified": false, "mcpUrl": null},
  {"name": "Asana", "category": "workspace", "plan": "Starter", "amount": 10.99, "unit": "seat", "billing": "annual", "note": "monthly billing is $13.49; Advanced $24.99 annual", "pricingUrl": "https://asana.com/pricing", "verified": true, "mcpUrl": "https://mcp.asana.com/v2/mcp"},
  {"name": "Jira", "category": "code", "plan": "Standard", "amount": null, "unit": "seat", "billing": "monthly", "note": "Per-seat rate varies by seat tier (~$7.5-9.7 reported), changed 2026-10-13; not verified", "pricingUrl": "https://www.atlassian.com/software/jira/pricing", "verified": false, "mcpUrl": "https://mcp.atlassian.com/v2/mcp"},
]

const BY_NAME = new Map(CATALOG.map((e) => [e.name.toLowerCase(), e]))

export function findInCatalog(name: string): CatalogEntry | undefined {
  return BY_NAME.get(name.trim().toLowerCase())
}

/** Finds catalog services named in a block of text, matching whole words only. */
export function servicesMentionedIn(text: string): CatalogEntry[] {
  return CATALOG.filter((e) => {
    const escaped = e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^\\w])${escaped}([^\\w]|$)`).test(text)
  })
}
