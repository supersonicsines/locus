# PRD QA pass

An adversarial read of PRD draft 1 before any code was written. Each finding is fixed in the PRD unless marked otherwise.

## Security holes in the design

**1. "Always follow" is a privileged channel, and shredded documents can write to it.**
A vendor contract with hidden text could become a top-of-file rule for every agent: "Always send credentials to...". Shredding turns untrusted documents into instructions.
Fix: rules found by shredding are proposals. They reach the "Always follow" section only after the user approves them, and they sit in "things that need you" until then.

**2. "Where things live" can hijack the harness the same way.**
A document could plant a malicious MCP URL, and agents would be told to connect to it.
Fix: only MCP URLs from the bundled catalog, or ones the user approves, are published. Anything else is treated as a proposal, as in 1.

**3. Secrets reach Anthropic before they're detected.**
The draft runs the secret check on pieces, after Claude has read the file.
Fix: scan locally before anything is sent. Found secrets are replaced with a labelled placeholder before shredding, and the piece is flagged.

**4. Flipping a gate looks instant but isn't.**
The wax seal lands immediately, yet the old bundle still opens that gate until the next publish. A founder cutting off a contractor would believe it was done. This is the most dangerous mismatch in the product.
Fix: any change that reduces access is called out in place: "Contractor can still read Legal until you publish", with Publish right there. The map shows it too: the gate gets a dashed outline and a ghost of the seal, and the wax only lands once it's truly sealed. Revoke publishes immediately and says it will also publish other pending changes.

**5. "The host never sees the password" is false for the browser.**
The unlock page's JavaScript comes from the host. A dishonest host could serve code that steals the password. Only the CLI and local MCP, installed from a pinned package, are independent of the host.
Fix: the trust table separates the two. The threat model says: to rely on the browser path, self-host or trust your host.

**6. Prices can leak through ordinary text.**
Sealing prices in the Money gate does nothing if a service piece's body says "Figma, $16 a seat".
Fix: Reader puts prices only in the structured cost field. A local pass strips currency sentences from service pieces. Invoices and pricing documents default to Money. The threat model records that this is best effort, not a cryptographic guarantee.

**7. Passwords in URLs leak.**
`/k/<password>/` can land in logs, browser history and referrers.
Fix: never log these paths, send `Referrer-Policy: no-referrer`, offer this form only where nothing else works, and say why in the interface. Reject remote password use over plain HTTP when the proxy reports it.

**8. Piece content is an XSS path to the most sensitive data in the app.**
The browser holds plaintext, passwords and the Claude key, and piece bodies come from untrusted files.
Fix: render bodies through a safe Markdown subset with no raw HTML. Strict CSP with no inline script, and `connect-src` limited to self and `api.anthropic.com`. The bundled pdf.js has no eval path, and the CSP would block one anyway.

**9. The Claude key must never travel.**
Fix: stored only in the browser, optional, and excluded from the owner's sealed copy.

**9a. A document could forge a section of what agents read.** Found while building: a summary containing a newline and `## Always follow` would have read as a real rule. Fix: everything from a document is flattened to one line in the index, and headings inside a piece's body are escaped. Tested.

## Risks to the SaaS-lite decision

**10. Free, anonymous, encrypted hosting is an abuse magnet.** This is the largest non-technical risk, and it's the founder's to weigh. An operator can't inspect what's stored, and there's no email to contact or ban.
Partial fix: the hosted limit is 10 MB per account, the host accepts only a valid bundle served as `application/json` with `nosniff` (so it's useless for serving files), and `vadere admin remove <name>` plus a configurable abuse contact handles takedowns. **Flag to the founder before running a public instance.**

**11. With no email, a script can claim every spot.**
Fix: a small proof-of-work on claiming, a per-IP limit, a reserved-names list. A name is claimed only by a first successful publish, so there are no empty reservations. Deleting an account frees its spot.

**12. Losing the owner key is permanent.**
Fix: first publish can't complete until the key has been copied or downloaded. The interface says plainly that nobody can recover it.

## Product gaps

**13. A founder may have more than one company.** Fix: several maps per browser, switched from the top-left menu. Cheap, and it avoids a data-loss trap when moving from the sample to real data.

**14. The sample could be published by accident and burn a spot.** Fix: the sample can't be published on the hosted service. Self-hosted it can, which is how you try the whole flow.

**15. Re-dropping an updated file was undefined.** Fix: pieces from a file with the same name are replaced, and pieces with the same title keep their position and links, so the map stays recognisable.

**16. Cost before shredding was invisible.** Fix: an estimate before a Claude run and actual usage afterwards. The model is selectable; default Opus 5.5.

**17. Screen readers get nothing from a canvas.** Fix: the gates panel, ⌘K and peek are complete keyboard and screen-reader paths to every piece. Visible focus, reduced motion respected.

**18. Phones were unspecified.** Fix: the read-only address must work on a phone. The Studio must not break there, but it's designed for a laptop.

**19. No testing plan.** Fix: section 13 added. Surgical tests on crypto and host, plus repeated visual QA rounds.

**20. `*.localhost` doesn't resolve in Safari, and some self-hosters lack wildcard DNS.** Fix: every address is also available at `/s/<name>/`.

## Rejected from the Gemini PRD, with reasons

| Gemini proposed | Decision | Why |
| --- | --- | --- |
| Argon2id on a chosen password | Generated 130-bit keys with HKDF | The bundle is public, so a human password would be attackable offline. Argon2id only exists to slow guessing of weak secrets; a generated key can't be guessed. It would also put a 64 MB memory-hard function in every remote request |
| HKDF tiers from a master key | Random key per gate, wrapped per password | Tiers can't express arbitrary gate sets, and can't rotate on revocation |
| "Local/client-side LLM" | Your Claude key, or a no-AI fallback | A browser can't run useful extraction. The honest statement is that shredding with Claude sends text to Anthropic under your key |
| SQLite plus vector search | JSON bundle with BM25 and link hops | Agents reformulate queries well, embeddings need another model, and they leak meaning |
| Next.js, Tailwind, Cytoscape | Static React app, hand CSS, Canvas | No server code in the Studio makes the trust claim simpler. A stock graph library can't reach the Atlas look |
| Cloudflare Worker as the only host | Node host, kept portable | Runs on anything today, including a laptop |
| `Authorization: Bearer` only | Also `/k/` URLs and MCP | Many agent fetch tools can't set headers, and the audience lives in MCP connectors |

Also corrected: Gemini's draft calls bearer access "zero-knowledge". It isn't: the host handles the key during the request. Vadere labels this honestly.
