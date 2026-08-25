# PROJECT_MAP

Where things live, and what to read before touching them.

## Read first

| File | For |
|------|-----|
| [`plan/README.md`](./plan/README.md) | Index plus every locked decision |
| [`plan/07-build-plan.md`](./plan/07-build-plan.md) | What is done, what is next, what is blocked on shop data |
| `plan/0X-*.md` | The decision behind whatever you are about to change |

Decisions in `plan/` are locked. Changing one means editing the document too,
not just the code.

## Layout

```
KhunMuan/
├── docs/
│   ├── PROJECT_MAP.md          this file
│   ├── design-prompt.md
│   └── plan/                   00–07 plus UI mockups (stitch_*)
├── backend/
│   ├── package.json            pins the Supabase CLI; npm run start/reset/types
│   └── supabase/
│       ├── config.toml         local stack; Google OAuth reads supabase/.env
│       ├── .env                Google client id + secret (gitignored)
│       └── migrations/         0001–0009, applied in filename order
└── frontend/
    ├── .env.local              VITE_SUPABASE_URL + ANON_KEY (gitignored)
    └── src/
        ├── app/                router, providers, layouts, guards, error page
        ├── features/           admin, auth (menu/cart/checkout/tracking: Phase 1)
        ├── components/ui/      Button, Card, Input, Spinner, StatusBadge, ThemeToggle
        ├── lib/                supabase, queryClient, i18n, locales, theme, storage
        └── types/database.ts   generated — never edited by hand
```

## Migrations

| File | Contents |
|------|----------|
| `0001_extensions_enums.sql` | Schemas, enums, the shared `updated_at` function |
| `0002_config.sql` | `shop_settings`, `admin_users`, `shop_today()`, identity helpers, auth-link triggers |
| `0003_locations.sql` | `pickup_points`, `pickup_slots`, `delivery_zones` |
| `0004_menu.sql` | `sets`, `fillings`, `addons`, `filling_stock_daily` |
| `0005_orders.sql` | `orders` and children, `payments`, `order_events` |
| `0006_indexes.sql` | Board/report indexes plus an index on every foreign key |
| `0007_updated_at.sql` | The trigger, attached to every mutable table |
| `0008_seed_superadmin.sql` | **Contains the one line to edit before any cloud deploy** |
| `0009_rls.sql` | Grants and row-level security |

## Commands

```bash
# backend
cd backend
npm run start      # supabase start
npm run reset      # re-apply every migration from empty
npm run types      # regenerate frontend/src/types/database.ts

# frontend
cd frontend
npm run dev
npm run build      # tsc -b && vite build
```

Run `npm run types` after **every** migration that changes a table. The
generated file is committed so the frontend never guesses a column name.

## Edge Functions

`track`, `slip-upload-url`, `slip-prune`, all under `backend/supabase/functions/`.

A **newly created** function directory is invisible to the local edge runtime
until the stack is stopped and started — `npm run reset` is not enough, and the
symptom is a plain `404 Function not found` that looks exactly like a routing
mistake:

```bash
cd backend && npm run stop && npm run start
```

Editing a file inside a function the runtime already knows about hot-reloads
normally.

## Things that will bite you

- **`SUPERADMIN_EMAIL_PLACEHOLDER@example.com`** in `0008` must become the real
  address before the first push to Supabase Cloud. The superadmin row cannot be
  created through the API afterwards.
- **Two golds, and they are not interchangeable.** `--gold` is a fill and is
  unreadable as text; `--gold-ink` is text and wrong as a fill. In dark mode
  they swap. Use the tokens, never the hex.
- **The primary button's 1.5px outline is accessibility, not decoration.**
  Gold on the page ground is 1.33:1, below the 3:1 WCAG 1.4.11 needs.
- **Nothing reaches the Data API until it is granted by name.**
  `auto_expose_new_tables` is off, so a new table is invisible until `0009`-style
  grants are added — and RLS alone cannot restrict columns.
- **`search_path = ''` hides extension operators.** That is why emails are
  lower-cased `text` rather than `citext`; see doc 01 §2.
- **No string literals in JSX.** Everything goes through `t()`, placeholders
  included.
- **`service_role` is granted nothing by default either.** `auto_expose_new_tables`
  strips DML from all three roles, not just anon — and a missing grant returns
  zero rows, which reads as "not found" rather than "not allowed". See migration
  0020 for the bug that cost.
- **`revoke ... from anon` does not undo a grant to `PUBLIC`.** `create function`
  grants EXECUTE to PUBLIC and anon inherits it. Revoke from `public`, then
  grant back to the roles that should keep it.
