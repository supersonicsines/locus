// The services a company is likeliest to use, weighted towards what a tech startup pays for.
//
// The order is editorial judgement, not data. Nobody measured it. The first block is hand-ordered,
// roughly "how likely is a startup of twenty people to have a bill for this". After the blank line the
// list is grouped by category and ordered within each group, so rank means little past that point.
//
// Each line is: id | display name | category | primary domain | aliases, comma separated.
// An alias must be a name people really use for this service and nothing else. Where one word could
// mean two companies (Runway, Lambda, Fathom, Luma, Apollo, Cube) neither of them gets the bare word:
// a wrong logo is worse than none, so the bare word stays a monogram.
//
// There are no prices here. Prices live in src/core/catalog.ts, and only ones that were checked.
// The studio doesn't import this file: the list ships inside the logo bundle, built by scripts/build-logos.mjs.

export const SERVICE_CATEGORIES = ['cloud', 'dev', 'ai', 'data', 'analytics', 'product', 'design', 'workspace', 'comms', 'marketing', 'sales', 'support', 'finance', 'people', 'legal', 'security', 'ops', 'commerce'] as const
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]

export interface Service {
  /** Stable. Never reuse one for a different company. */
  id: string
  name: string
  category: ServiceCategory
  domain: string
  aliases: string[]
  /** 1 is the likeliest. Editorial, see above. */
  rank: number
}

const LIST = `
google-workspace|Google Workspace|workspace|workspace.google.com|G Suite,GSuite,Google Apps
slack|Slack|comms|slack.com|Slack Pro,Slack Business+
github|GitHub|dev|github.com|GitHub Team,GitHub Enterprise,GitHub.com
aws|AWS|cloud|aws.amazon.com|Amazon Web Services,Amazon AWS
stripe|Stripe|finance|stripe.com|Stripe Payments,Stripe Billing
notion|Notion|workspace|notion.com|Notion Labs,Notion.so
figma|Figma|design|figma.com|Figma Design
linear|Linear|product|linear.app|Linear.app,Linear App
vercel|Vercel|cloud|vercel.com|Vercel Pro
openai-api|OpenAI API|ai|openai.com|OpenAI,OpenAI Platform
anthropic-api|Anthropic API|ai|anthropic.com|Anthropic,Claude API
chatgpt|ChatGPT|ai|chatgpt.com|ChatGPT Business,ChatGPT Team,ChatGPT Enterprise,ChatGPT Plus,ChatGPT Pro
claude|Claude|ai|claude.ai|Claude.ai,Claude Team,Claude Pro,Claude Max,Claude Enterprise,Claude Code
cursor|Cursor|dev|cursor.com|Cursor IDE,Anysphere
google-cloud|Google Cloud|cloud|cloud.google.com|GCP,Google Cloud Platform
microsoft-365|Microsoft 365|workspace|microsoft.com|Office 365,O365,M365,MS 365,Microsoft Office,MS Office
zoom|Zoom|comms|zoom.com|Zoom Workplace,Zoom Meetings,Zoom Video
hubspot|HubSpot|sales|hubspot.com|HubSpot CRM,HubSpot Marketing Hub
salesforce|Salesforce|sales|salesforce.com|SFDC,Sales Cloud
jira|Jira|product|atlassian.com|Jira Software,Jira Cloud,Atlassian Jira
confluence|Confluence|workspace|atlassian.com|Atlassian Confluence
cloudflare|Cloudflare|cloud|cloudflare.com|Cloudflare Workers,Cloudflare Pages,Cloudflare R2
datadog|Datadog|dev|datadoghq.com|Datadog APM
sentry|Sentry|dev|sentry.io|Sentry.io
supabase|Supabase|data|supabase.com|
intercom|Intercom|support|intercom.com|Intercom Fin
zendesk|Zendesk|support|zendesk.com|
posthog|PostHog|analytics|posthog.com|
mixpanel|Mixpanel|analytics|mixpanel.com|
amplitude|Amplitude|analytics|amplitude.com|
google-analytics|Google Analytics|analytics|analytics.google.com|GA4,Google Analytics 4
segment|Segment|data|segment.com|Twilio Segment,Segment.io
snowflake|Snowflake|data|snowflake.com|
bigquery|BigQuery|data|cloud.google.com|Google BigQuery
dbt|dbt|data|getdbt.com|dbt Cloud,dbt Labs
mongodb|MongoDB|data|mongodb.com|MongoDB Atlas,Mongo
postgresql|PostgreSQL|data|postgresql.org|Postgres
neon|Neon|data|neon.com|Neon Postgres,Neon.tech
redis|Redis|data|redis.io|Redis Cloud,Redis Enterprise
docker|Docker|dev|docker.com|Docker Desktop,Docker Hub
kubernetes|Kubernetes|cloud|kubernetes.io|K8s
terraform|Terraform|cloud|terraform.io|HashiCorp Terraform,HCP Terraform,Terraform Cloud
gitlab|GitLab|dev|gitlab.com|
github-copilot|GitHub Copilot|dev|github.com|Copilot for Business
gusto|Gusto|people|gusto.com|
rippling|Rippling|people|rippling.com|
deel|Deel|people|deel.com|
carta|Carta|finance|carta.com|
mercury|Mercury|finance|mercury.com|Mercury Bank
brex|Brex|finance|brex.com|
ramp|Ramp|finance|ramp.com|Ramp Card
quickbooks|QuickBooks|finance|quickbooks.intuit.com|QuickBooks Online,QBO,Intuit QuickBooks
xero|Xero|finance|xero.com|
netsuite|NetSuite|finance|netsuite.com|Oracle NetSuite
docusign|DocuSign|legal|docusign.com|Docusign eSignature
vanta|Vanta|security|vanta.com|
drata|Drata|security|drata.com|
1password|1Password|security|1password.com|1Password Business,One Password
okta|Okta|security|okta.com|
auth0|Auth0|security|auth0.com|Okta Auth0
clerk|Clerk|security|clerk.com|Clerk.dev
twilio|Twilio|comms|twilio.com|Twilio SMS,Programmable SMS
sendgrid|SendGrid|marketing|sendgrid.com|Twilio SendGrid
resend|Resend|marketing|resend.com|
postmark|Postmark|marketing|postmarkapp.com|
mailchimp|Mailchimp|marketing|mailchimp.com|
customer-io|Customer.io|marketing|customer.io|Customer IO,CustomerIO
loops|Loops|marketing|loops.so|Loops.so
webflow|Webflow|design|webflow.com|
framer|Framer|design|framer.com|
canva|Canva|design|canva.com|Canva for Teams,Canva Business
adobe-creative-cloud|Adobe Creative Cloud|design|adobe.com|Creative Cloud,Adobe CC,Adobe
loom|Loom|comms|loom.com|Atlassian Loom
asana|Asana|product|asana.com|
airtable|Airtable|workspace|airtable.com|
monday|Monday.com|product|monday.com|Monday,monday.com Work Management
trello|Trello|product|trello.com|
calendly|Calendly|ops|calendly.com|
cal-com|Cal.com|ops|cal.com|Calcom
dropbox|Dropbox|workspace|dropbox.com|Dropbox Business
box|Box|workspace|box.com|Box.com
microsoft-teams|Microsoft Teams|comms|teams.microsoft.com|MS Teams
discord|Discord|comms|discord.com|
retool|Retool|dev|retool.com|
zapier|Zapier|ops|zapier.com|
make|Make|ops|make.com|Make.com,Integromat
n8n|n8n|ops|n8n.io|
netlify|Netlify|cloud|netlify.com|
render|Render|cloud|render.com|Render.com
railway|Railway|cloud|railway.com|Railway.app
fly-io|Fly.io|cloud|fly.io|
digitalocean|DigitalOcean|cloud|digitalocean.com|Digital Ocean
azure|Microsoft Azure|cloud|azure.microsoft.com|Azure
heroku|Heroku|cloud|heroku.com|
pagerduty|PagerDuty|dev|pagerduty.com|
launchdarkly|LaunchDarkly|dev|launchdarkly.com|
algolia|Algolia|data|algolia.com|
gemini|Google Gemini|ai|gemini.google.com|Gemini,Gemini API,Gemini Advanced
apollo-io|Apollo.io|sales|apollo.io|Apollo Sales
gong|Gong|sales|gong.io|Gong.io
attio|Attio|sales|attio.com|
ashby|Ashby|people|ashbyhq.com|AshbyHQ
greenhouse|Greenhouse|people|greenhouse.com|Greenhouse Recruiting
linkedin|LinkedIn|marketing|linkedin.com|
google-ads|Google Ads|marketing|ads.google.com|AdWords,Google AdWords
meta-ads|Meta Ads|marketing|meta.com|Facebook Ads,Meta Business Suite,Instagram Ads
shopify|Shopify|commerce|shopify.com|
elevenlabs|ElevenLabs|ai|elevenlabs.io|Eleven Labs,11Labs
midjourney|Midjourney|ai|midjourney.com|
perplexity|Perplexity|ai|perplexity.ai|Perplexity AI,Perplexity Pro
mistral|Mistral AI|ai|mistral.ai|Mistral,Le Chat
hugging-face|Hugging Face|ai|huggingface.co|HuggingFace
replicate|Replicate|ai|replicate.com|
pinecone|Pinecone|ai|pinecone.io|
gmail|Gmail|workspace|mail.google.com|Google Mail
google-drive|Google Drive|workspace|drive.google.com|GDrive
google-docs|Google Docs|workspace|docs.google.com|
google-sheets|Google Sheets|workspace|sheets.google.com|
google-calendar|Google Calendar|workspace|calendar.google.com|GCal
google-meet|Google Meet|comms|meet.google.com|
windsurf|Windsurf|dev|windsurf.com|Codeium Windsurf
visual-studio-code|Visual Studio Code|dev|code.visualstudio.com|VS Code,VSCode
jetbrains|JetBrains|dev|jetbrains.com|JetBrains IDEs
replit|Replit|dev|replit.com|Repl.it
lovable|Lovable|dev|lovable.dev|Lovable.dev
v0|v0|dev|v0.app|v0.dev,v0 by Vercel
bolt-new|Bolt.new|dev|bolt.new|Bolt by StackBlitz
postman|Postman|dev|postman.com|
circleci|CircleCI|dev|circleci.com|Circle CI
github-actions|GitHub Actions|dev|github.com|
grafana|Grafana|dev|grafana.com|Grafana Cloud
new-relic|New Relic|dev|newrelic.com|NewRelic
better-stack|Better Stack|dev|betterstack.com|BetterStack,Better Uptime,Logtail
statsig|Statsig|dev|statsig.com|
incident-io|incident.io|dev|incident.io|Incident IO
upstash|Upstash|data|upstash.com|
planetscale|PlanetScale|data|planetscale.com|
clickhouse|ClickHouse|data|clickhouse.com|ClickHouse Cloud
databricks|Databricks|data|databricks.com|
fivetran|Fivetran|data|fivetran.com|
airbyte|Airbyte|data|airbyte.com|
hightouch|Hightouch|data|hightouch.com|
looker|Looker|data|looker.com|Looker Studio,Google Data Studio
metabase|Metabase|data|metabase.com|
tableau|Tableau|data|tableau.com|Tableau Cloud
power-bi|Power BI|data|powerbi.microsoft.com|Microsoft Power BI,PowerBI
hex|Hex|data|hex.tech|Hex Technologies
aws-s3|Amazon S3|cloud|aws.amazon.com|AWS S3,S3
aws-ec2|Amazon EC2|cloud|aws.amazon.com|AWS EC2,EC2
aws-rds|Amazon RDS|data|aws.amazon.com|AWS RDS,RDS
aws-lambda|AWS Lambda|cloud|aws.amazon.com|Amazon Lambda
aws-ses|Amazon SES|marketing|aws.amazon.com|AWS SES,SES
aws-bedrock|Amazon Bedrock|ai|aws.amazon.com|AWS Bedrock,Bedrock
aws-cloudfront|Amazon CloudFront|cloud|aws.amazon.com|AWS CloudFront,CloudFront
aws-dynamodb|Amazon DynamoDB|data|aws.amazon.com|AWS DynamoDB,DynamoDB
azure-openai|Azure OpenAI|ai|azure.microsoft.com|Azure OpenAI Service
vertex-ai|Vertex AI|ai|cloud.google.com|Google Vertex AI
firebase|Firebase|cloud|firebase.google.com|Google Firebase
groq|Groq|ai|groq.com|GroqCloud
grok|Grok|ai|x.ai|xAI,xAI Grok,xAI API
cohere|Cohere|ai|cohere.com|
deepseek|DeepSeek|ai|deepseek.com|DeepSeek API
together-ai|Together AI|ai|together.ai|Together.ai
fireworks-ai|Fireworks AI|ai|fireworks.ai|Fireworks.ai
openrouter|OpenRouter|ai|openrouter.ai|
deepgram|Deepgram|ai|deepgram.com|
assemblyai|AssemblyAI|ai|assemblyai.com|Assembly AI
langchain|LangChain|ai|langchain.com|
langsmith|LangSmith|ai|smith.langchain.com|
langfuse|Langfuse|ai|langfuse.com|
weights-biases|Weights & Biases|ai|wandb.ai|W&B,WandB
modal|Modal|ai|modal.com|Modal Labs
runpod|RunPod|ai|runpod.io|
granola|Granola|ai|granola.ai|Granola.ai
fireflies|Fireflies.ai|ai|fireflies.ai|Fireflies
otter|Otter.ai|ai|otter.ai|Otter
fathom-ai|Fathom AI|ai|fathom.video|Fathom Notetaker,Fathom Video
descript|Descript|ai|descript.com|
gamma|Gamma|ai|gamma.app|Gamma.app
grammarly|Grammarly|workspace|grammarly.com|Grammarly Business,Superhuman Grammarly
superhuman|Superhuman|comms|superhuman.com|
deepl|DeepL|ai|deepl.com|
glean|Glean|ai|glean.com|
clickup|ClickUp|product|clickup.com|
shortcut|Shortcut|product|shortcut.com|
productboard|Productboard|product|productboard.com|
canny|Canny|product|canny.io|
miro|Miro|product|miro.com|
lucidchart|Lucidchart|product|lucidchart.com|Lucid
coda|Coda|workspace|coda.io|Coda.io
obsidian|Obsidian|workspace|obsidian.md|
smartsheet|Smartsheet|product|smartsheet.com|
pipedrive|Pipedrive|sales|pipedrive.com|
close|Close|sales|close.com|Close CRM,Close.io
clay|Clay|sales|clay.com|Clay.com
outreach|Outreach|sales|outreach.io|Outreach.io
salesloft|Salesloft|sales|salesloft.com|
zoominfo|ZoomInfo|sales|zoominfo.com|
linkedin-sales-navigator|LinkedIn Sales Navigator|sales|linkedin.com|Sales Navigator,Sales Nav
instantly|Instantly|sales|instantly.ai|Instantly.ai
lemlist|lemlist|sales|lemlist.com|
pandadoc|PandaDoc|sales|pandadoc.com|
chili-piper|Chili Piper|sales|chilipiper.com|
freshdesk|Freshdesk|support|freshdesk.com|Freshworks Freshdesk
help-scout|Help Scout|support|helpscout.com|HelpScout
front|Front|support|front.com|Front App,Frontapp
crisp|Crisp|support|crisp.chat|Crisp Chat
gorgias|Gorgias|support|gorgias.com|
plain|Plain|support|plain.com|Plain.com
pylon|Pylon|support|usepylon.com|Pylon Support
statuspage|Statuspage|support|statuspage.io|Atlassian Statuspage
klaviyo|Klaviyo|marketing|klaviyo.com|
braze|Braze|marketing|braze.com|
iterable|Iterable|marketing|iterable.com|
activecampaign|ActiveCampaign|marketing|activecampaign.com|Active Campaign
marketo|Marketo|marketing|business.adobe.com|Adobe Marketo
mailgun|Mailgun|marketing|mailgun.com|
brevo|Brevo|marketing|brevo.com|Sendinblue
beehiiv|beehiiv|marketing|beehiiv.com|
substack|Substack|marketing|substack.com|
semrush|Semrush|marketing|semrush.com|SEMrush
ahrefs|Ahrefs|marketing|ahrefs.com|
buffer|Buffer|marketing|buffer.com|
hootsuite|Hootsuite|marketing|hootsuite.com|
hotjar|Hotjar|analytics|hotjar.com|
fullstory|FullStory|analytics|fullstory.com|
logrocket|LogRocket|analytics|logrocket.com|
heap|Heap|analytics|heap.io|Heap Analytics
pendo|Pendo|analytics|pendo.io|Pendo.io
plausible|Plausible|analytics|plausible.io|Plausible Analytics
microsoft-clarity|Microsoft Clarity|analytics|clarity.microsoft.com|
typeform|Typeform|analytics|typeform.com|
tally|Tally|analytics|tally.so|Tally Forms,Tally.so
surveymonkey|SurveyMonkey|analytics|surveymonkey.com|
appcues|Appcues|analytics|appcues.com|
appsflyer|AppsFlyer|analytics|appsflyer.com|
revenuecat|RevenueCat|finance|revenuecat.com|
paddle|Paddle|finance|paddle.com|
lemon-squeezy|Lemon Squeezy|finance|lemonsqueezy.com|LemonSqueezy
paypal|PayPal|finance|paypal.com|
wise|Wise|finance|wise.com|TransferWise,Wise Business
chargebee|Chargebee|finance|chargebee.com|
recurly|Recurly|finance|recurly.com|
bill-com|BILL|finance|bill.com|Bill.com
expensify|Expensify|finance|expensify.com|
navan|Navan|ops|navan.com|TripActions
freshbooks|FreshBooks|finance|freshbooks.com|
pilot|Pilot|finance|pilot.com|Pilot.com
plaid|Plaid|finance|plaid.com|
avalara|Avalara|finance|avalara.com|
anrok|Anrok|finance|anrok.com|
remote|Remote|people|remote.com|Remote.com
justworks|Justworks|people|justworks.com|
adp|ADP|people|adp.com|ADP Run,ADP Workforce Now
bamboohr|BambooHR|people|bamboohr.com|Bamboo HR
hibob|HiBob|people|hibob.com|
personio|Personio|people|personio.com|
lattice|Lattice|people|lattice.com|
culture-amp|Culture Amp|people|cultureamp.com|
lever|Lever|people|lever.co|
workable|Workable|people|workable.com|
checkr|Checkr|people|checkr.com|
ironclad|Ironclad|legal|ironcladapp.com|
dropbox-sign|Dropbox Sign|legal|sign.dropbox.com|HelloSign,Hello Sign
clerky|Clerky|legal|clerky.com|
stripe-atlas|Stripe Atlas|legal|stripe.com|
workos|WorkOS|security|workos.com|
stytch|Stytch|security|stytch.com|
snyk|Snyk|security|snyk.io|
wiz|Wiz|security|wiz.io|
crowdstrike|CrowdStrike|security|crowdstrike.com|
tailscale|Tailscale|security|tailscale.com|
kandji|Kandji|security|kandji.io|Iru
jamf|Jamf|security|jamf.com|Jamf Pro
doppler|Doppler|security|doppler.com|
bitwarden|Bitwarden|security|bitwarden.com|
lastpass|LastPass|security|lastpass.com|
hashicorp-vault|HashiCorp Vault|security|vaultproject.io|
apple-developer|Apple Developer Program|dev|developer.apple.com|Apple Developer,App Store Connect
google-play-console|Google Play Console|dev|play.google.com|Google Play,Play Console
expo|Expo|dev|expo.dev|
mintlify|Mintlify|dev|mintlify.com|
readme|ReadMe|dev|readme.com|ReadMe.io
gitbook|GitBook|dev|gitbook.com|
contentful|Contentful|dev|contentful.com|
sanity|Sanity|dev|sanity.io|Sanity.io
wordpress|WordPress|marketing|wordpress.com|WordPress.com
ghost|Ghost|marketing|ghost.org|Ghost Pro
vimeo|Vimeo|marketing|vimeo.com|
wistia|Wistia|marketing|wistia.com|
mux|Mux|cloud|mux.com|
cloudinary|Cloudinary|cloud|cloudinary.com|
hetzner|Hetzner|cloud|hetzner.com|Hetzner Cloud,Hetzner Storage,Hetzner Storage Box,Hetzner Online
ovhcloud|OVHcloud|cloud|ovhcloud.com|OVH
backblaze|Backblaze|cloud|backblaze.com|Backblaze B2
godaddy|GoDaddy|ops|godaddy.com|Go Daddy
namecheap|Namecheap|ops|namecheap.com|
raycast|Raycast|ops|raycast.com|
sketch|Sketch|design|sketch.com|
adobe-photoshop|Adobe Photoshop|design|adobe.com|Photoshop
adobe-illustrator|Adobe Illustrator|design|adobe.com|Illustrator
unsplash|Unsplash|design|unsplash.com|Unsplash+
x-twitter|X|marketing|x.com|Twitter,X Ads,Twitter Ads
youtube|YouTube|marketing|youtube.com|
tiktok|TikTok|marketing|tiktok.com|TikTok Ads
instagram|Instagram|marketing|instagram.com|
facebook|Facebook|marketing|facebook.com|
reddit|Reddit|marketing|reddit.com|Reddit Ads
product-hunt|Product Hunt|marketing|producthunt.com|ProductHunt
g2|G2|marketing|g2.com|G2 Crowd
stack-overflow|Stack Overflow|dev|stackoverflow.com|StackOverflow,Stack Overflow for Teams
whatsapp|WhatsApp Business|comms|whatsapp.com|WhatsApp
telegram|Telegram|comms|telegram.org|
aircall|Aircall|comms|aircall.io|
ringcentral|RingCentral|comms|ringcentral.com|
dialpad|Dialpad|comms|dialpad.com|
quo|Quo|comms|quo.com|OpenPhone

aws-route53|Amazon Route 53|cloud|aws.amazon.com|Route 53,AWS Route 53
aws-sqs|Amazon SQS|cloud|aws.amazon.com|AWS SQS,SQS
aws-sns|Amazon SNS|cloud|aws.amazon.com|AWS SNS,SNS
aws-ecs|Amazon ECS|cloud|aws.amazon.com|AWS ECS,ECS,AWS Fargate
aws-eks|Amazon EKS|cloud|aws.amazon.com|AWS EKS,EKS
aws-iam|AWS IAM|cloud|aws.amazon.com|Amazon IAM
aws-cloudwatch|Amazon CloudWatch|cloud|aws.amazon.com|AWS CloudWatch,CloudWatch
aws-redshift|Amazon Redshift|data|aws.amazon.com|AWS Redshift,Redshift
oracle-cloud|Oracle Cloud|cloud|oracle.com|OCI,Oracle Cloud Infrastructure
oracle|Oracle|data|oracle.com|Oracle Database
ibm-cloud|IBM Cloud|cloud|ibm.com|IBM
alibaba-cloud|Alibaba Cloud|cloud|alibabacloud.com|Aliyun
scaleway|Scaleway|cloud|scaleway.com|
linode|Linode|cloud|linode.com|Akamai Cloud
vultr|Vultr|cloud|vultr.com|
wasabi|Wasabi|cloud|wasabi.com|
fastly|Fastly|cloud|fastly.com|
akamai|Akamai|cloud|akamai.com|
bunny-net|Bunny.net|cloud|bunny.net|BunnyCDN,Bunny CDN
northflank|Northflank|cloud|northflank.com|
porter|Porter|cloud|porter.run|Porter.run
coolify|Coolify|cloud|coolify.io|
ngrok|ngrok|cloud|ngrok.com|
pulumi|Pulumi|cloud|pulumi.com|
ansible|Ansible|cloud|ansible.com|Red Hat Ansible
red-hat|Red Hat|cloud|redhat.com|Red Hat OpenShift,OpenShift
helm|Helm|cloud|helm.sh|
nginx|NGINX|cloud|nginx.org|Nginx Plus
traefik|Traefik|cloud|traefik.io|Traefik Labs
kong|Kong|cloud|konghq.com|Kong Gateway
deno|Deno|cloud|deno.com|Deno Deploy
tigris|Tigris|cloud|tigrisdata.com|Tigris Data
imgix|imgix|cloud|imgix.com|
uploadcare|Uploadcare|cloud|uploadcare.com|
uploadthing|UploadThing|cloud|uploadthing.com|
transloadit|Transloadit|cloud|transloadit.com|
pusher|Pusher|cloud|pusher.com|
ably|Ably|cloud|ably.com|
temporal|Temporal|cloud|temporal.io|Temporal Cloud
inngest|Inngest|cloud|inngest.com|
trigger-dev|Trigger.dev|cloud|trigger.dev|
cloud-run|Google Cloud Run|cloud|cloud.google.com|Cloud Run
azure-devops|Azure DevOps|dev|azure.microsoft.com|
gitpod|Gitpod|dev|gitpod.io|
github-codespaces|GitHub Codespaces|dev|github.com|Codespaces
bitbucket|Bitbucket|dev|bitbucket.org|Atlassian Bitbucket
sourcegraph|Sourcegraph|dev|sourcegraph.com|
devin|Devin|dev|devin.ai|Cognition,Cognition Devin
cline|Cline|dev|cline.bot|
tabnine|Tabnine|dev|tabnine.com|
zed|Zed|dev|zed.dev|
warp|Warp|dev|warp.dev|
intellij|IntelliJ IDEA|dev|jetbrains.com|IntelliJ
xcode|Xcode|dev|developer.apple.com|
swagger|Swagger|dev|swagger.io|SmartBear Swagger
fern|Fern|dev|buildwithfern.com|
speakeasy|Speakeasy|dev|speakeasy.com|
stainless|Stainless|dev|stainless.com|
jenkins|Jenkins|dev|jenkins.io|
buildkite|Buildkite|dev|buildkite.com|
travis-ci|Travis CI|dev|travis-ci.com|TravisCI
depot|Depot|dev|depot.dev|
blacksmith|Blacksmith|dev|blacksmith.sh|
graphite|Graphite|dev|graphite.com|Graphite.dev
coderabbit|CodeRabbit|dev|coderabbit.ai|
greptile|Greptile|dev|greptile.com|
sonarqube|SonarQube|dev|sonarsource.com|SonarCloud
codecov|Codecov|dev|codecov.io|
npm|npm|dev|npmjs.com|npmjs
jfrog|JFrog|dev|jfrog.com|Artifactory,JFrog Artifactory
storybook|Storybook|dev|storybook.js.org|
chromatic|Chromatic|dev|chromatic.com|
playwright|Playwright|dev|playwright.dev|
cypress|Cypress|dev|cypress.io|Cypress Cloud
browserstack|BrowserStack|dev|browserstack.com|
sauce-labs|Sauce Labs|dev|saucelabs.com|
lambdatest|LambdaTest|dev|lambdatest.com|
checkly|Checkly|dev|checklyhq.com|
qa-wolf|QA Wolf|dev|qawolf.com|
testflight|TestFlight|dev|testflight.apple.com|
bugsnag|Bugsnag|dev|bugsnag.com|
rollbar|Rollbar|dev|rollbar.com|
honeybadger|Honeybadger|dev|honeybadger.io|
prometheus|Prometheus|dev|prometheus.io|
dynatrace|Dynatrace|dev|dynatrace.com|
honeycomb|Honeycomb|dev|honeycomb.io|
splunk|Splunk|dev|splunk.com|
elastic|Elastic|data|elastic.co|Elasticsearch,Elastic Cloud,Kibana
papertrail|Papertrail|dev|papertrailapp.com|
sumo-logic|Sumo Logic|dev|sumologic.com|
axiom|Axiom|dev|axiom.co|
pingdom|Pingdom|dev|pingdom.com|
uptimerobot|UptimeRobot|dev|uptimerobot.com|Uptime Robot
instatus|Instatus|dev|instatus.com|
rootly|Rootly|dev|rootly.com|
firehydrant|FireHydrant|dev|firehydrant.com|
opsgenie|Opsgenie|dev|atlassian.com|Atlassian Opsgenie
split|Split|dev|split.io|Split.io
flagsmith|Flagsmith|dev|flagsmith.com|
growthbook|GrowthBook|dev|growthbook.io|
optimizely|Optimizely|analytics|optimizely.com|
vwo|VWO|analytics|vwo.com|Visual Website Optimizer
appsmith|Appsmith|dev|appsmith.com|
superblocks|Superblocks|dev|superblocks.com|
bubble|Bubble|dev|bubble.io|Bubble.io
workato|Workato|ops|workato.com|
tray-io|Tray.ai|ops|tray.ai|Tray.io
pipedream|Pipedream|ops|pipedream.com|
hasura|Hasura|dev|hasura.io|
apollo-graphql|Apollo GraphQL|dev|apollographql.com|
prisma|Prisma|dev|prisma.io|
convex|Convex|data|convex.dev|
appwrite|Appwrite|data|appwrite.io|
strapi|Strapi|dev|strapi.io|
storyblok|Storyblok|dev|storyblok.com|
prismic|Prismic|dev|prismic.io|
hygraph|Hygraph|dev|hygraph.com|GraphCMS
tailwind|Tailwind CSS|dev|tailwindcss.com|Tailwind,Tailwind Plus,Tailwind UI
codesandbox|CodeSandbox|dev|codesandbox.io|
stackblitz|StackBlitz|dev|stackblitz.com|
tuple|Tuple|dev|tuple.app|
ollama|Ollama|ai|ollama.com|
lm-studio|LM Studio|ai|lmstudio.ai|
nvidia|NVIDIA|ai|nvidia.com|NVIDIA NIM,NVIDIA AI Enterprise
coreweave|CoreWeave|ai|coreweave.com|
lambda-labs|Lambda Labs|ai|lambda.ai|Lambda Cloud
baseten|Baseten|ai|baseten.co|
cerebras|Cerebras|ai|cerebras.ai|
meta-llama|Meta Llama|ai|llama.com|Llama
qwen|Qwen|ai|qwen.ai|Alibaba Qwen,Tongyi Qianwen
moonshot|Moonshot AI|ai|moonshot.ai|Kimi
stability-ai|Stability AI|ai|stability.ai|Stable Diffusion
black-forest-labs|Black Forest Labs|ai|bfl.ai|BFL
ideogram|Ideogram|ai|ideogram.ai|
leonardo-ai|Leonardo AI|ai|leonardo.ai|Leonardo.ai
runway-ml|Runway ML|ai|runwayml.com|RunwayML
pika|Pika|ai|pika.art|Pika Labs
luma-ai|Luma AI|ai|lumalabs.ai|Luma Dream Machine
synthesia|Synthesia|ai|synthesia.io|
heygen|HeyGen|ai|heygen.com|
suno|Suno|ai|suno.com|Suno AI
jasper|Jasper|ai|jasper.ai|Jasper AI
copy-ai|Copy.ai|ai|copy.ai|
writer|Writer|ai|writer.com|Writer.com
harvey|Harvey|ai|harvey.ai|Harvey AI
sierra|Sierra|ai|sierra.ai|Sierra AI
decagon|Decagon|ai|decagon.ai|
vapi|Vapi|ai|vapi.ai|
retell-ai|Retell AI|ai|retellai.com|
bland-ai|Bland AI|ai|bland.ai|
livekit|LiveKit|ai|livekit.io|
weaviate|Weaviate|ai|weaviate.io|
qdrant|Qdrant|ai|qdrant.tech|
chroma|Chroma|ai|trychroma.com|ChromaDB
milvus|Milvus|ai|milvus.io|Zilliz
llamaindex|LlamaIndex|ai|llamaindex.ai|
helicone|Helicone|ai|helicone.ai|
braintrust|Braintrust|ai|braintrust.dev|
arize|Arize|ai|arize.com|Arize AI
scale-ai|Scale AI|ai|scale.com|
exa|Exa|ai|exa.ai|Exa.ai
tavily|Tavily|ai|tavily.com|
firecrawl|Firecrawl|ai|firecrawl.dev|
browserbase|Browserbase|ai|browserbase.com|
apify|Apify|ai|apify.com|
e2b|E2B|ai|e2b.dev|
composio|Composio|ai|composio.dev|
microsoft-copilot|Microsoft Copilot|ai|copilot.microsoft.com|Microsoft 365 Copilot
lindy|Lindy|ai|lindy.ai|Lindy AI
relevance-ai|Relevance AI|ai|relevanceai.com|
crewai|CrewAI|ai|crewai.com|Crew AI
dust|Dust|ai|dust.tt|Dust.tt
read-ai|Read AI|ai|read.ai|Read.ai
tldv|tl;dv|ai|tldv.io|tldv
krisp|Krisp|ai|krisp.ai|
avoma|Avoma|ai|avoma.com|
notebooklm|NotebookLM|ai|notebooklm.google.com|
google-ai-studio|Google AI Studio|ai|aistudio.google.com|
sora|Sora|ai|sora.com|OpenAI Sora
codex|Codex|dev|openai.com|OpenAI Codex
ai21|AI21 Labs|ai|ai21.com|AI21
fal|fal|ai|fal.ai|fal.ai
cartesia|Cartesia|ai|cartesia.ai|
beautiful-ai|Beautiful.ai|ai|beautiful.ai|
pitch|Pitch|workspace|pitch.com|Pitch.com
mysql|MySQL|data|mysql.com|
sqlite|SQLite|data|sqlite.org|
turso|Turso|data|turso.tech|
cockroachdb|CockroachDB|data|cockroachlabs.com|Cockroach Labs
timescale|Timescale|data|timescale.com|TimescaleDB,Tiger Data
singlestore|SingleStore|data|singlestore.com|
aiven|Aiven|data|aiven.io|
microsoft-sql-server|Microsoft SQL Server|data|microsoft.com|SQL Server,MSSQL
kafka|Apache Kafka|data|kafka.apache.org|Kafka
confluent|Confluent|data|confluent.io|Confluent Cloud
rabbitmq|RabbitMQ|data|rabbitmq.com|
spark|Apache Spark|data|spark.apache.org|Spark
airflow|Apache Airflow|data|airflow.apache.org|Airflow
dagster|Dagster|data|dagster.io|
prefect|Prefect|data|prefect.io|
stitch|Stitch|data|stitchdata.com|Stitch Data
census|Census|data|getcensus.com|
rudderstack|RudderStack|data|rudderstack.com|
mparticle|mParticle|data|mparticle.com|
tealium|Tealium|data|tealium.com|
mode|Mode|data|mode.com|Mode Analytics
sigma|Sigma|data|sigmacomputing.com|Sigma Computing
lightdash|Lightdash|data|lightdash.com|
superset|Apache Superset|data|superset.apache.org|Superset
omni-analytics|Omni Analytics|data|omni.co|
monte-carlo|Monte Carlo|data|montecarlodata.com|
atlan|Atlan|data|atlan.com|
alation|Alation|data|alation.com|
typesense|Typesense|data|typesense.org|
meilisearch|Meilisearch|data|meilisearch.com|
duckdb|DuckDB|data|duckdb.org|
motherduck|MotherDuck|data|motherduck.com|
domo|Domo|data|domo.com|
qlik|Qlik|data|qlik.com|
tinybird|Tinybird|data|tinybird.co|
thoughtspot|ThoughtSpot|data|thoughtspot.com|
google-tag-manager|Google Tag Manager|analytics|tagmanager.google.com|GTM
google-search-console|Google Search Console|analytics|search.google.com|Search Console
matomo|Matomo|analytics|matomo.org|
fathom-analytics|Fathom Analytics|analytics|usefathom.com|
simple-analytics|Simple Analytics|analytics|simpleanalytics.com|
crazy-egg|Crazy Egg|analytics|crazyegg.com|
contentsquare|Contentsquare|analytics|contentsquare.com|
sprig|Sprig|analytics|sprig.com|
maze|Maze|analytics|maze.co|
dovetail|Dovetail|analytics|dovetail.com|
usertesting|UserTesting|analytics|usertesting.com|
qualtrics|Qualtrics|analytics|qualtrics.com|
google-forms|Google Forms|analytics|forms.google.com|
jotform|Jotform|analytics|jotform.com|
delighted|Delighted|analytics|delighted.com|
userpilot|Userpilot|analytics|userpilot.com|
chameleon|Chameleon|analytics|chameleon.io|
userflow|Userflow|analytics|userflow.com|
branch|Branch|analytics|branch.io|Branch.io,Branch Metrics
adjust|Adjust|analytics|adjust.com|
singular|Singular|analytics|singular.net|
aha|Aha!|product|aha.io|Aha
basecamp|Basecamp|product|basecamp.com|
wrike|Wrike|product|wrike.com|
mural|Mural|product|mural.co|
whimsical|Whimsical|product|whimsical.com|
excalidraw|Excalidraw|product|excalidraw.com|Excalidraw+
todoist|Todoist|product|todoist.com|
harvest|Harvest|product|getharvest.com|
toggl|Toggl|product|toggl.com|Toggl Track
clockify|Clockify|product|clockify.me|
teamwork|Teamwork|product|teamwork.com|Teamwork.com
atlassian|Atlassian|product|atlassian.com|
jira-service-management|Jira Service Management|support|atlassian.com|JSM
plane|Plane|product|plane.so|Plane.so
slite|Slite|workspace|slite.com|
guru|Guru|workspace|getguru.com|
evernote|Evernote|workspace|evernote.com|
microsoft-onedrive|Microsoft OneDrive|workspace|onedrive.live.com|OneDrive
microsoft-sharepoint|Microsoft SharePoint|workspace|microsoft.com|SharePoint
microsoft-excel|Microsoft Excel|workspace|microsoft.com|Excel
microsoft-word|Microsoft Word|workspace|microsoft.com|MS Word
microsoft-powerpoint|Microsoft PowerPoint|workspace|microsoft.com|PowerPoint
microsoft-outlook|Microsoft Outlook|workspace|outlook.com|Outlook
google-slides|Google Slides|workspace|slides.google.com|
icloud|iCloud|workspace|icloud.com|iCloud+,iCloud Mail
zoho-workplace|Zoho|workspace|zoho.com|Zoho Workplace,Zoho One,Zoho Mail
fastmail|Fastmail|workspace|fastmail.com|
proton|Proton|workspace|proton.me|Proton Mail,ProtonMail,Proton Drive
adobe-acrobat|Adobe Acrobat|workspace|adobe.com|Acrobat,Adobe Acrobat Pro,Adobe Acrobat Sign
arc|Arc Browser|workspace|arc.net|Dia Browser
adobe-after-effects|Adobe After Effects|design|adobe.com|After Effects
adobe-premiere|Adobe Premiere Pro|design|adobe.com|Premiere Pro
adobe-indesign|Adobe InDesign|design|adobe.com|InDesign
adobe-lightroom|Adobe Lightroom|design|adobe.com|Lightroom
adobe-fonts|Adobe Fonts|design|fonts.adobe.com|Typekit
spline|Spline|design|spline.design|
rive|Rive|design|rive.app|
lottiefiles|LottieFiles|design|lottiefiles.com|
zeplin|Zeplin|design|zeplin.io|
balsamiq|Balsamiq|design|balsamiq.com|
protopie|ProtoPie|design|protopie.io|
penpot|Penpot|design|penpot.app|
affinity|Affinity|design|affinity.studio|Affinity Designer,Affinity Publisher
blender|Blender|design|blender.org|
shutterstock|Shutterstock|design|shutterstock.com|
getty-images|Getty Images|design|gettyimages.com|
pexels|Pexels|design|pexels.com|
envato|Envato|design|envato.com|Envato Elements
font-awesome|Font Awesome|design|fontawesome.com|
google-fonts|Google Fonts|design|fonts.google.com|
dribbble|Dribbble|design|dribbble.com|
behance|Behance|design|behance.net|
capcut|CapCut|design|capcut.com|
figjam|FigJam|design|figma.com|
webex|Webex|comms|webex.com|Cisco Webex
mattermost|Mattermost|comms|mattermost.com|
rocket-chat|Rocket.Chat|comms|rocket.chat|Rocket Chat
signal|Signal|comms|signal.org|
google-chat|Google Chat|comms|chat.google.com|
vonage|Vonage|comms|vonage.com|Nexmo
bird|Bird|comms|bird.com|MessageBird
plivo|Plivo|comms|plivo.com|
sinch|Sinch|comms|sinch.com|
telnyx|Telnyx|comms|telnyx.com|
justcall|JustCall|comms|justcall.io|
whereby|Whereby|comms|whereby.com|
riverside|Riverside|comms|riverside.com|Riverside.fm
streamyard|StreamYard|comms|streamyard.com|
luma-events|Lu.ma|comms|lu.ma|Luma Events
eventbrite|Eventbrite|comms|eventbrite.com|
missive|Missive|comms|missiveapp.com|
daily|Daily|comms|daily.co|Daily.co
agora|Agora|comms|agora.io|Agora.io
sendbird|Sendbird|comms|sendbird.com|
stream|Stream|comms|getstream.io|GetStream
goto|GoTo|comms|goto.com|GoToMeeting,GoTo Meeting
bluesky|Bluesky|marketing|bsky.app|
pinterest|Pinterest|marketing|pinterest.com|Pinterest Ads
linkedin-ads|LinkedIn Ads|marketing|linkedin.com|LinkedIn Campaign Manager
microsoft-advertising|Microsoft Advertising|marketing|ads.microsoft.com|Bing Ads
apple-search-ads|Apple Search Ads|marketing|searchads.apple.com|
pardot|Pardot|marketing|salesforce.com|Salesforce Pardot,Account Engagement
kit|Kit|marketing|kit.com|ConvertKit
constant-contact|Constant Contact|marketing|constantcontact.com|
campaign-monitor|Campaign Monitor|marketing|campaignmonitor.com|
sparkpost|SparkPost|marketing|sparkpost.com|
mailjet|Mailjet|marketing|mailjet.com|
mailtrap|Mailtrap|marketing|mailtrap.io|
onesignal|OneSignal|marketing|onesignal.com|
sprout-social|Sprout Social|marketing|sproutsocial.com|
later|Later|marketing|later.com|
moz|Moz|marketing|moz.com|
squarespace|Squarespace|marketing|squarespace.com|
wix|Wix|marketing|wix.com|
unbounce|Unbounce|marketing|unbounce.com|
mutiny|Mutiny|marketing|mutinyhq.com|
clearbit|Clearbit|marketing|clearbit.com|
demandbase|Demandbase|marketing|demandbase.com|
6sense|6sense|marketing|6sense.com|
capterra|Capterra|marketing|capterra.com|
trustpilot|Trustpilot|marketing|trustpilot.com|
rewardful|Rewardful|marketing|rewardful.com|
firstpromoter|FirstPromoter|marketing|firstpromoter.com|
partnerstack|PartnerStack|marketing|partnerstack.com|
impact|Impact.com|marketing|impact.com|
bitly|Bitly|marketing|bitly.com|
dub|Dub|marketing|dub.co|Dub.co
typefully|Typefully|marketing|typefully.com|
kajabi|Kajabi|marketing|kajabi.com|
teachable|Teachable|marketing|teachable.com|
thinkific|Thinkific|marketing|thinkific.com|
gumroad|Gumroad|commerce|gumroad.com|
patreon|Patreon|marketing|patreon.com|
spotify|Spotify|marketing|spotify.com|Spotify for Creators
surfer|Surfer|marketing|surferseo.com|Surfer SEO
hunter|Hunter|sales|hunter.io|Hunter.io
lusha|Lusha|sales|lusha.com|
cognism|Cognism|sales|cognism.com|
smartlead|Smartlead|sales|smartlead.ai|
reply-io|Reply.io|sales|reply.io|
copper|Copper|sales|copper.com|Copper CRM
zoho-crm|Zoho CRM|sales|zoho.com|
freshsales|Freshsales|sales|freshworks.com|Freshworks CRM
folk|Folk|sales|folk.app|Folk CRM
streak|Streak|sales|streak.com|
affinity-crm|Affinity CRM|sales|affinity.co|
qwilr|Qwilr|sales|qwilr.com|
drift|Drift|sales|drift.com|Salesloft Drift
qualified|Qualified|sales|qualified.com|
dock|Dock|sales|dock.us|
seismic|Seismic|sales|seismic.com|
highspot|Highspot|sales|highspot.com|
clari|Clari|sales|clari.com|
common-room|Common Room|sales|commonroom.io|
koala|Koala|sales|getkoala.com|
microsoft-dynamics|Microsoft Dynamics 365|sales|dynamics.microsoft.com|Dynamics 365,Microsoft Dynamics
twenty|Twenty|sales|twenty.com|Twenty CRM
vidyard|Vidyard|sales|vidyard.com|
docsend|DocSend|sales|docsend.com|
papermark|Papermark|sales|papermark.com|
tidio|Tidio|support|tidio.com|
tawk-to|tawk.to|support|tawk.to|Tawk
livechat|LiveChat|support|livechat.com|
kustomer|Kustomer|support|kustomer.com|
reamaze|Re:amaze|support|reamaze.com|Reamaze
zoho-desk|Zoho Desk|support|zoho.com|
salesforce-service-cloud|Salesforce Service Cloud|support|salesforce.com|Service Cloud
gainsight|Gainsight|support|gainsight.com|
churnzero|ChurnZero|support|churnzero.com|
vitally|Vitally|support|vitally.io|
planhat|Planhat|support|planhat.com|
ada|Ada|support|ada.cx|Ada Support
forethought|Forethought|support|forethought.ai|
uservoice|UserVoice|support|uservoice.com|
frill|Frill|support|frill.co|
featurebase|Featurebase|support|featurebase.app|
beamer|Beamer|support|getbeamer.com|
servicenow|ServiceNow|support|servicenow.com|
freshservice|Freshservice|support|freshservice.com|
chatwoot|Chatwoot|support|chatwoot.com|
adyen|Adyen|finance|adyen.com|
braintree|Braintree|finance|braintreepayments.com|
square|Square|finance|squareup.com|Square Payments,Squareup
checkout-com|Checkout.com|finance|checkout.com|
gocardless|GoCardless|finance|gocardless.com|
razorpay|Razorpay|finance|razorpay.com|
mollie|Mollie|finance|mollie.com|
klarna|Klarna|finance|klarna.com|
affirm|Affirm|finance|affirm.com|
afterpay|Afterpay|finance|afterpay.com|
american-express|American Express|finance|americanexpress.com|Amex
revolut|Revolut|finance|revolut.com|Revolut Business
rho|Rho|finance|rho.co|
divvy|Divvy|finance|getdivvy.com|BILL Spend & Expense
pleo|Pleo|finance|pleo.io|
spendesk|Spendesk|finance|spendesk.com|
payhawk|Payhawk|finance|payhawk.com|
qonto|Qonto|finance|qonto.com|
svb|Silicon Valley Bank|finance|svb.com|SVB
chase|Chase|finance|chase.com|JPMorgan Chase,Chase Bank,JPMorgan
bank-of-america|Bank of America|finance|bankofamerica.com|BofA
wells-fargo|Wells Fargo|finance|wellsfargo.com|
hsbc|HSBC|finance|hsbc.com|
barclays|Barclays|finance|barclays.com|
monzo|Monzo|finance|monzo.com|Monzo Business
starling|Starling Bank|finance|starlingbank.com|
tide|Tide|finance|tide.co|
freeagent|FreeAgent|finance|freeagent.com|
sage|Sage|finance|sage.com|Sage Intacct
wave|Wave|finance|waveapps.com|Wave Accounting
zoho-books|Zoho Books|finance|zoho.com|
digits|Digits|finance|digits.com|
mosaic|Mosaic|finance|mosaic.tech|Mosaic Tech
pigment|Pigment|finance|pigment.com|
runway-financial|Runway Financial|finance|runway.com|
cube-software|Cube Software|finance|cubesoftware.com|
anaplan|Anaplan|finance|anaplan.com|
maxio|Maxio|finance|maxio.com|Chargify,SaaSOptics
zuora|Zuora|finance|zuora.com|
orb|Orb|finance|withorb.com|
metronome|Metronome|finance|metronome.com|
lago|Lago|finance|getlago.com|
baremetrics|Baremetrics|finance|baremetrics.com|
chartmogul|ChartMogul|finance|chartmogul.com|
taxjar|TaxJar|finance|taxjar.com|
pulley|Pulley|finance|pulley.com|
angellist|AngelList|finance|angellist.com|
modern-treasury|Modern Treasury|finance|moderntreasury.com|
increase|Increase|finance|increase.com|
dwolla|Dwolla|finance|dwolla.com|
marqeta|Marqeta|finance|marqeta.com|
unit|Unit|finance|unit.co|
coinbase|Coinbase|finance|coinbase.com|Coinbase Commerce,Coinbase Prime
circle|Circle|finance|circle.com|USDC
payoneer|Payoneer|finance|payoneer.com|
zip|Zip|finance|ziphq.com|Zip HQ
tipalti|Tipalti|finance|tipalti.com|
concur|SAP Concur|finance|concur.com|Concur
sap|SAP|finance|sap.com|SAP S/4HANA
oyster|Oyster HR|people|oysterhr.com|Oyster
trinet|TriNet|people|trinet.com|
paychex|Paychex|people|paychex.com|
paylocity|Paylocity|people|paylocity.com|
workday|Workday|people|workday.com|
fifteen-five|15Five|people|15five.com|
leapsome|Leapsome|people|leapsome.com|
breezy-hr|Breezy HR|people|breezy.hr|
jazzhr|JazzHR|people|jazzhr.com|
linkedin-recruiter|LinkedIn Recruiter|people|linkedin.com|
indeed|Indeed|people|indeed.com|
wellfound|Wellfound|people|wellfound.com|AngelList Talent
dover|Dover|people|dover.com|
gem|Gem|people|gem.com|
zenefits|Zenefits|people|zenefits.com|TriNet Zenefits
pave|Pave|people|pave.com|
trainual|Trainual|people|trainual.com|
safetywing|SafetyWing|people|safetywing.com|
vouch|Vouch|people|vouch.us|Vouch Insurance
embroker|Embroker|people|embroker.com|
glassdoor|Glassdoor|people|glassdoor.com|
juro|Juro|legal|juro.com|
legalzoom|LegalZoom|legal|legalzoom.com|
signnow|SignNow|legal|signnow.com|
clio|Clio|legal|clio.com|
termly|Termly|legal|termly.io|
iubenda|iubenda|legal|iubenda.com|
onetrust|OneTrust|legal|onetrust.com|
trustarc|TrustArc|legal|trustarc.com|
osano|Osano|legal|osano.com|
cookiebot|Cookiebot|legal|cookiebot.com|
firstbase|Firstbase|legal|firstbase.io|
secureframe|Secureframe|security|secureframe.com|
sprinto|Sprinto|security|sprinto.com|
thoropass|Thoropass|security|thoropass.com|
dashlane|Dashlane|security|dashlane.com|
frontegg|Frontegg|security|frontegg.com|
supertokens|SuperTokens|security|supertokens.com|
keycloak|Keycloak|security|keycloak.org|
ping-identity|Ping Identity|security|pingidentity.com|
duo|Duo Security|security|duo.com|Cisco Duo
jumpcloud|JumpCloud|security|jumpcloud.com|
microsoft-entra|Microsoft Entra ID|security|entra.microsoft.com|Azure AD,Azure Active Directory,Entra ID
lacework|Lacework|security|lacework.com|
orca|Orca Security|security|orca.security|
sentinelone|SentinelOne|security|sentinelone.com|
zscaler|Zscaler|security|zscaler.com|
palo-alto|Palo Alto Networks|security|paloaltonetworks.com|
twingate|Twingate|security|twingate.com|
nordlayer|NordLayer|security|nordlayer.com|
mosyle|Mosyle|security|mosyle.com|
fleet|Fleet|security|fleetdm.com|Fleet Device Management
infisical|Infisical|security|infisical.com|
gitguardian|GitGuardian|security|gitguardian.com|
semgrep|Semgrep|security|semgrep.dev|
socket|Socket|security|socket.dev|Socket.dev
aikido|Aikido Security|security|aikido.dev|
cobalt|Cobalt|security|cobalt.io|
hackerone|HackerOne|security|hackerone.com|
bugcrowd|Bugcrowd|security|bugcrowd.com|
abnormal|Abnormal Security|security|abnormal.ai|
proofpoint|Proofpoint|security|proofpoint.com|
mimecast|Mimecast|security|mimecast.com|
knowbe4|KnowBe4|security|knowbe4.com|
yubico|Yubico|security|yubico.com|YubiKey
cisco|Cisco|security|cisco.com|Cisco Meraki,Meraki
porkbun|Porkbun|ops|porkbun.com|
gandi|Gandi|ops|gandi.net|
dnsimple|DNSimple|ops|dnsimple.com|
reclaim|Reclaim.ai|ops|reclaim.ai|Reclaim
clockwise|Clockwise|ops|getclockwise.com|
motion|Motion|ops|usemotion.com|Motion App
savvycal|SavvyCal|ops|savvycal.com|
doodle|Doodle|ops|doodle.com|
travelperk|TravelPerk|ops|travelperk.com|
uber|Uber for Business|ops|uber.com|Uber
wework|WeWork|ops|wework.com|
amazon-business|Amazon Business|ops|amazon.com|Amazon
apple|Apple|ops|apple.com|Apple Business Manager
google|Google|ops|google.com|
microsoft|Microsoft|ops|microsoft.com|
ifttt|IFTTT|ops|ifttt.com|
woocommerce|WooCommerce|commerce|woocommerce.com|
bigcommerce|BigCommerce|commerce|bigcommerce.com|
magento|Magento|commerce|business.adobe.com|Adobe Commerce
etsy|Etsy|commerce|etsy.com|
amazon-seller|Amazon Seller Central|commerce|sellercentral.amazon.com|Seller Central
shipstation|ShipStation|commerce|shipstation.com|
shipbob|ShipBob|commerce|shipbob.com|
recharge|Recharge|commerce|getrecharge.com|ReCharge
yotpo|Yotpo|commerce|yotpo.com|
shippo|Shippo|commerce|goshippo.com|
easypost|EasyPost|commerce|easypost.com|
ebay|eBay|commerce|ebay.com|
hostinger|Hostinger|cloud|hostinger.com|
kinsta|Kinsta|cloud|kinsta.com|
wp-engine|WP Engine|cloud|wpengine.com|WPEngine
bluehost|Bluehost|cloud|bluehost.com|
crunchbase|Crunchbase|sales|crunchbase.com|
pitchbook|PitchBook|finance|pitchbook.com|
visible|Visible|finance|visible.vc|Visible.vc
upwork|Upwork|people|upwork.com|
fiverr|Fiverr|people|fiverr.com|
toptal|Toptal|people|toptal.com|
contra|Contra|people|contra.com|
mailerlite|MailerLite|marketing|mailerlite.com|
drip|Drip|marketing|drip.com|
aweber|AWeber|marketing|aweber.com|
getresponse|GetResponse|marketing|getresponse.com|
ortto|Ortto|marketing|ortto.com|
honeybook|HoneyBook|finance|honeybook.com|
bonsai|Bonsai|finance|hellobonsai.com|
gitkraken|GitKraken|dev|gitkraken.com|
screen-studio|Screen Studio|design|screen.studio|
`

export const SERVICES: Service[] = LIST.trim()
  .split('\n')
  .filter((line) => line.trim())
  .map((line, i) => {
    const [id, name, category, domain, aliases] = line.split('|')
    return {
      id,
      name,
      category: category as ServiceCategory,
      domain,
      aliases: aliases ? aliases.split(',').map((a) => a.trim()).filter(Boolean) : [],
      rank: i + 1,
    }
  })
