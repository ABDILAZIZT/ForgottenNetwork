# Roles, ownership, and permissions

Status: Phase 1 implementation baseline  
Last updated: 2026-09-08

Server authorization is authoritative. Hiding a control in the frontend never grants or removes permission.

## Roles

- **Visitor:** unauthenticated, read-only access
- **Member:** authenticated creator in good standing
- **Moderator:** member permissions plus content-safety actions
- **Administrator:** moderator permissions plus role and operational configuration

## Permission matrix

| Action                                  |    Visitor     | Member | Moderator | Administrator |
| --------------------------------------- | :------------: | :----: | :-------: | :-----------: |
| Explore public world                    |      Yes       |  Yes   |    Yes    |      Yes      |
| Inspect public entity metadata          |      Yes       |  Yes   |    Yes    |      Yes      |
| Use shareable location links            |      Yes       |  Yes   |    Yes    |      Yes      |
| Draw in Commons                         |       No       |  Yes   |    Yes    |      Yes      |
| Place an approved entity in Commons     |       No       |  Yes   |    Yes    |      Yes      |
| Edit own entity metadata                |       No       |  Yes   |    Yes    |      Yes      |
| Move own entity within allowed region   |       No       |  Yes   |    Yes    |      Yes      |
| Delete own entity                       |       No       |  Yes   |    Yes    |      Yes      |
| Modify another member's entity          |       No       |   No   |    No     |      No       |
| Submit a report                         | Yes, throttled |  Yes   |    Yes    |      Yes      |
| View moderation queue                   |       No       |   No   |    Yes    |      Yes      |
| Hide or restore reported content        |       No       |   No   |    Yes    |      Yes      |
| Restore region history                  |       No       |   No   |    Yes    |      Yes      |
| Suspend publishing privileges           |       No       |   No   |    Yes    |      Yes      |
| Assign moderator or administrator roles |       No       |   No   |    No     |      Yes      |
| Change global world policy              |       No       |   No   |    No     |      Yes      |

Moderators use dedicated moderation actions; they do not impersonate a creator or silently rewrite creator-owned entity metadata.

## Ownership

### Pixels

Commons pixels are shared world state and do not confer permanent ownership. Edit events preserve attribution for moderation and history. Gallery pixels are controlled by curatorial policy rather than individual pixel ownership.

### Entities and assets

The publishing member owns the entity record. An asset is owned by its uploader and may be referenced only according to server policy. Removing an entity does not immediately erase an asset required by retained history or moderation evidence.

### Accounts

Display names can change and are not ownership keys. All ownership checks use immutable account IDs assigned by the authentication system.

## Suspension behavior

- A publishing suspension removes drawing, upload, placement, update, and delete permissions.
- Exploration and access to an appeal or account-status screen remain available.
- Existing public contributions remain visible unless separately moderated.
- Account deletion follows the retention policy and does not destroy moderation audit records.

## Authorization invariants

1. Every mutation has an authenticated actor unless it is explicitly documented as a system operation.
2. Every mutation validates world, region, coordinates, payload, rate limit, and ownership on the server.
3. Client-supplied author names, roles, owner IDs, and timestamps are never trusted.
4. Moderator actions require a reason and create an immutable audit entry.
5. A hidden or deleted entity cannot be fetched from ordinary public endpoints.
6. Administrative APIs are separate from ordinary creation APIs and deny access by default.
