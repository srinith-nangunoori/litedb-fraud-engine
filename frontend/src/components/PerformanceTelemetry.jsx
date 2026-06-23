import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const CHART_STYLE = {
  stroke: '#27272a',
  fontSize: 11,
  fill: '#71717a',
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-neutral-800 bg-[#09090b] px-4 py-3">
      <p className="mb-2 text-xs text-zinc-500">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="font-mono text-xs text-white tabular-nums"
        >
          {entry.name}: {Math.round(entry.value).toLocaleString()} µs
        </p>
      ))}
    </div>
  )
}

export default function PerformanceTelemetry({ transactions }) {
  const txnData = useMemo(
    () => transactions.filter((item) => item.type === 'TXN').slice(0, 40),
    [transactions],
  )

  const lineChartData = useMemo(() => {
    const reversed = [...txnData].reverse()

    return reversed.map((txn, index) => {
      const slice = reversed.slice(0, index + 1)
      const avg =
        slice.reduce((acc, item) => acc + item.data.t_total, 0) / slice.length

      return {
        label: `#${index + 1}`,
        t_total: txn.data.t_total,
        avg_total: Math.round(avg),
      }
    })
  }, [txnData])

  const barChartData = useMemo(() => {
    if (txnData.length === 0) {
      return [
        { category: 'Memory', value: 0 },
        { category: 'Disk', value: 0 },
      ]
    }

    const memorySum = txnData.reduce(
      (acc, txn) => acc + txn.data.t_bloom + txn.data.t_velocity,
      0,
    )
    const diskSum = txnData.reduce((acc, txn) => acc + txn.data.t_disk, 0)
    const count = txnData.length

    return [
      {
        category: 'Memory',
        value: Math.round(memorySum / count),
        detail: 'T_BLOOM + T_VELOCITY',
      },
      {
        category: 'Disk',
        value: Math.round(diskSum / count),
        detail: 'T_DISK',
      },
    ]
  }, [txnData])

  const latestAvg = lineChartData[lineChartData.length - 1]?.avg_total ?? 0

  return (
    <section className="mx-auto max-w-6xl px-8 py-16">
      <header className="mb-12 space-y-2">
        <h2 className="text-2xl font-light tracking-tight text-white">
          Performance Telemetry
        </h2>
        <p className="text-sm leading-relaxed text-zinc-500">
          C++ engine latency profiling · memory vs disk persistence
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-900 bg-[#09090b] p-10">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <p className="text-xs tracking-[0.2em] text-zinc-600 uppercase">
                Average T_TOTAL
              </p>
              <p className="mt-2 font-mono text-3xl font-light text-white tabular-nums">
                {latestAvg.toLocaleString()}
                <span className="ml-2 text-sm text-zinc-500">µs</span>
              </p>
            </div>
            <p className="text-xs text-zinc-600">
              Rolling over {lineChartData.length} events
            </p>
          </div>

          <div className="h-72">
            {lineChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-zinc-500">Awaiting telemetry…</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineChartData}>
                  <CartesianGrid
                    stroke="#1a1a1a"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={CHART_STYLE}
                    axisLine={{ stroke: '#27272a' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={CHART_STYLE}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="avg_total"
                    name="Avg T_TOTAL"
                    stroke="#ffffff"
                    strokeWidth={1}
                    dot={false}
                    activeDot={{ r: 3, fill: '#ffffff', stroke: 'none' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-900 bg-[#09090b] p-10">
          <div className="mb-10">
            <p className="text-xs tracking-[0.2em] text-zinc-600 uppercase">
              Memory vs Disk
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              Average latency comparison across recent transactions
            </p>
          </div>

          <div className="h-72">
            {txnData.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-zinc-500">Awaiting telemetry…</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} barSize={48}>
                  <CartesianGrid
                    stroke="#1a1a1a"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="category"
                    tick={CHART_STYLE}
                    axisLine={{ stroke: '#27272a' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={CHART_STYLE}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="value"
                    name="Avg µs"
                    fill="#ffffff"
                    fillOpacity={0.85}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-8 space-y-3 border-t border-neutral-900 pt-8">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Memory (T_BLOOM + T_VELOCITY)</span>
              <span className="font-mono text-xs text-white tabular-nums">
                {barChartData[0]?.value.toLocaleString() ?? 0} µs
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Disk (T_DISK)</span>
              <span className="font-mono text-xs text-white tabular-nums">
                {barChartData[1]?.value.toLocaleString() ?? 0} µs
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
