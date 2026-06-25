import { useEffect, useState } from 'react'

const API_BASE = 'http://localhost:5001'
const GRAPH_SIZE = 460
const CENTER = GRAPH_SIZE / 2
const ORBIT_RADIUS = 158
const MERCHANT_R = 26
const COMPROMISED_R = 7
const SAFE_R = 5.5

// ─────────────────────────────────────────────────────────────────────────────
// GRAPH COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
function SyndicateGraph({ data }) {
  const { merchantId, totalUsers, compromisedCount, compromisedUsers } = data
  const safeCount = Math.max(totalUsers - compromisedCount, 0)

  // Build the full node list: compromised first, then safe placeholders
  const allUsers = [
    ...compromisedUsers.map((id, i) => ({ id, compromised: true, index: i })),
    ...Array.from({ length: safeCount }, (_, i) => ({
      id: `safe_${i}`,
      compromised: false,
      index: compromisedUsers.length + i,
    })),
  ]

  const total = allUsers.length

  const nodes = allUsers.map((user, i) => {
    const angle = (i / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2
    return {
      ...user,
      x: CENTER + ORBIT_RADIUS * Math.cos(angle),
      y: CENTER + ORBIT_RADIUS * Math.sin(angle),
    }
  })

  const compromisedNodes = nodes.filter((n) => n.compromised)
  const safeNodes = nodes.filter((n) => !n.compromised)

  return (
    <svg
      viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`}
      className="mx-auto h-auto w-full max-w-[460px]"
      role="img"
      aria-label={`Syndicate graph for ${merchantId}`}
    >
      {/* ── Faint orbit ring ── */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={ORBIT_RADIUS}
        fill="none"
        stroke="#27272a"
        strokeWidth={0.5}
        strokeDasharray="3 5"
      />

      {/* ── Connection lines ── */}
      {nodes.map((node) => (
        <line
          key={`line-${node.id}`}
          x1={CENTER}
          y1={CENTER}
          x2={node.x}
          y2={node.y}
          stroke={node.compromised ? '#7f1d1d' : '#27272a'}
          strokeWidth={node.compromised ? 0.7 : 0.4}
          strokeOpacity={node.compromised ? 0.6 : 0.4}
        />
      ))}

      {/* ── Safe user nodes ── */}
      {safeNodes.map((node) => (
        <g key={`node-${node.id}`}>
          <circle
            cx={node.x}
            cy={node.y}
            r={SAFE_R}
            fill="#18181b"
            stroke="#3f3f46"
            strokeWidth={0.8}
          />
          {/* tiny center dot */}
          <circle cx={node.x} cy={node.y} r={1.2} fill="#52525b" />
        </g>
      ))}

      {/* ── Compromised user nodes (drawn on top) ── */}
      {compromisedNodes.map((node) => (
        <g key={`node-${node.id}`}>
          {/* outer pulse ring */}
          <circle
            cx={node.x}
            cy={node.y}
            r={COMPROMISED_R + 6}
            fill="none"
            stroke="#ef4444"
            strokeWidth={0.5}
            strokeOpacity={0.2}
          />
          {/* mid ring */}
          <circle
            cx={node.x}
            cy={node.y}
            r={COMPROMISED_R + 2.5}
            fill="none"
            stroke="#ef4444"
            strokeWidth={0.5}
            strokeOpacity={0.35}
          />
          {/* filled dot */}
          <circle
            cx={node.x}
            cy={node.y}
            r={COMPROMISED_R}
            fill="#450a0a"
            stroke="#ef4444"
            strokeWidth={1}
          />
          <circle cx={node.x} cy={node.y} r={2.5} fill="#ef4444" fillOpacity={0.9} />
        </g>
      ))}

      {/* ── Merchant center node ── */}
      {/* glow layers */}
      <circle cx={CENTER} cy={CENTER} r={MERCHANT_R + 14} fill="#ef444408" />
      <circle cx={CENTER} cy={CENTER} r={MERCHANT_R + 8} fill="#ef444410" />
      {/* ring */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={MERCHANT_R}
        fill="#09090b"
        stroke="#ef4444"
        strokeWidth={1.2}
        strokeOpacity={0.7}
      />
      {/* inner fill */}
      <circle cx={CENTER} cy={CENTER} r={8} fill="#ef4444" fillOpacity={0.85} />

      {/* ── Merchant label ── */}
      <text
        x={CENTER}
        y={GRAPH_SIZE - 18}
        textAnchor="middle"
        fill="#52525b"
        fontSize="10"
        fontFamily="ui-monospace, 'Cascadia Code', monospace"
        letterSpacing="0.08em"
      >
        {merchantId}
      </text>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function SyndicateExplorer({ blacklistedMerchants }) {
  const [selectedMerchant, setSelectedMerchant] = useState(null)
  const [cache, setCache] = useState({})

  // Fall back to the first blacklisted merchant if none is manually selected
  const activeMerchant = selectedMerchant ?? blacklistedMerchants[0] ?? null

  const entry = activeMerchant ? cache[activeMerchant] : null
  const syndicateData = entry?.data ?? null
  const fetchError = entry?.error ?? null
  const loading = Boolean(activeMerchant && !entry)

  // Fetch syndicate data whenever the active merchant changes and isn't cached
  useEffect(() => {
    if (!activeMerchant || cache[activeMerchant]) return undefined

    let cancelled = false

    // activeMerchant is already the clean merchant ID (parsed in App.jsx)
    // e.g. "merch_cheap_laptops" — NOT the full alert string
    fetch(`${API_BASE}/api/syndicate/${encodeURIComponent(activeMerchant)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Syndicate load failed (${res.status})`)
        return res.json()
      })
      .then((data) => {
        if (!cancelled) {
          setCache((prev) => ({ ...prev, [activeMerchant]: { data } }))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCache((prev) => ({ ...prev, [activeMerchant]: { error: err.message } }))
        }
      })

    return () => { cancelled = true }
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

        {/* ── Sidebar: merchant list ── */}
        <aside className="rounded-2xl border border-neutral-900 bg-[#09090b] p-8">
          <p className="mb-6 text-xs tracking-[0.2em] text-zinc-600 uppercase">
            Blacklisted Merchants
          </p>

          {blacklistedMerchants.length === 0 ? (
            <div className="space-y-3">
              <div className="h-px bg-zinc-900" />
              <p className="text-sm leading-relaxed text-zinc-600">
                No fraud ring alerts detected yet. Merchants appear here when{' '}
                <span className="font-mono text-zinc-500">ALERT</span> events arrive.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {blacklistedMerchants.map((merchantId) => {
                const isActive = activeMerchant === merchantId
                return (
                  <li key={merchantId}>
                    <button
                      type="button"
                      onClick={() => setSelectedMerchant(merchantId)}
                      className="w-full rounded-xl px-4 py-3.5 text-left font-mono text-xs transition-all duration-200 focus:outline-none"
                      style={{
                        backgroundColor: isActive ? '#1a0a0a' : 'transparent',
                        color: isActive ? '#fca5a5' : '#52525b',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: isActive ? '#7f1d1d80' : 'transparent',
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        {isActive && (
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full shrink-0 bg-red-500"
                            style={{ boxShadow: '0 0 5px #ef4444' }}
                          />
                        )}
                        <span className={isActive ? '' : 'pl-[18px]'}>{merchantId}</span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* ── Main panel: graph + stats ── */}
        <div className="rounded-2xl border border-neutral-900 bg-[#09090b] p-12">
          {!activeMerchant ? (
            <div className="flex h-96 items-center justify-center">
              <p className="text-sm text-zinc-600">
                Select a blacklisted merchant to explore syndicate connections.
              </p>
            </div>
          ) : loading ? (
            <div className="flex h-96 items-center justify-center gap-3">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-600 animate-pulse"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-600 animate-pulse"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-600 animate-pulse"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          ) : fetchError ? (
            <div className="flex h-96 flex-col items-center justify-center gap-3">
              <div className="rounded-lg bg-red-950/20 border border-red-900/30 px-5 py-3">
                <p className="font-mono text-xs text-red-400/80">{fetchError}</p>
              </div>
            </div>
          ) : syndicateData ? (
            <div className="space-y-12">

              {/* Stat grid */}
              <div className="grid gap-8 sm:grid-cols-3">
                <div>
                  <p className="text-xs tracking-[0.2em] text-zinc-600 uppercase">
                    Total Users
                  </p>
                  <p className="mt-2 font-mono text-3xl font-light text-white tabular-nums">
                    {syndicateData.totalUsers}
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.2em] text-zinc-600 uppercase">
                    Compromised
                  </p>
                  <p className="mt-2 font-mono text-3xl font-light text-red-400 tabular-nums">
                    {syndicateData.compromisedCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.2em] text-zinc-600 uppercase">
                    Safe
                  </p>
                  <p className="mt-2 font-mono text-3xl font-light text-zinc-300 tabular-nums">
                    {syndicateData.totalUsers - syndicateData.compromisedCount}
                  </p>
                </div>
              </div>

              {/* Bipartite graph */}
              <SyndicateGraph data={syndicateData} />

              {/* Compromised token list */}
              {syndicateData.compromisedUsers.length > 0 && (
                <div className="border-t border-neutral-900 pt-8">
                  <p className="mb-5 text-xs tracking-[0.2em] text-zinc-600 uppercase">
                    Compromised Tokens
                  </p>
                  <ul className="space-y-2">
                    {syndicateData.compromisedUsers.map((token) => (
                      <li key={token} className="flex items-center gap-3">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full shrink-0 bg-red-500/60"
                        />
                        <span className="font-mono text-xs leading-relaxed break-all text-zinc-400">
                          {token}
                        </span>
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