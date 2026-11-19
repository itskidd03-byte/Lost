---
owner: D17
department: D17
revision: 1
project: God's Eye
status: draft
---

# God's Eye — Technical Architecture

## Deliverable

### Engine decision (ADR)

| Candidate | Meets hard requirements | Licence | Platform support | Rejected because |
| --- | --- | --- | --- | --- |
| | | | | |

### Runtime

- Game loop and update order:
- Frame budget split (simulation / rendering / audio / UI):
- Scene model and ownership:
- Module boundaries and owning department:

### Memory and assets

- Budgets per subsystem:
- Allocation policy:
- Asset loading and streaming strategy:

### Platform matrix

| Platform | Resolution | Quality tier | Build command |
| --- | --- | --- | --- |
| | | | |

### Data and persistence

- Save format and version:
- Migration path:
- Authority model where a server exists:

### Risks

What breaks first, and what is the fallback.

## Acceptance

| Criterion | Met | Evidence |
| --- | --- | --- |
| Engine choice recorded as an ADR with rejected alternatives | | |
| Loop, frame budget and module ownership documented | | |
| Memory budgets and allocation policy stated | | |
| Platform matrix with runnable build commands | | |

## Handoff

Which department owns which module, and which specs depend on this document.

## Open questions
