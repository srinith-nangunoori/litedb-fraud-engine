import { useState } from 'react'

function StatusDot({ status }) {
  const color = status === 'APPROVED' ? '#10b981' : '#ef4444'
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  )
}

function formatTimestamp(unix) {
  return new Date(unix * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function TimingRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-t border-neutral-900 py-4 first:border-t-0">
      <span className="font-mono text-xs tracking-widest text-zinc-500 uppercase">
        {label}
      </span>
      <span className="font-mono text-sm text-white tabular-nums">
        {value.toLocaleString()} µs
      </span>
    </div>
  )
}

function TransactionCard({ transaction }) {
  const [expanded, setExpanded] = useState(false)
  const { data } = transaction

  return (
    <article
      className="rounded-2xl border border-neutral-900 bg-[#09090b] transition-all duration-300 ease-in-out"
    >
      <div className="p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <StatusDot status={data.status} />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-sm font-medium text-white">
                  {data.status === 'APPROVED' ? 'Approved' : 'Declined'}
                </span>
                <span className="text-xs text-zinc-500">
                  {formatTimestamp(data.timestamp)}
                </span>
              </div>

              <p className="font-mono text-xs leading-relaxed break-all text-zinc-400">
                {data.userId}
              </p>

              <p className="text-sm text-zinc-500">
                {data.merchantId}
                <span className="mx-2 text-neutral-800">·</span>
                {data.lat.toFixed(4)}, {data.lon.toFixed(4)}
              </p>

              {data.reason && (
                <p className="text-sm text-zinc-400">{data.reason}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <span className="font-mono text-xs text-zinc-600 tabular-nums">
              {data.t_total.toLocaleString()} µs total
            </span>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="text-xs tracking-wide text-zinc-500 uppercase transition-all duration-300 ease-in-out hover:text-white"
            >
              {expanded ? 'Collapse' : 'Inspect'}
            </button>
          </div>
        </div>
      </div>

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: expanded ? '420px' : '0px',
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="border-t border-neutral-900 px-8 pb-8">
          <p className="pt-6 pb-2 text-xs tracking-[0.2em] text-zinc-600 uppercase">
            C++ Engine Microsecond Breakdown
          </p>
          <TimingRow label="T_TOTAL" value={data.t_total} />
          <TimingRow label="T_LOCK" value={data.t_lock} />
          <TimingRow label="T_BLOOM" value={data.t_bloom} />
          <TimingRow label="T_VELOCITY" value={data.t_velocity} />
          <TimingRow label="T_DISK" value={data.t_disk} />
        </div>
      </div>
    </article>
  )
}

export default function ActivityLog({ transactions }) {
  const txnList = transactions.filter((item) => item.type === 'TXN')

  return (
    <section className="mx-auto max-w-4xl px-8 py-16">
      <header className="mb-12 space-y-2">
        <h2 className="text-2xl font-light tracking-tight text-white">
          Activity Log
        </h2>
        <p className="text-sm leading-relaxed text-zinc-500">
          Live transaction feed from the LiteDB C++ engine
        </p>
      </header>

      {txnList.length === 0 ? (
        <div className="rounded-2xl border border-neutral-900 bg-[#09090b] px-8 py-20 text-center">
          <p className="text-sm text-zinc-500">
            Awaiting live transactions from WebSocket gateway…
          </p>
        </div>
      ) : (
        <ul className="space-y-6">
          {txnList.map((transaction, index) => {
            // Create a guaranteed unique ID for React's internal tracking
            const uniqueKey = transaction.data.userId + transaction.data.timestamp + index + Math.random();
            return (
              <li key={uniqueKey}>
                <TransactionCard transaction={transaction} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  )
}
