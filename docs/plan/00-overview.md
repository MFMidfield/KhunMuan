# 00 · Overview

## 1. Problem statement

The shop currently takes orders through phone messages and something
Google-Forms-shaped, and writes them down by hand. Once the queue gets busy the
process breaks in four specific ways, all reported by the owner:

1. **Duplicated or dropped orders** — two people cook the same ticket, or nobody
   cooks it.
2. **Wrong filling / wrong customisation** — the note is misread or lost.
3. **Wrong handover** — the box reaches the wrong person or the wrong meeting
   point.
4. **Payment amnesia** — nobody remembers whether an order was already paid.

Every architectural decision in this plan should be traceable to one of those
four failures. If a feature does not reduce one of them, it belongs in a later
phase.

## 2. Goals

| Goal | Success looks like |
|------|--------------------|
| G1 | No order can be cooked twice — ownership is visible before work starts |
| G2 | No order can be silently skipped — age and status are visible at a glance |
| G3 | The exact customisation travels with the ticket, unambiguously |
| G4 | Payment state is a first-class field, not a memory |
| G5 | The customer can answer "is it ready yet?" without asking staff |
| G6 | A filling that ran out cannot be ordered again that day |

## 3. Non-goals (explicitly out of scope for v1)

- Customer accounts, loyalty points, order history across devices
- Online card payments / payment gateway integration
- Automatic bank-slip verification (OCR or bank API)
- Rider dispatch, live delivery tracking, maps
- Table/dine-in management, POS hardware, receipt printers
- Multi-branch or multi-tenant support
- Inventory beyond a per-day remaining count per filling

## 4. Actors

| Actor | Auth | What they do |
|-------|------|--------------|
| **Customer** | none | Browse menu, build sets, choose pickup or delivery, place order, upload transfer slip, track status live, cancel before acceptance |
| **Admin** (staff) | Google OAuth, email allow-listed | Open/close shop, accept/reject orders, claim and cook, confirm payment, adjust stock, key in phone orders manually |
| **Superadmin** | Google OAuth, one locked email | Everything an admin can do, plus manage the admin list, edit the menu/prices/fillings, edit or delete completed orders, view sales reports, configure the order-code range |

There is no anonymous Supabase auth session for customers. Orders are created
through a public RPC; the returned order code is stored in the browser's
`localStorage` so the device can list "my orders" without any account.

## 5. Product model in one paragraph

The shop sells **sets**. A set has a name, a price, and a **piece quota** — the
number of roll pieces it contains. When ordering a set the customer distributes
that quota across the available **fillings** in any combination (10 pieces could
be 10 different fillings, or 10 of the same). All fillings cost the same and are
included in the set price. On top of that the customer picks **add-ons** —
dipping sauces and utensils/packaging — each of which may or may not carry an
extra charge depending on how the back office configured it, and may leave a
free-text note. Several configured sets go into a cart and are paid for as one
order.

## 6. Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| UI | React 19 + TypeScript + Vite | Already scaffolded in `frontend/` |
| Styling | Tailwind CSS v4 | Design tokens as CSS variables, see doc 04 |
| Routing | React Router v7 (data router) | |
| Server state | TanStack Query | Cache + optimistic updates + realtime invalidation |
| Forms | React Hook Form + Zod | Zod schemas shared with RPC payload validation |
| Backend | Supabase — Postgres, Auth, Realtime, Storage, Edge Functions | Local via CLI in `backend/supabase/`, production on Supabase Cloud |
| Auth | Google OAuth (staff only) | Allow-list enforced in the DB, not just in the UI |
| Hosting | Vercel | Preview deploys per branch |
| Notifications | Supabase Realtime (customer + back office), LINE Messaging API via Edge Function (staff group) | |

### Why the logic lives in Postgres

Order placement, status transitions, claiming and stock decrement are all
implemented as `SECURITY DEFINER` Postgres functions rather than client-side
writes. Reasons:

- **Atomicity.** Placing an order must decrement stock for every filling in
  every set, or fail entirely. That is one transaction.
- **Concurrency.** Six staff on flaky campus wifi will race each other. Row-level
  locks in a function are the only honest answer.
- **Trust.** The customer client is unauthenticated. It must never be able to
  set a price, a status, or a stock number.

The client's write surface is therefore small: `place_order`, `cancel_order`,
`upload_slip`, and for staff `claim_order`, `advance_order`, `set_payment`,
plus ordinary CRUD on menu tables guarded by RLS.

## 7. Repository layout (target)

```
KhunMuan/
├── docs/plan/                 # this plan
├── backend/
│   └── supabase/
│       ├── config.toml
│       ├── migrations/        # numbered SQL migrations
│       ├── functions/         # edge functions (line-notify, order-lookup)
│       └── seed.sql           # dev seed: sets, fillings, pickup points
└── frontend/
    ├── src/
    │   ├── app/               # router, providers, layout shells
    │   ├── features/
    │   │   ├── menu/
    │   │   ├── cart/
    │   │   ├── checkout/
    │   │   ├── tracking/
    │   │   └── admin/
    │   ├── components/ui/     # design-system primitives
    │   ├── lib/               # supabase client, query client, i18n, utils
    │   └── types/             # generated DB types + domain types
    └── ...
```

Database types are generated with `supabase gen types typescript` into
`src/types/database.ts` and committed, so the frontend never guesses a column
name.
