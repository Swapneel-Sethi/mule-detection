import Link from "next/link";

export default function Home() {
  return (
    <div>
      {/* ===================== HERO ===================== */}
      <section className="relative h-screen min-h-[760px] w-full overflow-hidden" id="hero">
        <div className="absolute inset-0" id="reelContainer">
          <div className="reel-frame active">
            <img src="https://picsum.photos/seed/guardA/1920/1080.jpg" alt="Network topology" />
          </div>
          <div className="reel-frame">
            <img src="https://picsum.photos/seed/guardB/1920/1080.jpg" alt="Transaction flows" />
          </div>
          <div className="reel-frame">
            <img src="https://picsum.photos/seed/guardC/1920/1080.jpg" alt="Signal analysis" />
          </div>
          <div className="reel-frame">
            <img src="https://picsum.photos/seed/guardD/1920/1080.jpg" alt="Fraud ring" />
          </div>
          <div className="reel-frame">
            <img src="https://picsum.photos/seed/guardE/1920/1080.jpg" alt="Console" />
          </div>
        </div>

        <div className="hero-overlay"></div>
        <div className="scan-line"></div>

        <div className="relative z-10 h-full max-w-[1600px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-20 pt-32">
          <div className="absolute top-32 right-6 lg:right-10 flex items-center gap-6 z-20" id="reelControls">
            <div className="hidden md:flex items-center gap-3 font-mono text-[11px] text-[var(--fg-dim)]">
              <span className="rec-dot w-2 h-2 bg-[var(--accent)] rounded-full"></span>
              <span className="tracking-[0.2em]">REEL · LIVE</span>
            </div>
            <button
              id="muteToggle"
              className="unmute-toggle flex items-center gap-3 px-4 py-2.5 border border-white/20 hover:border-[var(--accent)] bg-black/40 backdrop-blur-sm transition-colors group"
            >
              <div className="flex items-end gap-[2px] h-4">
                <span className="wave-bar"></span>
                <span className="wave-bar"></span>
                <span className="wave-bar"></span>
                <span className="wave-bar"></span>
                <span className="wave-bar"></span>
              </div>
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase" id="muteLabel">Muted</span>
              <i className="fas fa-volume-xmark text-xs text-[var(--muted)] group-hover:text-[var(--accent)]" id="muteIcon"></i>
            </button>
          </div>

          <div className="reveal in-view max-w-5xl">
            <div className="section-marker mb-6">
              <span>EST. 2026 · GLOBAL</span>
            </div>
            <h1 className="font-display text-[14vw] md:text-[10vw] lg:text-[8.5vw] leading-[0.85] mb-8">
              <span className="headline-line"><span>BUILT ON</span></span>
              <span className="headline-line"><span className="text-stroke">SIGNALS.</span></span>
              <span className="headline-line"><span>FORGED IN <span className="text-[var(--accent)]">TRUTH.</span></span></span>
            </h1>
            <p className="max-w-xl text-[var(--fg-dim)] text-base md:text-lg leading-relaxed font-body">
              An AI mule-account detection engine for banks and fintechs. Pattern graphs, real-time
              alerts, and a 24/7 analyst console — so laundering rings get caught before the money
              moves.
            </p>
          </div>

          <div className="mt-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div className="flex items-center gap-4">
              <div className="flex -space-x-3">
                <img src="https://picsum.photos/seed/eng1/120/120.jpg" className="w-12 h-12 rounded-full border-2 border-[var(--bg)] object-cover img-noir" alt="Engine" />
                <img src="https://picsum.photos/seed/eng2/120/120.jpg" className="w-12 h-12 rounded-full border-2 border-[var(--bg)] object-cover img-noir" alt="Engine" />
                <img src="https://picsum.photos/seed/eng3/120/120.jpg" className="w-12 h-12 rounded-full border-2 border-[var(--bg)] object-cover img-noir" alt="Engine" />
                <img src="https://picsum.photos/seed/eng4/120/120.jpg" className="w-12 h-12 rounded-full border-2 border-[var(--bg)] object-cover img-noir" alt="Engine" />
                <div className="w-12 h-12 rounded-full border-2 border-[var(--bg)] bg-[var(--accent)] flex items-center justify-center font-display text-base text-black">+24</div>
              </div>
              <div>
                <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)] uppercase">Detection Stack</div>
                <div className="font-heading text-sm text-[var(--fg)] tracking-wider">24 models live</div>
              </div>
            </div>

            <div className="flex items-center gap-6 max-w-md w-full lg:w-auto">
              <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em]">
                <span id="chapterNum">01</span> / 05
              </div>
              <div className="flex-1 progress-bar">
                <div className="progress-bar-fill" id="reelProgress"></div>
              </div>
              <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.2em]">DETECTION REEL</div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t border-white/5 bg-black/60 backdrop-blur-sm py-3 overflow-hidden z-10">
          <div className="marquee-track font-display text-sm tracking-[0.25em] text-[var(--silver-dim)]">
            <span className="px-8">STOP THE MULE</span><span className="text-[var(--accent)]">/</span>
            <span className="px-8">TRACE THE RING</span><span className="text-[var(--accent)]">/</span>
            <span className="px-8">PROVE THE PATTERN</span><span className="text-[var(--accent)]">/</span>
            <span className="px-8">PROTECT THE LEDGER</span><span className="text-[var(--accent)]">/</span>
            <span className="px-8">NO BLIND SPOTS</span><span className="text-[var(--accent)]">/</span>
            <span className="px-8">CAUGHT NOT LUCKY</span><span className="text-[var(--accent)]">/</span>
            <span className="px-8">STOP THE MULE</span><span className="text-[var(--accent)]">/</span>
            <span className="px-8">TRACE THE RING</span><span className="text-[var(--accent)]">/</span>
            <span className="px-8">PROVE THE PATTERN</span><span className="text-[var(--accent)]">/</span>
            <span className="px-8">PROTECT THE LEDGER</span><span className="text-[var(--accent)]">/</span>
            <span className="px-8">NO BLIND SPOTS</span><span className="text-[var(--accent)]">/</span>
            <span className="px-8">CAUGHT NOT LUCKY</span><span className="text-[var(--accent)]">/</span>
          </div>
        </div>
      </section>

      {/* ===================== STATS ===================== */}
      <section className="border-y border-[var(--border)] bg-[var(--bg-darker)] relative overflow-hidden">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-16 lg:py-20">
          <div className="reveal-stagger grid grid-cols-2 lg:grid-cols-4 gap-y-10 gap-x-6">
            <div className="border-l border-[var(--border-light)] pl-6">
              <div className="font-display text-6xl md:text-7xl text-[var(--fg)] number-display" data-count="48000">0</div>
              <div className="font-mono text-[11px] text-[var(--muted)] tracking-[0.2em] uppercase mt-2">Accounts monitored</div>
            </div>
            <div className="border-l border-[var(--border-light)] pl-6">
              <div className="font-display text-6xl md:text-7xl text-[var(--accent)] number-display" data-count="1240">0</div>
              <div className="font-mono text-[11px] text-[var(--muted)] tracking-[0.2em] uppercase mt-2">Mules flagged</div>
            </div>
            <div className="border-l border-[var(--border-light)] pl-6">
              <div className="font-display text-6xl md:text-7xl text-[var(--fg)] number-display" data-count="320">0</div>
              <div className="font-mono text-[11px] text-[var(--muted)] tracking-[0.2em] uppercase mt-2">Rings dismantled</div>
            </div>
            <div className="border-l border-[var(--border-light)] pl-6">
              <div className="font-display text-6xl md:text-7xl text-[var(--fg)] number-display" data-count="24">0</div>
              <div className="font-mono text-[11px] text-[var(--muted)] tracking-[0.2em] uppercase mt-2">Detection models</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== MODULES ===================== */}
      <section className="relative py-28 lg:py-36" id="curriculum">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
          <div className="reveal grid lg:grid-cols-12 gap-8 mb-20">
            <div className="lg:col-span-5">
              <div className="section-marker mb-6"><span>02 — Detection Stack</span></div>
              <h2 className="font-display text-6xl md:text-7xl lg:text-8xl leading-[0.9]">
                Three engines.<br />
                <span className="text-stroke">One outcome:</span><br />
                <span className="text-[var(--accent)]">caught mules.</span>
              </h2>
            </div>
            <div className="lg:col-span-6 lg:col-start-7 flex flex-col justify-end">
              <p className="text-[var(--fg-dim)] text-lg leading-relaxed mb-6">
                Every module in MuleGuard is engineered around a single objective — finding the accounts
                moving stolen money. Pick your lens. We bring the graph, the signals, and the alerts that
                refuse to let a ring slip through.
              </p>
              <div className="flex flex-wrap gap-3">
                <span className="goal-pill active">All Modules</span>
                <span className="goal-pill">Network</span>
                <span className="goal-pill">Patterns</span>
                <span className="goal-pill">Alerts</span>
              </div>
            </div>
          </div>

          <div className="reveal-stagger grid md:grid-cols-3 gap-6 lg:gap-8">
            <article className="program-card info-card notch-corner group">
              <div className="relative h-72 overflow-hidden">
                <img src="https://picsum.photos/seed/modGraph/800/600.jpg" className="program-img w-full h-full object-cover img-noir" alt="Network graph" />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent"></div>
                <div className="absolute top-4 left-4 font-mono text-[11px] text-[var(--accent)] tracking-[0.2em]">01 / NETWORK</div>
                <div className="absolute top-4 right-4 px-2 py-1 bg-[var(--accent)] text-black font-mono text-[10px] tracking-[0.15em]">COVERAGE 85%</div>
              </div>
              <div className="p-7">
                <h3 className="font-display text-4xl mb-3">NETWORK GRAPH</h3>
                <p className="text-[var(--fg-dim)] text-sm leading-relaxed mb-6">
                  Bipartite and hypergraph views of mule networks. Trace money paths, surface hubs, and
                  expose the structure of a laundering ring at a glance.
                </p>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 mb-6 pb-6 border-b border-[var(--border-light)]">
                  <div>
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">View</div>
                    <div className="font-heading text-base">BIPARTITE</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Layout</div>
                    <div className="font-heading text-base">FORCE 3D</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Scale</div>
                    <div className="font-heading text-base">MILLIONS</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Level</div>
                    <div className="font-heading text-base">ANALYST+</div>
                  </div>
                </div>
                <Link href="/graph" className="flex items-center justify-between font-heading text-sm tracking-[0.15em] uppercase link-underline">
                  <span>Open Graph</span>
                  <i className="fas fa-arrow-right text-[var(--accent)]"></i>
                </Link>
              </div>
            </article>

            <article className="program-card info-card notch-corner group">
              <div className="relative h-72 overflow-hidden">
                <img src="https://picsum.photos/seed/modPattern/800/600.jpg" className="program-img w-full h-full object-cover img-noir" alt="Pattern engine" />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent"></div>
                <div className="absolute top-4 left-4 font-mono text-[11px] text-[var(--accent)] tracking-[0.2em]">02 / PATTERNS</div>
                <div className="absolute top-4 right-4 px-2 py-1 bg-[var(--accent)] text-black font-mono text-[10px] tracking-[0.15em]">SPEED 95%</div>
              </div>
              <div className="p-7">
                <h3 className="font-display text-4xl mb-3">PATTERN ENGINE</h3>
                <p className="text-[var(--fg-dim)] text-sm leading-relaxed mb-6">
                  Streaming transaction anomaly detection. Smurfing, rapid placement, and circular flows
                  flagged in real time across every account you monitor.
                </p>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 mb-6 pb-6 border-b border-[var(--border-light)]">
                  <div>
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Window</div>
                    <div className="font-heading text-base">REALTIME</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Frequency</div>
                    <div className="font-heading text-base">CONTINUOUS</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Signals</div>
                    <div className="font-heading text-base">240 FEAT</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Level</div>
                    <div className="font-heading text-base">ALL TIERS</div>
                  </div>
                </div>
                <Link href="/analytics" className="flex items-center justify-between font-heading text-sm tracking-[0.15em] uppercase link-underline">
                  <span>Explore Analytics</span>
                  <i className="fas fa-arrow-right text-[var(--accent)]"></i>
                </Link>
              </div>
            </article>

            <article className="program-card info-card notch-corner group">
              <div className="relative h-72 overflow-hidden">
                <img src="https://picsum.photos/seed/modAlert/800/600.jpg" className="program-img w-full h-full object-cover img-noir" alt="Alerting core" />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent"></div>
                <div className="absolute top-4 left-4 font-mono text-[11px] text-[var(--accent)] tracking-[0.2em]">03 / ALERTS</div>
                <div className="absolute top-4 right-4 px-2 py-1 bg-[var(--accent)] text-black font-mono text-[10px] tracking-[0.15em]">NOISE 70%</div>
              </div>
              <div className="p-7">
                <h3 className="font-display text-4xl mb-3">ALERTING CORE</h3>
                <p className="text-[var(--fg-dim)] text-sm leading-relaxed mb-6">
                  Risk-ranked alerts pushed to your analyst console. Triage by severity, drill into the
                  account drawer, and export evidence for SAR filing.
                </p>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 mb-6 pb-6 border-b border-[var(--border-light)]">
                  <div>
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Delivery</div>
                    <div className="font-heading text-base">STREAM</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Ranking</div>
                    <div className="font-heading text-base">RISK</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Export</div>
                    <div className="font-heading text-base">SAR / CSV</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Level</div>
                    <div className="font-heading text-base">SOC</div>
                  </div>
                </div>
                <Link href="/alerts" className="flex items-center justify-between font-heading text-sm tracking-[0.15em] uppercase link-underline">
                  <span>View Alerts</span>
                  <i className="fas fa-arrow-right text-[var(--accent)]"></i>
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ===================== ENGINES ===================== */}
      <section className="relative py-28 lg:py-36 border-t border-[var(--border)] bg-[var(--bg-darker)]" id="coaches">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
          <div className="reveal grid lg:grid-cols-12 gap-8 mb-20">
            <div className="lg:col-span-7">
              <div className="section-marker mb-6"><span>03 — The Detection Engines</span></div>
              <h2 className="font-display text-6xl md:text-7xl lg:text-8xl leading-[0.9]">
                Models that <span className="text-[var(--accent)]">read</span><br />
                models that <span className="text-stroke">explain.</span>
              </h2>
            </div>
            <div className="lg:col-span-4 lg:col-start-9 flex flex-col justify-end">
              <p className="text-[var(--fg-dim)] text-base leading-relaxed">
                Each MuleGuard engine ships with documented behavior, tunable thresholds, and an
                explainability trail. Hover any card to reveal its signature detection and spec sheet.
              </p>
            </div>
          </div>

          <div className="reveal-stagger grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flip-card">
              <div className="flip-card-inner">
                <div className="flip-face flip-front info-card flex flex-col">
                  <div className="coach-img-wrap">
                    <img src="https://picsum.photos/seed/engGraph/600/800.jpg" alt="Graph Miner" />
                    <div className="absolute top-4 left-4 font-mono text-[10px] text-[var(--accent)] tracking-[0.2em]">/ 01</div>
                    <div className="absolute top-4 right-4 px-2 py-1 bg-black/60 backdrop-blur-sm font-mono text-[10px] text-[var(--fg)] tracking-[0.15em]">TOPOLOGY</div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="font-mono text-[10px] text-[var(--silver-dim)] tracking-[0.2em] uppercase">Network Structure</div>
                    </div>
                  </div>
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-3xl leading-none">GRAPH MINER</h3>
                      <p className="text-[var(--muted)] text-xs mt-2 font-heading tracking-wider uppercase">Network Topology Engine</p>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border-light)]">
                      <span className="font-mono text-[10px] text-[var(--muted)] tracking-[0.15em]">v4 · GCN</span>
                      <span className="font-mono text-[10px] text-[var(--accent)] tracking-[0.15em]">HOVER →</span>
                    </div>
                  </div>
                </div>
                <div className="flip-face flip-back info-card p-7 flex flex-col bg-[var(--bg-card)]">
                  <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.2em] uppercase mb-4">/ Graph Miner — Spec</div>
                  <h3 className="font-display text-2xl mb-5">Capabilities</h3>
                  <ul className="space-y-2.5 text-sm mb-6">
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Bipartite mule–transaction mapping</span></li>
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Community / hub detection</span></li>
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>3D force-directed layout</span></li>
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Path tracing to source</span></li>
                  </ul>
                  <div className="mt-auto pt-5 border-t border-[var(--border-light)]">
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase mb-2">Signature Output</div>
                    <div className="font-display text-2xl text-[var(--accent)]">RING MAP</div>
                    <p className="text-xs text-[var(--fg-dim)] mt-2">Subgraph clusters ranked by centrality.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flip-card">
              <div className="flip-card-inner">
                <div className="flip-face flip-front info-card flex flex-col">
                  <div className="coach-img-wrap">
                    <img src="https://picsum.photos/seed/engScan/600/800.jpg" alt="Pattern Scanner" />
                    <div className="absolute top-4 left-4 font-mono text-[10px] text-[var(--accent)] tracking-[0.2em]">/ 02</div>
                    <div className="absolute top-4 right-4 px-2 py-1 bg-black/60 backdrop-blur-sm font-mono text-[10px] text-[var(--fg)] tracking-[0.15em]">ANOMALY</div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="font-mono text-[10px] text-[var(--silver-dim)] tracking-[0.2em] uppercase">Transaction Signals</div>
                    </div>
                  </div>
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-3xl leading-none">PATTERN SCANNER</h3>
                      <p className="text-[var(--muted)] text-xs mt-2 font-heading tracking-wider uppercase">Anomaly Engine</p>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border-light)]">
                      <span className="font-mono text-[10px] text-[var(--muted)] tracking-[0.15em]">v6 · LSTM</span>
                      <span className="font-mono text-[10px] text-[var(--accent)] tracking-[0.15em]">HOVER →</span>
                    </div>
                  </div>
                </div>
                <div className="flip-face flip-back info-card p-7 flex flex-col bg-[var(--bg-card)]">
                  <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.2em] uppercase mb-4">/ Pattern Scanner — Spec</div>
                  <h3 className="font-display text-2xl mb-5">Capabilities</h3>
                  <ul className="space-y-2.5 text-sm mb-6">
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Smurfing / structuring detection</span></li>
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Rapid placement scoring</span></li>
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Circular flow detection</span></li>
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Velocity & burst flags</span></li>
                  </ul>
                  <div className="mt-auto pt-5 border-t border-[var(--border-light)]">
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase mb-2">Signature Output</div>
                    <div className="font-display text-2xl text-[var(--accent)]">SIGNAL TRACE</div>
                    <p className="text-xs text-[var(--fg-dim)] mt-2">Per-account anomaly timeline.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flip-card">
              <div className="flip-card-inner">
                <div className="flip-face flip-front info-card flex flex-col">
                  <div className="coach-img-wrap">
                    <img src="https://picsum.photos/seed/engRing/600/800.jpg" alt="Ring Breaker" />
                    <div className="absolute top-4 left-4 font-mono text-[10px] text-[var(--accent)] tracking-[0.2em]">/ 03</div>
                    <div className="absolute top-4 right-4 px-2 py-1 bg-black/60 backdrop-blur-sm font-mono text-[10px] text-[var(--fg)] tracking-[0.15em]">CLUSTER</div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="font-mono text-[10px] text-[var(--silver-dim)] tracking-[0.2em] uppercase">Community Detection</div>
                    </div>
                  </div>
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-3xl leading-none">RING BREAKER</h3>
                      <p className="text-[var(--muted)] text-xs mt-2 font-heading tracking-wider uppercase">Cluster Engine</p>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border-light)]">
                      <span className="font-mono text-[10px] text-[var(--muted)] tracking-[0.15em]">v3 · GNN</span>
                      <span className="font-mono text-[10px] text-[var(--accent)] tracking-[0.15em]">HOVER →</span>
                    </div>
                  </div>
                </div>
                <div className="flip-face flip-back info-card p-7 flex flex-col bg-[var(--bg-card)]">
                  <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.2em] uppercase mb-4">/ Ring Breaker — Spec</div>
                  <h3 className="font-display text-2xl mb-5">Capabilities</h3>
                  <ul className="space-y-2.5 text-sm mb-6">
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Louvain community detection</span></li>
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Broker / cut-vertex ranking</span></li>
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Cross-institution linking</span></li>
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Case auto-grouping</span></li>
                  </ul>
                  <div className="mt-auto pt-5 border-t border-[var(--border-light)]">
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase mb-2">Signature Output</div>
                    <div className="font-display text-2xl text-[var(--accent)]">RING DOSSIER</div>
                    <p className="text-xs text-[var(--fg-dim)] mt-2">Full membership + evidence pack.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flip-card">
              <div className="flip-card-inner">
                <div className="flip-face flip-front info-card flex flex-col">
                  <div className="coach-img-wrap">
                    <img src="https://picsum.photos/seed/engFeat/600/800.jpg" alt="Feature Forge" />
                    <div className="absolute top-4 left-4 font-mono text-[10px] text-[var(--accent)] tracking-[0.2em]">/ 04</div>
                    <div className="absolute top-4 right-4 px-2 py-1 bg-black/60 backdrop-blur-sm font-mono text-[10px] text-[var(--fg)] tracking-[0.15em]">EXTRACT</div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="font-mono text-[10px] text-[var(--silver-dim)] tracking-[0.2em] uppercase">Feature Engineering</div>
                    </div>
                  </div>
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-3xl leading-none">FEATURE FORGE</h3>
                      <p className="text-[var(--muted)] text-xs mt-2 font-heading tracking-wider uppercase">Feature Engine</p>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border-light)]">
                      <span className="font-mono text-[10px] text-[var(--muted)] tracking-[0.15em]">v5 · PIPELINE</span>
                      <span className="font-mono text-[10px] text-[var(--accent)] tracking-[0.15em]">HOVER →</span>
                    </div>
                  </div>
                </div>
                <div className="flip-face flip-back info-card p-7 flex flex-col bg-[var(--bg-card)]">
                  <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.2em] uppercase mb-4">/ Feature Forge — Spec</div>
                  <h3 className="font-display text-2xl mb-5">Capabilities</h3>
                  <ul className="space-y-2.5 text-sm mb-6">
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>240 behavioral features</span></li>
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Graph embeddings</span></li>
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Temporal aggregation</span></li>
                    <li className="flex items-center gap-3"><i className="fas fa-circle-check text-[var(--accent)] text-xs"></i><span>Drift monitoring</span></li>
                  </ul>
                  <div className="mt-auto pt-5 border-t border-[var(--border-light)]">
                    <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase mb-2">Signature Output</div>
                    <div className="font-display text-2xl text-[var(--accent)]">FEATURE VECTOR</div>
                    <p className="text-xs text-[var(--fg-dim)] mt-2">Explainable per-account scores.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== CASE FILES ===================== */}
      <section className="relative py-28 lg:py-36 overflow-hidden" id="stories">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 mb-16">
          <div className="reveal grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7">
              <div className="section-marker mb-6"><span>04 — Caught Here</span></div>
              <h2 className="font-display text-6xl md:text-7xl lg:text-8xl leading-[0.9]">
                Real rings.<br />
                <span className="text-[var(--accent)]">Relentless</span> takedowns.
              </h2>
            </div>
            <div className="lg:col-span-4 lg:col-start-9 flex flex-col justify-end">
              <p className="text-[var(--fg-dim)] text-base leading-relaxed mb-5">
                Every case below was surfaced by MuleGuard — never bought, never guessed. Drag the
                carousel to read each takedown.
              </p>
              <div className="flex items-center gap-3 font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">
                <i className="fas fa-hand-pointer text-[var(--accent)]"></i>
                <span>Drag · Swipe · Auto-advance</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden">
          <div className="story-track" id="storyTrack">
            {[
              { seed: "caseSarah", tag: "CASE / 01", badge: "$2.4M", name: "OPERATION LEDGER", time: "8 MONTHS", quote: "A 14-account smurfing ring funneling proceeds through mule wallets — Graph Miner mapped the full topology in minutes.", stats: [["$2.4M", "Seized"], ["14", "Accounts"], ["8", "Months"]] },
              { seed: "caseDavid", tag: "CASE / 02", badge: "RING", name: "PROJECT NEST", time: "12 MONTHS", quote: "Circular flow between 9 shell businesses. Pattern Scanner caught the placement burst the legacy rules engine missed.", stats: [["9", "Shells"], ["$11M", "Volume"], ["12", "Months"]] },
              { seed: "caseMaya", tag: "CASE / 03", badge: "320", name: "HUB SWEEP", time: "14 MONTHS", quote: "One broker account linking 320 mules across three institutions. Ring Breaker auto-grouped the case for SAR filing.", stats: [["320", "Mules"], ["3", "Banks"], ["14", "Months"]] },
              { seed: "caseJames", tag: "CASE / 04", badge: "REBUILD", name: "SAFE HARBOR", time: "10 MONTHS", quote: "Post-breach account takeover ring. Feature Forge re-scored 40k accounts and quarantined the live threats.", stats: [["40K", "Rescored"], ["0", "Leak"], ["10", "Months"]] },
              { seed: "casePriya", tag: "CASE / 05", badge: "-92%", name: "QUIET QUARTER", time: "6 MONTHS", quote: "False-positive noise dropped 92% after tuning. Analysts now triage real risk instead of chasing alerts.", stats: [["-92%", "Noise"], ["3.1x", "Precision"], ["6", "Months"]] },
              { seed: "caseCarlos", tag: "CASE / 06", badge: "PRO", name: "CROSS-BORDER", time: "18 MONTHS", quote: "A laundering network spanning four countries. Cross-institution linking exposed the overseas cash-out node.", stats: [["4", "Countries"], ["$48M", "Blocked"], ["18", "Months"]] },
            ].map((c, i) => (
              <article className="story-card" key={i}>
                <div className="relative h-56 overflow-hidden">
                  <img src={`https://picsum.photos/seed/${c.seed}/600/400.jpg`} className="w-full h-full object-cover img-noir" alt={c.name} />
                  <div className="absolute top-4 left-4 font-mono text-[10px] text-[var(--accent)] tracking-[0.2em]">{c.tag}</div>
                  <div className="absolute bottom-4 right-4 px-2 py-1 bg-[var(--accent)] text-black font-mono text-[10px] tracking-[0.15em]">{c.badge}</div>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-2xl">{c.name}</h3>
                    <span className="font-mono text-[10px] text-[var(--muted)] tracking-[0.15em]">{c.time}</span>
                  </div>
                  <p className="text-[var(--fg-dim)] text-sm leading-relaxed mb-5 italic">{`"${c.quote}"`}</p>
                  <div className="grid grid-cols-3 gap-2 pt-4 border-t border-[var(--border-light)]">
                    {c.stats.map((s, j) => (
                      <div key={j}>
                        <div className="font-display text-xl text-[var(--accent)]">{s[0]}</div>
                        <div className="font-mono text-[9px] text-[var(--muted)] tracking-[0.15em] uppercase">{s[1]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="max-w-[1600px] mx-auto px-6 lg:px-10 mt-10 flex items-center justify-between">
            <div className="flex items-center gap-2" id="storyDots"></div>
            <div className="flex items-center gap-3">
              <button className="w-11 h-11 border border-[var(--border-light)] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-black transition-all flex items-center justify-center" id="storyPrev">
                <i className="fas fa-arrow-left text-xs"></i>
              </button>
              <button className="w-11 h-11 border border-[var(--border-light)] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-black transition-all flex items-center justify-center" id="storyNext">
                <i className="fas fa-arrow-right text-xs"></i>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== DEMO / BOOKING ===================== */}
      <section className="relative py-28 lg:py-36 border-t border-[var(--border)] bg-[var(--bg-darker)]" id="booking">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
          <div className="reveal grid lg:grid-cols-12 gap-8 mb-16">
            <div className="lg:col-span-8">
              <div className="section-marker mb-6"><span>05 — Begin the Process</span></div>
              <h2 className="font-display text-6xl md:text-7xl lg:text-[7rem] leading-[0.9]">
                STOP WAITING.<br />
                <span className="text-stroke">START</span> <span className="text-[var(--accent)]">CATCHING.</span>
              </h2>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-8 lg:gap-12">
            <div className="lg:col-span-7 reveal">
              <div className="booking-frame p-8 lg:p-12">
                <div className="font-mono text-[11px] text-[var(--accent)] tracking-[0.2em] uppercase mb-3">{/* Demo Session Request */}</div>
                <h3 className="font-display text-4xl mb-2">CLAIM YOUR FREE ASSESSMENT</h3>
                <p className="text-[var(--fg-dim)] text-sm mb-8">90-minute walkthrough, sample dataset scoring, and a tailored deployment plan. Limited to 30 assessments monthly.</p>

                <form id="bookingForm" className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Organization</label>
                      <input type="text" className="form-input" placeholder="Your bank / fintech" required />
                    </div>
                    <div>
                      <label className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Phone</label>
                      <input type="tel" className="form-input" placeholder="+1 555 000 0000" required />
                    </div>
                  </div>

                  <div>
                    <label className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase">Work Email</label>
                    <input type="email" className="form-input" placeholder="you@bank.com" required />
                  </div>

                  <div>
                    <label className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase block mb-3">Primary Concern</label>
                    <div className="flex flex-wrap gap-2" id="goalSelector">
                      <span className="goal-pill active" data-goal="mule">Mule Accounts</span>
                      <span className="goal-pill" data-goal="rings">Laundering Rings</span>
                      <span className="goal-pill" data-goal="alerts">Alert Noise</span>
                      <span className="goal-pill" data-goal="sars">SAR Filing</span>
                      <span className="goal-pill" data-goal="realitime">Real-time Blocking</span>
                    </div>
                  </div>

                  <div>
                    <label className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em] uppercase block mb-3">Deployment Scale</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <label className="cursor-pointer">
                        <input type="radio" name="scale" className="peer sr-only" defaultChecked />
                        <div className="text-center py-3 border border-[var(--border-light)] text-[var(--fg-dim)] font-heading text-xs tracking-wider uppercase peer-checked:bg-[var(--accent)] peer-checked:text-black peer-checked:border-[var(--accent)] transition-all">Pilot<br /><span className="font-mono text-[9px]">&lt;100K</span></div>
                      </label>
                      <label className="cursor-pointer">
                        <input type="radio" name="scale" className="peer sr-only" />
                        <div className="text-center py-3 border border-[var(--border-light)] text-[var(--fg-dim)] font-heading text-xs tracking-wider uppercase peer-checked:bg-[var(--accent)] peer-checked:text-black peer-checked:border-[var(--accent)] transition-all">Mid<br /><span className="font-mono text-[9px]">100K–1M</span></div>
                      </label>
                      <label className="cursor-pointer">
                        <input type="radio" name="scale" className="peer sr-only" />
                        <div className="text-center py-3 border border-[var(--border-light)] text-[var(--fg-dim)] font-heading text-xs tracking-wider uppercase peer-checked:bg-[var(--accent)] peer-checked:text-black peer-checked:border-[var(--accent)] transition-all">Large<br /><span className="font-mono text-[9px]">1M–10M</span></div>
                      </label>
                      <label className="cursor-pointer">
                        <input type="radio" name="scale" className="peer sr-only" />
                        <div className="text-center py-3 border border-[var(--border-light)] text-[var(--fg-dim)] font-heading text-xs tracking-wider uppercase peer-checked:bg-[var(--accent)] peer-checked:text-black peer-checked:border-[var(--accent)] transition-all">Tier-1<br /><span className="font-mono text-[9px]">&gt;10M</span></div>
                      </label>
                    </div>
                  </div>

                  <button type="submit" className="pulse-btn w-full bg-[var(--accent)] text-black py-5 font-display text-2xl tracking-wider hover:bg-[var(--accent-bright)] transition-colors flex items-center justify-center gap-4 mt-4">
                    <span>REQUEST DEMO</span>
                    <i className="fas fa-arrow-right"></i>
                  </button>

                  <p className="text-center font-mono text-[10px] text-[var(--muted)] tracking-[0.15em] uppercase">
                    No charge · No obligation · Response within 24 hours
                  </p>
                </form>
              </div>
            </div>

            <div className="lg:col-span-5 reveal" style={{ "--delay": "0.2s" } as React.CSSProperties}>
              <div className="space-y-6">
                <div className="info-card p-7">
                  <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.2em] uppercase mb-2">/ Deployment</div>
                  <h4 className="font-display text-2xl mb-3">CLOUD OR ON-PREM</h4>
                  <p className="text-[var(--fg-dim)] text-sm leading-relaxed mb-4">
                    SaaS console or air-gapped VPC. Connect via REST or stream from your ledger in
                    under a week.
                  </p>
                  <div className="flex items-center gap-3 font-mono text-[11px] text-[var(--silver)]">
                    <i className="fas fa-cloud text-[var(--accent)]"></i>
                    <span>SOC 2 · GDPR READY</span>
                  </div>
                </div>

                <div className="info-card p-7">
                  <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.2em] uppercase mb-2">/ Integration</div>
                  <h4 className="font-display text-2xl mb-3">CONNECTORS</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-[var(--border-light)] pb-2">
                      <span className="text-[var(--fg-dim)]">Core Banking</span>
                      <span className="font-mono text-[var(--silver)]">REST / Kafka</span>
                    </div>
                    <div className="flex justify-between border-b border-[var(--border-light)] pb-2">
                      <span className="text-[var(--fg-dim)]">Data Warehouse</span>
                      <span className="font-mono text-[var(--silver)]">Snowflake / BQ</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--fg-dim)]">Case Mgmt</span>
                      <span className="font-mono text-[var(--silver)]">Webhook / SAR</span>
                    </div>
                  </div>
                </div>

                <div className="info-card p-7">
                  <div className="font-mono text-[10px] text-[var(--accent)] tracking-[0.2em] uppercase mb-2">/ Direct Contact</div>
                  <h4 className="font-display text-2xl mb-3">REACH THE TEAM</h4>
                  <div className="space-y-2.5 text-sm">
                    <a href="mailto:team@muleguard.ai" className="flex items-center gap-3 hover:text-[var(--accent)] transition-colors">
                      <i className="fas fa-envelope text-[var(--accent)] w-4"></i>
                      <span className="font-mono">team@muleguard.ai</span>
                    </a>
                    <Link href="/graph" className="flex items-center gap-3 hover:text-[var(--accent)] transition-colors">
                      <i className="fas fa-shield-halved text-[var(--accent)] w-4"></i>
                      <span className="font-mono">Launch console →</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== STICKY CTA ===================== */}
      <div className="sticky-cta" id="stickyCta">
        <div className="bg-black/90 backdrop-blur-md border-t border-[var(--accent)]">
          <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-5">
              <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-[var(--accent)] tracking-[0.2em]">
                <span className="rec-dot w-2 h-2 bg-[var(--accent)] rounded-full"></span>
                <span>DEMO SLOTS OPEN</span>
              </div>
              <div>
                <div className="font-display text-xl md:text-2xl leading-none">CLAIM YOUR FREE ASSESSMENT</div>
                <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.15em] uppercase mt-1">90 MIN · NO CHARGE · RESPONSE IN 24H</div>
              </div>
            </div>
            <Link href="#booking" className="pulse-btn bg-[var(--accent)] text-black px-6 md:px-8 py-3.5 font-heading text-xs md:text-sm tracking-[0.2em] uppercase hover:bg-[var(--accent-bright)] transition-colors flex items-center gap-3 whitespace-nowrap">
              <span>REQUEST DEMO</span>
              <i className="fas fa-arrow-right text-xs"></i>
            </Link>
          </div>
        </div>
      </div>

      {/* ===================== TOAST ===================== */}
      <div className="toast" id="toast">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
            <i className="fas fa-check text-black text-xs"></i>
          </div>
          <div>
            <div className="font-heading text-sm tracking-wider uppercase" id="toastTitle">Request received</div>
            <div className="text-[var(--fg-dim)] text-xs mt-1" id="toastMsg">A specialist will contact you within 24 hours.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
