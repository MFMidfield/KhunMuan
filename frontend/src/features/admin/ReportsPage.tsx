import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { money } from '@/lib/i18n'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { fieldClass } from './config/editorStyles'
import type { Database } from '@/types/database'

type Tab = 'sales' | 'fillings' | 'timing'
type OrderStatus = Database['public']['Enums']['order_status']

/**
 * Q19 asked which periods the shop wants — daily, weekly, monthly, export.
 * A date range answers all of them without the question being settled: a week
 * is a range, a month is a range, and the export is these rows as CSV.
 *
 * Q20 asked for per-set cost so this could show profit. It is still open, so
 * every figure here says revenue and means revenue. A profit column computed
 * from a cost nobody supplied would be worse than no column.
 */
export function ReportsPage() {
  const { t } = useTranslation(['admin', 'common'])
  const [tab, setTab] = useState<Tab>('sales')
  const [from, setFrom] = useState(() => isoDaysAgo(6))
  const [to, setTo] = useState(() => isoDaysAgo(0))

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{t('admin:rep.title')}</h1>

      <Card className="flex flex-col gap-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.85rem] font-medium">{t('admin:rep.from')}</span>
            <input type="date" className={fieldClass} value={from}
                   onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.85rem] font-medium">{t('admin:rep.to')}</span>
            <input type="date" className={fieldClass} value={to}
                   onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <div className="scroll-strip flex gap-2">
          {[
            { label: t('admin:rep.today'), days: 0 },
            { label: t('admin:rep.week7'), days: 6 },
            { label: t('admin:rep.month30'), days: 29 },
          ].map((preset) => (
            <button
              key={preset.days}
              type="button"
              onClick={() => {
                setFrom(isoDaysAgo(preset.days))
                setTo(isoDaysAgo(0))
              }}
              className="snap-item min-h-11 shrink-0 rounded-full border border-border bg-surface px-4 text-[0.9rem] text-ink-muted"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </Card>

      <div role="tablist" className="scroll-strip -mx-4 flex gap-2 px-4">
        {(['sales', 'fillings', 'timing'] as Tab[]).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={[
              'snap-item min-h-11 shrink-0 rounded-full border px-4 text-[0.9rem]',
              tab === key
                ? 'border-ink bg-surface-2 font-medium text-ink'
                : 'border-border bg-surface text-ink-muted',
            ].join(' ')}
          >
            {t(`admin:rep.tab${key[0]!.toUpperCase()}${key.slice(1)}`)}
          </button>
        ))}
      </div>

      {tab === 'sales' && <SalesReport from={from} to={to} />}
      {tab === 'fillings' && <FillingsReport from={from} to={to} />}
      {tab === 'timing' && <TimingReport from={from} to={to} />}
    </div>
  )
}

function SalesReport({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation('admin')
  const { data, isPending } = useQuery({
    queryKey: ['report', 'sales', from, to],
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc('report_sales', {
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return rows
    },
  })

  if (isPending) return <PageSpinner />
  if (!data?.length) return <EmptyReport />

  const totals = data.reduce(
    (acc, r) => ({
      completed: acc.completed + Number(r.completed),
      lost: acc.lost + Number(r.lost),
      revenue: acc.revenue + Number(r.revenue),
      cash: acc.cash + Number(r.cash),
      transfer: acc.transfer + Number(r.transfer),
    }),
    { completed: 0, lost: 0, revenue: 0, cash: 0, transfer: 0 },
  )

  return (
    <ReportTable
      note={t('rep.revenueOnly')}
      csvName={`sales-${from}-${to}`}
      head={[
        t('rep.date'), t('rep.completed'), t('rep.lost'),
        t('rep.revenue'), t('rep.cash'), t('rep.transfer'),
      ]}
      rows={data.map((r) => [
        r.service_date,
        String(r.completed),
        String(r.lost),
        String(r.revenue),
        String(r.cash),
        String(r.transfer),
      ])}
      display={data.map((r) => [
        r.service_date,
        String(r.completed),
        String(r.lost),
        money.format(Number(r.revenue)),
        money.format(Number(r.cash)),
        money.format(Number(r.transfer)),
      ])}
      footer={[
        t('rep.totalRow'),
        String(totals.completed),
        String(totals.lost),
        money.format(totals.revenue),
        money.format(totals.cash),
        money.format(totals.transfer),
      ]}
    />
  )
}

function FillingsReport({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation('admin')
  const { data, isPending } = useQuery({
    queryKey: ['report', 'fillings', from, to],
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc('report_fillings', {
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return rows
    },
  })

  if (isPending) return <PageSpinner />
  if (!data?.length) return <EmptyReport />

  const cells = data.map((r) => [r.filling_name, String(r.pieces), String(r.orders)])

  return (
    <ReportTable
      note={t('rep.fillingsNote')}
      csvName={`fillings-${from}-${to}`}
      head={[t('rep.fillingName'), t('rep.pieces'), t('rep.orderCount')]}
      rows={cells}
      display={cells}
    />
  )
}

function TimingReport({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation(['admin', 'tracking'])
  const { data, isPending } = useQuery({
    queryKey: ['report', 'timing', from, to],
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc('report_stage_timing', {
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return rows
    },
  })

  if (isPending) return <PageSpinner />
  if (!data?.length) return <EmptyReport />

  const cells = data.map((r) => [
    t(`tracking:status.${r.to_status as OrderStatus}`),
    String(r.avg_minutes),
    String(r.median_minutes),
    String(r.samples),
  ])

  return (
    <ReportTable
      note={t('admin:rep.timingNote')}
      csvName={`timing-${from}-${to}`}
      head={[
        t('admin:rep.stage'), t('admin:rep.avgMinutes'),
        t('admin:rep.medianMinutes'), t('admin:rep.samples'),
      ]}
      rows={cells}
      display={cells}
    />
  )
}

function EmptyReport() {
  const { t } = useTranslation('admin')
  return <Card className="p-5 text-ink-muted">{t('rep.empty')}</Card>
}

function ReportTable({
  head,
  rows,
  display,
  footer,
  note,
  csvName,
}: {
  head: string[]
  /** Raw values, for the CSV. */
  rows: string[][]
  /** Formatted values, for the screen. */
  display: string[][]
  footer?: string[]
  note?: string
  csvName: string
}) {
  const { t } = useTranslation('admin')

  return (
    <Card className="flex flex-col gap-3 p-4">
      {note && <p className="text-[0.85rem] text-ink-muted">{note}</p>}

      {/* The table scrolls inside its own box. The page body never scrolls
          sideways, on any screen, and a six-column report on a phone is exactly
          the case that rule exists for. */}
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-max border-collapse text-[0.9rem]">
          <thead>
            <tr className="border-b border-border text-start">
              {head.map((h, i) => (
                <th key={h} className={i === 0 ? 'py-2 pe-4 text-start font-medium'
                                                : 'py-2 pe-4 text-end font-medium'}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map((row, r) => (
              <tr key={r} className="border-b border-border/60">
                {row.map((cell, c) => (
                  <td key={c} className={c === 0 ? 'py-2 pe-4' : 'tnum py-2 pe-4 text-end'}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr className="font-semibold">
                {footer.map((cell, c) => (
                  <td key={c} className={c === 0 ? 'py-2 pe-4' : 'tnum py-2 pe-4 text-end'}>
                    {cell}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Button variant="ghost" className="self-start" onClick={() => downloadCsv(csvName, head, rows)}>
        {t('rep.export')}
      </Button>
    </Card>
  )
}

/** Raw values, not the formatted ones — a spreadsheet wants 259, not ฿259.00. */
function downloadCsv(name: string, head: string[], rows: string[][]) {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const csv = [head, ...rows].map((r) => r.map(escape).join(',')).join('\n')

  // A BOM, because Excel opens a UTF-8 CSV without one as mojibake and every
  // filling name here is Thai.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
