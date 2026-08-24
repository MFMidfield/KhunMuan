import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { useShopSettings } from '@/features/menu/queries'

/**
 * The landing page — the first thing a customer sees, and the only screen in
 * the app whose job is persuasion rather than a task.
 *
 * Three things have to survive being read on a phone in four seconds: what this
 * shop sells, the button that starts an order, and how to reach a human. They
 * are in that order down the page, and the order button appears twice — once in
 * the hero and once at the bottom of the fold-and-a-half of explanation — so a
 * thumb finds it whether the reader skimmed or scrolled.
 *
 * The staff entrance is a small footer link on purpose. Six people use it and
 * everyone else must not wonder whether they were supposed to sign in.
 */
export function HomePage() {
  const { t } = useTranslation(['home', 'common'])
  // No spinner and no error branch. Everything this page needs a setting for is
  // decoration around a button that works regardless: while the query is in
  // flight, or if it fails outright, the hero still renders and still links to
  // the menu. A landing page that shows a loading state has failed at the one
  // thing it exists to do.
  const { data: settings } = useShopSettings()

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <section className="flex flex-col items-start gap-4 pt-2 sm:pt-6">
        {settings && <OpenPill open={settings.is_open} />}

        {/* The name appears in the header too, and repeating it here is the
            point: the header wordmark is 18px navigation furniture, and this is
            the one screen where someone arriving from a poster has to learn
            whose shop they are looking at. */}
        <p className="font-semibold text-gold-ink">{t('common:appName')}</p>

        <h1 className="-mt-3 text-3xl leading-tight font-bold sm:text-4xl lg:text-5xl">
          {t('home:tagline')}
        </h1>

        <p className="max-w-prose text-ink-muted">{t('home:lead')}</p>

        {settings && !settings.is_open && settings.closed_message && (
          <p className="max-w-prose break-words text-[0.9rem] text-ink-muted">
            {settings.closed_message}
          </p>
        )}

        {/* Full width on a phone, side by side from sm: the primary action gets
            the whole thumb-width of a 360px screen rather than sharing it. */}
        {/* The only order button on the page. There used to be a second one
            below the contact card; the side nav now carries the menu link on
            every screen, so a reader who scrolled past this one is a tap from
            ordering wherever they stopped. */}
        <div className="flex w-full flex-col gap-3 pt-1 sm:w-auto sm:flex-row">
          <PrimaryLink to="/menu">{t('home:orderNow')}</PrimaryLink>
          <GhostLink to="/my-orders">{t('home:trackOrder')}</GhostLink>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('home:how.title')}</h2>

        {/* role="list" is not redundant: a display other than list-item strips
            the list semantics in Safari and VoiceOver stops announcing "3
            items", which is the whole value of numbering the steps. */}
        <ol role="list" className="grid gap-3 sm:grid-cols-3">
          <Step n={1} title={t('home:how.step1')} detail={t('home:how.step1detail')} />
          <Step n={2} title={t('home:how.step2')} detail={t('home:how.step2detail')} />
          <Step n={3} title={t('home:how.step3')} detail={t('home:how.step3detail')} />
        </ol>
      </section>

      <ContactSection
        phone={settings?.contact_phone ?? null}
        email={settings?.contact_email ?? null}
        instagram={settings?.contact_instagram ?? null}
      />

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-5 text-[0.85rem] text-ink-muted">
        <span>{t('home:staffTitle')}</span>
        <Link
          to="/admin"
          className="inline-flex min-h-11 items-center text-gold-ink hover:underline"
        >
          {t('home:staffEntry')}
        </Link>
      </footer>
    </div>
  )
}

/**
 * Open/closed as a chip, and never as a colour alone — the same rule the status
 * badges follow. Cool tones only: gold means "this is the brand" everywhere in
 * this app and never "this is a state".
 */
function OpenPill({ open }: { open: boolean }) {
  const { t } = useTranslation('home')

  return (
    <span
      className={[
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.85rem] font-medium',
        open
          ? 'bg-st-ready-bg text-st-ready-fg'
          : 'bg-st-pending-bg text-st-pending-fg',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'size-2 rounded-full',
          open ? 'bg-st-ready-fg' : 'bg-st-pending-fg',
        ].join(' ')}
      />
      {open ? t('openNow') : t('closedNow')}
    </span>
  )
}

function Step({ n, title, detail }: { n: number; title: string; detail: string }) {
  return (
    <li>
      <Card className="flex h-full gap-3 p-4">
        {/* The number is decoration: the ordered list already numbers itself for
            a screen reader, and hearing "one, one, เลือกเซต" is noise. */}
        <span
          aria-hidden="true"
          className="tnum size-7 shrink-0 rounded-full bg-gold-wash text-center leading-7 font-semibold text-gold-ink"
        >
          {n}
        </span>
        <span className="min-w-0">
          <span className="block font-medium break-words">{title}</span>
          <span className="mt-0.5 block text-[0.85rem] break-words text-ink-muted">
            {detail}
          </span>
        </span>
      </Card>
    </li>
  )
}

function ContactSection({
  phone,
  email,
  instagram,
}: {
  phone: string | null
  email: string | null
  instagram: string | null
}) {
  const { t } = useTranslation('home')
  const nothingSet = !phone && !email && !instagram

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('contact.title')}</h2>

      <Card className="p-2">
        {nothingSet ? (
          <p className="p-3 text-[0.9rem] text-ink-muted">{t('contact.empty')}</p>
        ) : (
          <ul className="flex flex-col">
            {phone && (
              <ContactRow
                label={t('contact.phone')}
                value={phone}
                // tel: wants no spaces or brackets; the stored value keeps them
                // because that is the readable form.
                href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                mono
                icon={
                  <path d="M6.5 3h3l1.5 4-2 1.4a12 12 0 0 0 5.6 5.6L16 12l4 1.5v3a1.5 1.5 0 0 1-1.7 1.5A15.5 15.5 0 0 1 5 5.7 1.5 1.5 0 0 1 6.5 3Z" />
                }
              />
            )}

            {email && (
              <ContactRow
                label={t('contact.email')}
                value={email}
                href={`mailto:${email}`}
                icon={
                  <>
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3.5 7 8.5 6 8.5-6" />
                  </>
                }
              />
            )}

            {instagram && (
              <ContactRow
                label={t('contact.instagram')}
                // Stored bare; the @ is presentation and the URL cannot carry
                // one, so it is added here and only here.
                value={`@${instagram}`}
                href={`https://instagram.com/${instagram}`}
                external
                icon={
                  <>
                    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
                  </>
                }
              />
            )}
          </ul>
        )}
      </Card>
    </section>
  )
}

function ContactRow({
  label,
  value,
  href,
  icon,
  mono = false,
  external = false,
}: {
  label: string
  value: string
  href: string
  icon: ReactNode
  mono?: boolean
  external?: boolean
}) {
  return (
    <li className="border-b border-border last:border-0">
      {/* The whole row is the link, not the value inside it: a phone number is a
          small target and this is a page read one-handed. */}
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        className="flex min-h-11 items-center gap-3 rounded-btn p-3 hover:bg-surface-2"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5 shrink-0 text-ink-muted"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon}
        </svg>

        <span className="min-w-0 flex-1">
          <span className="block text-[0.75rem] text-ink-muted">{label}</span>
          <span
            className={[
              'block break-words text-gold-ink',
              mono ? 'tnum' : '',
            ].join(' ')}
          >
            {value}
          </span>
        </span>
      </a>
    </li>
  )
}

/**
 * Gold fill, ink text, 1.5px ink edge — the Button variant, as a link.
 *
 * These are navigations and not actions, so they have to be real anchors:
 * middle-click, long-press-to-open, and the browser's own focus order all
 * depend on it. The classes are duplicated from Button rather than shared
 * because a `Button` that sometimes renders an `<a>` is the component every
 * design system regrets.
 */
function PrimaryLink({
  to,
  children,
  className = '',
}: {
  to: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      to={to}
      className={[
        'inline-flex min-h-12 items-center justify-center rounded-btn px-6 font-medium',
        'border-[1.5px] border-gold-edge bg-gold-fill text-ink hover:bg-gold-hover',
        className,
      ].join(' ')}
    >
      {children}
    </Link>
  )
}

function GhostLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={[
        'inline-flex min-h-12 items-center justify-center rounded-btn px-6 font-medium',
        'border-[1.5px] border-border-strong text-ink hover:bg-surface-2',
      ].join(' ')}
    >
      {children}
    </Link>
  )
}
