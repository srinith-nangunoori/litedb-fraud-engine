import { useEffect, useState } from 'react'

const API_BASE = 'http://localhost:5001'
const GRAPH_SIZE = 420
const CENTER = GRAPH_SIZE / 2
const ORBIT_RADIUS = 140

function SyndicateGraph({ data }) {
  const { merchantId, totalUsers, compromisedCount, compromisedUsers } = data
  const safeUsers = Math.max(totalUsers - compromisedCount, 0)

  const allUsers = []

  compromisedUsers.forEach((id, index) => {
    allUsers.push({ id, compromised: true, index })
  })

  for (let i = 0; i < safeUsers; i += 1) {
    allUsers.push({
      id: `user_safe_${i}`,
      compromised: false,
      index: compromisedUsers.length + i,
    })
  }

  const nodes = allUsers.map((user, i) => {
    const angle = (i / Math.max(allUsers.length, 1)) * Math.PI * 2 - Math.PI / 2
    return {
      ...user,
      x: CENTER + ORBIT_RADIUS * Math.cos(angle),
      y: CENTER + ORBIT_RADIUS * Math.sin(angle),
    }
  })

  return (
    <svg
      viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`}
      className="mx-auto h-auto w-full max-w-md"
      role="img"
      aria-label={`Syndicate graph for ${merchantId}`}
    >
      {nodes.map((node) => (
        <line
          key={`line-${node.id}`}
          x1={CENTER}
          y1={CENTER}
          x2={node.x}
          y2={node.y}
          stroke="#27272a"
          strokeWidth="0.5"
        />
      ))}

      {nodes.map((node) => (
        <g key={`node-${node.id}`}>
          <circle
            cx={node.x}
            cy={node.y}
            r={node.compromised ? 6 : 5}
            fill={node.compromised ? '#ef4444' : '#52525b'}
            fillOpacity={0.9}
          />
          {node.compromised && (
            <circle
              cx={node.x}
              cy={node.y}
              r={10}
              fill="none"
              stroke="#ef4444"
              strokeWidth={0.5}
              strokeOpacity={0.4}
            />
          )}
        </g>
      ))}

      <circle
        cx={CENTER}
        cy={CENTER}
        r={22}
        fill="#09090b"
        stroke="#ef4444"
        strokeWidth={1}
        strokeOpacity={0.6}
      />
      <circle cx={CENTER} cy={CENTER} r={6} fill="#ef4444" fillOpacity={0.8} />

      <text
        x={CENTER}
        y={GRAPH_SIZE - 24}
        textAnchor="middle"
        fill="#71717a"
        fontSize="10"
        fontFamily="ui-monospace, monospace"
      >
        {merchantId}
      </text>
    </svg>
  )
}

export default function SyndicateExplorer({ blacklistedMerchants }) {
  const [selectedMerchant, setSelectedMerchant] = useState(null)
  const [cache, setCache] = useState({})

  const activeMerchant =
    selectedMerchant ?? blacklistedMerchants[0] ?? null

  const entry = activeMerchant ? cache[activeMerchant] : null
  const syndicateData = entry?.data ?? null
  const error = entry?.error ?? null
  const loading = Boolean(activeMerchant && !entry)

  useEffect(() => {
    if (!activeMerchant || cache[activeMerchant]) {
      return undefined
    }

    let cancelled = false

    fetch(`${API_BASE}/api/syndicate/${encodeURIComponent(activeMerchant)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load syndicate data')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          setCache((prev) => ({
            ...prev,
            [activeMerchant]: { data },
          }))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCache((prev) => ({
            ...prev,
            [activeMerchant]: { error: err.message },
          }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeMerchant, cache])

  return (
    <section className="mx-auto max-w-6xl px-8 py-16">
      <header className="mb-12 space-y-2">
        <h2 className="text-2xl font-light tracking-tight text-white">
          Syndicate Explorer
        </h2>
        <p className="text-sm leading-relaxed text-zinc-500">
          Bipartite graph intelligence · compromised user networks
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-neutral-900 bg-[#09090b] p-8">
          <p className="mb-6 text-xs tracking-[0.2em] text-zinc-600 uppercase">
            Blacklisted Merchants
          </p>

          {blacklistedMerchants.length === 0 ? (
            <p className="text-sm leading-relaxed text-zinc-500">
              No fraud ring alerts detected. Merchants will appear here when
              ALERT events are received.
            </p>
          ) : (
            <ul className="space-y-2">
              {blacklistedMerchants.map((merchantId) => (
                <li key={merchantId}>
                  <button
                    type="button"
                    onClick={() => setSelectedMerchant(merchantId)}
                    className={`w-full rounded-xl px-4 py-4 text-left font-mono text-xs transition-all duration-300 ease-in-out ${
                      activeMerchant === merchantId
                        ? 'bg-[#121214] text-white'
                        : 'text-zinc-500 hover:bg-[#121214]/50 hover:text-zinc-300'
                    }`}
                  >
                    {merchantId}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="rounded-2xl border border-neutral-900 bg-[#09090b] p-12">
          {!activeMerchant ? (
            <div className="flex h-96 items-center justify-center">
              <p className="text-sm text-zinc-500">
                Select a blacklisted merchant to explore syndicate connections
              </p>
            </div>
          ) : loading ? (
            <div className="flex h-96 items-center justify-center">
              <p className="text-sm text-zinc-500">Loading syndicate intel…</p>
            </div>
          ) : error ? (
            <div className="flex h-96 items-center justify-center">
              <p className="text-sm text-zinc-500">{error}</p>
            </div>
          ) : syndicateData ? (
            <div className="space-y-12">
              <div className="grid gap-8 sm:grid-cols-3">
                <div>
                  <p className="text-xs tracking-[0.2em] text-zinc-600 uppercase">
                    Total Users
                  </p>
                  <p className="mt-2 font-mono text-2xl font-light text-white tabular-nums">
                    {syndicateData.totalUsers}
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.2em] text-zinc-600 uppercase">
                    Compromised
                  </p>
                  <p className="mt-2 font-mono text-2xl font-light text-[#ef4444] tabular-nums">
                    {syndicateData.compromisedCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.2em] text-zinc-600 uppercase">
                    Safe
                  </p>
                  <p className="mt-2 font-mono text-2xl font-light text-white tabular-nums">
                    {syndicateData.totalUsers - syndicateData.compromisedCount}
                  </p>
                </div>
              </div>

              <SyndicateGraph data={syndicateData} />

              {syndicateData.compromisedUsers.length > 0 && (
                <div className="border-t border-neutral-900 pt-8">
                  <p className="mb-4 text-xs tracking-[0.2em] text-zinc-600 uppercase">
                    Compromised Tokens
                  </p>
                  <ul className="space-y-3">
                    {syndicateData.compromisedUsers.map((token) => (
                      <li
                        key={token}
                        className="font-mono text-xs leading-relaxed break-all text-zinc-400"
                      >
                        {token}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
