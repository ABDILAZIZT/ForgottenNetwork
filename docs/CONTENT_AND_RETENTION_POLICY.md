# Contribution, moderation, and retention policy

Status: Phase 1 implementation baseline  
Last updated: 2026-09-08

Limits below are launch defaults and must be configuration values rather than constants scattered across the client.

## Contribution limits

### Drawing

- Maximum brush size: 24 pixels
- Maximum affected pixels in one accepted stroke: 10,000
- Maximum stroke submissions: 30 per minute per member
- Maximum affected pixels: 50,000 per rolling day per member
- Requests also receive IP-based abuse protection without treating IP address as identity

### Entities

- Maximum published entities: 10 per rolling day for a new member
- Maximum active entities: 100 per member
- Maximum placement scale: 10×, subject to processed media dimensions
- Entity name: 1–60 characters
- Description: 0–500 characters
- Metadata is plain text

Limits can be raised for established or event-approved members without changing their role.

## Media policy

Initial accepted formats:

- PNG
- JPEG
- WebP
- GIF

Initial processing limits:

- Maximum uploaded file: 8 MiB
- Maximum decoded dimensions: 512×512
- Maximum animated frames: 120
- Maximum animation duration: 12 seconds per loop
- Maximum playback rate is server controlled
- SVG and arbitrary remote image URLs are not accepted in the MVP

The server verifies decoded content instead of trusting file extensions or browser-provided MIME types. Published media uses processed files and thumbnails; original uploads are never executed or rendered as active content.

## Prohibited content

Content may be hidden or removed when it includes illegal material, credible threats, targeted harassment, non-consensual intimate imagery, sexual content involving minors, malicious code, impersonation intended to deceive, private identifying information, or repeated spam and vandalism.

The launch interface should summarize these rules in plain language before a member first publishes.

## Reports

- Visitors and members may report an entity or bounded region.
- A report requires a category and may contain a short explanation.
- Duplicate reports from the same actor are consolidated.
- Report submission is rate-limited.
- Reports do not automatically delete content, but severe automated safety signals may temporarily hide media pending review.
- Resolution records the moderator, timestamp, reason, and action.

## Retention schedule

| Data                              | Default retention                      | Reason                                    |
| --------------------------------- | -------------------------------------- | ----------------------------------------- |
| Current chunk state               | Until superseded or world deletion     | Authoritative world                       |
| Chunk/edit-event history          | 90 days                                | Undo, vandalism recovery, disputes        |
| Soft-deleted entities             | 30 days                                | Accidental deletion and moderation review |
| Replaced entity metadata versions | 30 days                                | Abuse review and restoration              |
| Unpublished uploads               | 24 hours                               | Finish interrupted publishing and cleanup |
| Unreferenced processed assets     | 7 days                                 | Safe garbage-collection delay             |
| Resolved reports                  | 180 days                               | Repeated-abuse detection and appeals      |
| Moderator audit log               | 1 year minimum                         | Accountability and incident review        |
| Security/request logs             | 30 days                                | Abuse and reliability investigation       |
| Database backups                  | 30 daily copies plus 12 monthly copies | Disaster recovery                         |

Retention must be reviewed against the law and hosting region before production. Security logs should minimize or hash network identifiers where practical and must never contain passwords, session secrets, or uploaded file bodies.

## Account deletion

- Authentication access and personal profile data are removed or anonymized after the required confirmation flow.
- Public pixel history may be attributed to a neutral deleted-account label.
- Public entities are removed unless the user explicitly transfers eligible work under a future feature.
- Moderation and security records retain pseudonymous immutable IDs for their stated retention period.
- Backups expire on their normal schedule rather than being edited in place.

## Recovery objectives

Before public launch, the project must define infrastructure-specific objectives. The product baseline is:

- Recovery point objective: no more than 24 hours of accepted contributions lost in a catastrophic database failure
- Recovery time objective: restore read-only exploration within 8 hours
- A restoration test must be completed and documented before launch
