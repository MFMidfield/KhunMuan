import type { ReactNode } from 'react'

export interface AdminLink {
  to: string
  /** Key inside the `admin` namespace. */
  key: string
  end: boolean
  superadmin: boolean
  icon: ReactNode
}

const icon = (path: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    className="size-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {path}
  </svg>
)

/**
 * Three links a cook uses during a shift, and four the owner uses between them.
 * That split is what the phone tab bar is built on: the primary three get a
 * thumb-reachable tab each, the rest live behind one "more" sheet.
 */
export const PRIMARY_LINKS: AdminLink[] = [
  {
    to: '/admin',
    key: 'board',
    end: true,
    superadmin: false,
    icon: icon(
      <>
        <rect x="3" y="4" width="7" height="16" rx="1.5" />
        <rect x="14" y="4" width="7" height="10" rx="1.5" />
      </>,
    ),
  },
  {
    to: '/admin/new',
    key: 'newOrder',
    end: false,
    superadmin: false,
    icon: icon(
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M12 8.5v7M8.5 12h7" />
      </>,
    ),
  },
  {
    to: '/admin/stock',
    key: 'stock',
    end: false,
    superadmin: false,
    icon: icon(
      <>
        <path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5z" />
        <path d="M4 7.5 12 11l8-3.5M12 11v9" />
      </>,
    ),
  },
]

export const SECONDARY_LINKS: AdminLink[] = [
  {
    to: '/admin/menu',
    key: 'menu',
    end: false,
    superadmin: true,
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9.5h18M8.5 9.5V20" />
      </>,
    ),
  },
  {
    to: '/admin/settings',
    key: 'settings',
    end: false,
    // Visible to every admin, because open/close lives here and doc 04 §1 puts
    // that in ordinary staff hands. The superadmin-only editors on this screen
    // gate themselves inside the page.
    superadmin: false,
    icon: icon(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6" />
      </>,
    ),
  },
  {
    to: '/admin/reports',
    key: 'reports',
    end: false,
    superadmin: true,
    icon: icon(
      <>
        <path d="M4 20h16" />
        <path d="M7 20v-6M12 20V6M17 20v-9" />
      </>,
    ),
  },
  {
    to: '/admin/staff',
    key: 'staff',
    end: false,
    superadmin: true,
    icon: icon(
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.4c2 .7 3.3 2.4 3.3 4.6" />
      </>,
    ),
  },
]

export const MORE_ICON = icon(<path d="M4 7h16M4 12h16M4 17h16" />)

export function visibleLinks(links: AdminLink[], isSuper: boolean): AdminLink[] {
  return links.filter((l) => !l.superadmin || isSuper)
}
