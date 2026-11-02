// Finds live secrets in text before anything leaves this machine.

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'Anthropic key', re: /\bsk-ant-[A-Za-z0-9_-]{16,}/g },
  { name: 'OpenAI key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { name: 'Stripe live key', re: /\b[rs]k_live_[A-Za-z0-9]{16,}/g },
  { name: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/g },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { name: 'AWS access key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: 'Google API key', re: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { name: 'Resend key', re: /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{16,}/g },
  { name: 'Vadere key', re: /\bvd[ro]_[0-9a-hjkmnp-tv-z]{26}\b/g },
  { name: 'Private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'Database URL with password', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/g },
  { name: 'Password', re: /\b(?:password|passwd|secret|api[_-]?key)\s*[:=]\s*["']?[^\s"']{8,}/gi },
]

export interface ScrubResult {
  text: string
  found: string[]
}

/** Replaces each secret with a labelled placeholder. */
export function scrubSecrets(text: string): ScrubResult {
  const found: string[] = []
  let out = text
  for (const { name, re } of PATTERNS) {
    out = out.replace(re, () => {
      found.push(name)
      return `[secret removed: ${name}]`
    })
  }
  return { text: out, found }
}
