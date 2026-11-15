# Notes — how this bank is maintained

The bank is generated from the live Graphics Command Center library, it is not hand-curated.

- Live site: https://site-d460edd452c14327949ad468417abf82.freebuff.page
- Full catalogue: `memory/graphics/catalog.csv`, rebuilt by the sync workflow
- Seed committed at import: `memory/graphics/catalog-seed.csv`
- Assets in the live library at import: 1663

## Scanning

Four stockpile passes a day at 00:30, 08:00, 14:00 and 20:00 local time. A pass runs up to 25 minutes
and 400 ingest jobs across the whole taxonomy, de-duplicating by provider id plus a dHash distance of 3,
so the same picture is never stored twice.

## Licence policy

- Public domain, CC0, commercial stock and AI references: admitted.
- CC BY: admitted, attribution stored in `metadata.notes` and `metadata.author`.
- CC BY-SA and non-commercial licences: excluded by default.

## Regenerating

Run `node tools/sync-bank.mjs` (or dispatch the **Sync graphics bank** workflow) and `catalog.csv` plus
`reports/library-snapshot.md` are rewritten from whatever the live library currently holds. Images stay on
the provider CDNs, so the repository stores references, palettes and notes rather than gigabytes of
duplicated files.
