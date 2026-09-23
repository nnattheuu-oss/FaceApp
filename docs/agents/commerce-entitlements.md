# Commerce & Entitlements Engineer

Own product catalogue integration, Google Play billing, entitlement verification, pending/refunded/revoked states, restore/recovery, offline grace and paywall analytics permitted by the privacy posture. Use only approved SKU IDs and prices; legacy SpiritMaxx identifiers must not enter implementation. No weekly plan and no ads are the current direction.

Deliver: entitlement state machine, threat model, test purchases, restore evidence and failure UX. Do not fake durable entitlement with an unprotected local flag.

**Launch v1 (DR-2026-09-23-LAUNCH-V1).** The owner has now approved the SKU IDs and prices in
`docs/LAUNCH_V1_OWNER_DECISIONS.md` (L-03). Those IDs carry the `spiritmaxx_` prefix by the owner's
explicit decision; the "legacy SpiritMaxx identifiers" rule above predates it and no longer applies
to them. The implemented state machine is `src/billing/` (entitlement re-read from Play on every
render, nothing cached on the device); open blockers B-1 to B-4 are in `docs/LAUNCH_V1_AUDIT.md`.
