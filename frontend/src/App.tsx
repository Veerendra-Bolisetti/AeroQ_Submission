import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Activity, Airplay, AlertTriangle, ArrowRight, Atom, BookOpen, Check, CheckCircle2,
  ChevronDown, Clock3, Compass, Database, Gauge, GitCompareArrows, Info, Layers3, Leaf,
  LineChart as LineChartIcon, LoaderCircle, Menu, Plane, Play, RadioTower, RefreshCw,
  Route, ShieldAlert, SlidersHorizontal, Sparkles, Target, Waypoints, Wind, X,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from './api';
import type {
  ExperimentRecord, GraphEdge, GraphNode, HealthResponse, ModelInfo,
  OptimizationResponse, RouteResult, ScenarioRequest, SensitivityPoint, TabId,
} from './types';

const INITIAL_SCENARIO: ScenarioRequest = {
  origin: 'A01', destination: 'A10', aircraft_category: 'Narrow-body',
  cruise_speed_kmh: 820, fuel_burn_kg_per_km: 2.55, max_distance_km: 1100,
  wind_condition: 0.15, weather_penalty: 0.08, congestion_level: 0.2,
  restricted_airspace: false, delay_sensitivity: 0.3, emission_weight: 1,
  fuel_weight: 1, distance_weight: 1, congestion_weight: 1, delay_weight: 1,
  weather_weight: 1, scenario_name: 'Normal conditions', use_ml_cost: true, seed: 42,
};

const PRESETS: Record<string, Partial<ScenarioRequest>> = {
  Normal: { ...INITIAL_SCENARIO, scenario_name: 'Normal conditions' },
  Congestion: { scenario_name: 'High congestion', congestion_level: 0.75, wind_condition: 0, weather_penalty: 0.1, restricted_airspace: false },
  Headwind: { scenario_name: 'Strong headwind', congestion_level: 0.25, wind_condition: -0.7, weather_penalty: 0.12, restricted_airspace: false },
  Restricted: { scenario_name: 'Restricted airspace', congestion_level: 0.3, wind_condition: 0.1, weather_penalty: 0.08, restricted_airspace: true },
  Emissions: { scenario_name: 'Emissions priority', congestion_level: 0.25, wind_condition: 0.1, emission_weight: 2.5, fuel_weight: 1.6, restricted_airspace: false },
  Fuel: { scenario_name: 'Fuel priority', congestion_level: 0.25, wind_condition: 0.1, fuel_weight: 2.5, emission_weight: 1, restricted_airspace: false },
};

const NAV: { id: TabId; label: string; icon: typeof Plane; group?: string }[] = [
  { id: 'dashboard', label: 'Mission dashboard', icon: Airplay, group: 'FLIGHT SYSTEMS' },
  { id: 'scenario', label: 'Scenario lab', icon: SlidersHorizontal },
  { id: 'optimisation', label: 'Optimisation engine', icon: Route },
  { id: 'quantum', label: 'Quantum lab', icon: Atom, group: 'RESEARCH' },
  { id: 'ml', label: 'AI / ML model', icon: Sparkles },
  { id: 'comparison', label: 'Benchmark suite', icon: GitCompareArrows },
  { id: 'sensitivity', label: 'Sensitivity study', icon: LineChartIcon },
  { id: 'experiments', label: 'Experiment log', icon: Database },
  { id: 'methodology', label: 'Methodology & safety', icon: BookOpen },
];

const PAGE_META: Record<TabId, { eyebrow: string; title: string; summary: string }> = {
  dashboard: { eyebrow: 'FLIGHT SYSTEMS / OVERVIEW', title: 'Mission dashboard', summary: 'Explore lower-cost corridors across a synthetic airspace network.' },
  scenario: { eyebrow: 'EXPERIMENT DESIGN', title: 'Scenario lab', summary: 'Change the flight conditions and objective priorities for a controlled experiment.' },
  optimisation: { eyebrow: 'ALGORITHM WORKBENCH', title: 'Optimisation engine', summary: 'Inspect how classical, QUBO, QAOA and hybrid methods are evaluated.' },
  quantum: { eyebrow: 'QUANTUM COMPUTING / LAB 01', title: 'QUBO & quantum lab', summary: 'Explore binary decisions, circuit parameters and measured candidate states.' },
  ml: { eyebrow: 'PREDICTIVE MODEL / LAB 02', title: 'AI / ML fuel model', summary: 'Inspect the synthetic model used to estimate segment fuel impact.' },
  comparison: { eyebrow: 'RESEARCH / BENCHMARKS', title: 'Method comparison', summary: 'Compare route quality and runtime under the same scenario assumptions.' },
  sensitivity: { eyebrow: 'OBJECTIVE EXPLORER', title: 'Sensitivity study', summary: 'Observe how changing sustainability priorities affects route selection.' },
  experiments: { eyebrow: 'REPRODUCIBILITY / ARCHIVE', title: 'Experiment log', summary: 'Review previous optimisation runs saved by this local instance.' },
  methodology: { eyebrow: 'RESEARCH NOTES / SAFETY', title: 'Methodology & limitations', summary: 'Understand the maths behind AeroQ and what this demonstrator can and cannot prove.' },
};

const fmt = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value)
  ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const pct = (value: number | undefined) => `${value == null ? '—' : `${value > 0 ? '+' : ''}${fmt(value, 2)}%`}`;

export default function App() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [form, setForm] = useState<ScenarioRequest>(INITIAL_SCENARIO);
  const [data, setData] = useState<OptimizationResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [sensitivity, setSensitivity] = useState<SensitivityPoint[] | null>(null);
  const [sensitivityBusy, setSensitivityBusy] = useState(false);

  const runOptimisation = useCallback(async (nextForm: ScenarioRequest = form) => {
    setIsRunning(true); setError('');
    try {
      const result = await api.optimize(nextForm);
      setData(result); setLastRun(new Date()); setForm(nextForm);
      setHealth((old) => old ? { ...old, status: 'ok' } : { status: 'ok', project: 'AeroQ', mode: 'research simulation' });
      void api.experiments().then((r) => setExperiments(r.experiments)).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run optimisation.');
    } finally { setIsRunning(false); }
  }, [form]);

  useEffect(() => {
    void api.health().then(setHealth).catch(() => setHealth({ status: 'offline', project: 'AeroQ', mode: 'backend disconnected' }));
    void api.modelInfo().then(setModelInfo).catch(() => undefined);
    void api.experiments().then((r) => setExperiments(r.experiments)).catch(() => undefined);
    void api.optimize(INITIAL_SCENARIO).then((result) => { setData(result); setLastRun(new Date()); }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Backend not connected.'));
  }, []);

  const update = <K extends keyof ScenarioRequest>(key: K, value: ScenarioRequest[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSensitivity(null);
  };

  const loadPreset = (name: keyof typeof PRESETS) => {
    const next = { ...form, ...PRESETS[name] } as ScenarioRequest;
    setForm(next); setSensitivity(null);
  };

  const runSensitivity = async () => {
    setSensitivityBusy(true); setError('');
    try { const response = await api.sensitivity(form); setSensitivity(response.results); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sensitivity analysis failed.'); }
    finally { setSensitivityBusy(false); }
  };

  const refreshExperiments = async () => {
    try { setExperiments((await api.experiments()).experiments); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to refresh experiment log.'); }
  };

  const meta = PAGE_META[tab];
  return (
    <div className="app-shell">
      <div className={`sidebar-overlay ${mobileNav ? 'visible' : ''}`} onClick={() => setMobileNav(false)} />
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Plane size={20} strokeWidth={2.2} /><span /></div>
          <div><div className="brand-name">AERO<span>Q</span></div><div className="brand-subtitle">FLIGHT RESEARCH LAB</div></div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="workspace-chip"><span className="status-dot" /> LOCAL SIMULATION <ChevronDown size={13} /></div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV.map((item, index) => <div key={item.id}>
            {item.group && <div className={`nav-group ${index > 0 ? 'nav-group-spaced' : ''}`}>{item.group}</div>}
            <button className={`nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => { setTab(item.id); setMobileNav(false); }}>
              <item.icon size={17} strokeWidth={1.9} /><span>{item.label}</span>{tab === item.id && <span className="nav-active-bar" />}
            </button>
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-status"><div className={`status-light ${health?.status === 'ok' ? 'online' : 'offline'}`} /><div><b>{health?.status === 'ok' ? 'API connected' : 'API not connected'}</b><small>{health?.status === 'ok' ? 'localhost:8000' : 'Start the FastAPI server'}</small></div></div>
          <div className="sidebar-disclaimer"><ShieldAlert size={15} /><span>Research simulation only. Not operational aviation software.</span></div>
          <div className="sidebar-version"><span>AEROQ RESEARCH BUILD</span><span>v2.0.0</span></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="breadcrumb"><span>WORKSPACE</span><span className="breadcrumb-sep">/</span><b>{meta.title}</b></div>
          <div className="topbar-actions">
            <div className={`connection-badge ${health?.status === 'ok' ? 'connected' : 'disconnected'}`}><span className="status-dot" />{health?.status === 'ok' ? 'BACKEND ONLINE' : 'BACKEND OFFLINE'}</div>
            <div className="sim-badge"><Atom size={14} />{data?.quantum_details.simulation.fallback ? 'NUMPY STATEVECTOR FALLBACK' : data ? 'QISKIT STATEVECTOR' : 'QUANTUM SIMULATION'}</div>
            <button className="run-button" onClick={() => void runOptimisation()} disabled={isRunning}><Play size={14} fill="currentColor" />{isRunning ? 'RUNNING…' : 'RUN DEMO'}</button>
          </div>
        </header>

        <div className="page-content">
          <section className="page-intro">
            <div><div className="eyebrow"><span className="eyebrow-line" />{meta.eyebrow}</div><h1>{meta.title}</h1><p>{meta.summary}</p></div>
            <div className="intro-status"><span className="status-dot" /><div><b>{data ? 'SCENARIO READY' : isRunning ? 'COMPUTING ROUTES' : 'AWAITING BACKEND'}</b><small>{lastRun ? `Last run ${lastRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Synthetic scenario · Seed 42'}</small></div></div>
          </section>

          {error && <div className="error-banner"><AlertTriangle size={17} /><div><b>Action needs attention</b><span>{error}</span></div><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
          {isRunning && <div className="progress-track"><span /></div>}

          {tab === 'dashboard' && <Dashboard data={data} form={form} onUpdate={update} onPreset={loadPreset} onRun={() => void runOptimisation()} isRunning={isRunning} onNavigate={setTab} />}
          {tab === 'scenario' && <ScenarioPage form={form} onUpdate={update} onPreset={loadPreset} onRun={() => void runOptimisation()} isRunning={isRunning} />}
          {tab === 'optimisation' && <OptimisationPage data={data} onRun={() => void runOptimisation()} isRunning={isRunning} />}
          {tab === 'quantum' && <QuantumPage data={data} />}
          {tab === 'ml' && <MlPage data={data} modelInfo={modelInfo} onRefresh={() => void api.modelInfo().then(setModelInfo).catch((err: unknown) => setError(err instanceof Error ? err.message : 'ML model info failed.'))} />}
          {tab === 'comparison' && <ComparisonPage data={data} />}
          {tab === 'sensitivity' && <SensitivityPage form={form} results={sensitivity} busy={sensitivityBusy} onRun={() => void runSensitivity()} />}
          {tab === 'experiments' && <ExperimentsPage experiments={experiments} onRefresh={() => void refreshExperiments()} />}
          {tab === 'methodology' && <MethodologyPage />}

          <footer className="app-footer"><span><ShieldAlert size={13} /> RESEARCH & SIMULATION PROTOTYPE</span><span>Synthetic assumptions · Not certified for flight planning or ATC</span><span>AEROQ / 2026</span></footer>
        </div>
      </main>
    </div>
  );
}

function Dashboard({ data, form, onUpdate, onPreset, onRun, isRunning, onNavigate }: {
  data: OptimizationResponse | null; form: ScenarioRequest;
  onUpdate: <K extends keyof ScenarioRequest>(key: K, value: ScenarioRequest[K]) => void;
  onPreset: (name: keyof typeof PRESETS) => void; onRun: () => void; isRunning: boolean; onNavigate: (tab: TabId) => void;
}) {
  const base = data?.classical.find((r) => r.algorithm === 'Dijkstra') ?? data?.classical[0];
  const quantum = data?.quantum;
  const metrics = data ? [
    { label: 'ROUTE DISTANCE', value: fmt(data.hybrid.distance_km, 1), unit: 'km', icon: Route, tone: 'cyan', foot: `${pct(data.comparison.distance_difference_pct)} vs baseline` },
    { label: 'EST. FUEL BURN', value: fmt(data.hybrid.fuel_kg, 0), unit: 'kg', icon: Wind, tone: 'blue', foot: `${pct(data.comparison.fuel_reduction_pct)} vs baseline` },
    { label: 'EST. CO₂ EMISSIONS', value: fmt(data.hybrid.co2_kg, 0), unit: 'kg', icon: Leaf, tone: 'green', foot: `${pct(data.comparison.emission_reduction_pct)} vs baseline` },
    { label: 'OBJECTIVE SCORE', value: fmt(data.hybrid.objective, 3), unit: 'cost', icon: Target, tone: 'violet', foot: `${fmt(data.hybrid.runtime_ms, 1)} ms hybrid runtime` },
  ] : [];
  return <>
    <div className="mission-strip">
      <div className="mission-flight"><div className="mission-airport"><span>ORIGIN</span><b>{form.origin}</b><small>Departure node</small></div><div className="mission-track"><span className="track-node start" /><span className="track-dash" /><Plane size={17} className="track-plane" /><span className="track-dash" /><span className="track-node end" /></div><div className="mission-airport destination"><span>DESTINATION</span><b>{form.destination}</b><small>Arrival node</small></div></div>
      <div className="mission-divider" />
      <div className="mission-facts"><Fact label="AIRCRAFT CLASS" value={form.aircraft_category} /><Fact label="WIND COMPONENT" value={form.wind_condition < -0.15 ? 'Headwind' : form.wind_condition > 0.15 ? 'Tailwind' : 'Near neutral'} /><Fact label="CONGESTION" value={form.congestion_level > 0.6 ? 'High' : form.congestion_level > 0.3 ? 'Moderate' : 'Low'} tone={form.congestion_level > 0.6 ? 'warning' : 'normal'} /></div>
    </div>

    <div className="dashboard-layout">
      <section className="panel scenario-panel">
        <PanelHeading number="01" title="Scenario controls" subtitle="Flight conditions" action={<SlidersHorizontal size={15} />} />
        <div className="preset-list">
          {([['Normal', 'Normal'], ['Congestion', 'High congestion'], ['Headwind', 'Strong headwind'], ['Restricted', 'Restricted zone']] as const).map(([key, label]) => <button key={key} className={`preset-button ${form.scenario_name.toLowerCase().includes(key.toLowerCase()) || (key === 'Normal' && form.scenario_name === 'Normal conditions') ? 'selected' : ''}`} onClick={() => onPreset(key)}><span className={`preset-indicator ${key.toLowerCase()}`} />{label}<ArrowRight size={13} /></button>)}
        </div>
        <div className="compact-controls">
          <RangeField label="Congestion intensity" value={form.congestion_level} min={0} max={1} step={0.05} display={fmt(form.congestion_level, 2)} onChange={(v) => onUpdate('congestion_level', v)} />
          <RangeField label="Wind component" value={form.wind_condition} min={-0.8} max={0.8} step={0.05} display={`${form.wind_condition > 0 ? '+' : ''}${fmt(form.wind_condition, 2)}`} onChange={(v) => onUpdate('wind_condition', v)} />
          <RangeField label="Emission priority" value={form.emission_weight} min={0} max={3} step={0.1} display={`${fmt(form.emission_weight, 1)}×`} onChange={(v) => onUpdate('emission_weight', v)} />
          <label className="toggle-row"><span><ShieldAlert size={14} /> Restricted airspace</span><input type="checkbox" checked={form.restricted_airspace} onChange={(e) => onUpdate('restricted_airspace', e.target.checked)} /><i /></label>
        </div>
        <button className="button-primary full-width" onClick={onRun} disabled={isRunning}><Atom size={16} />{isRunning ? 'Optimising scenario…' : 'Optimise flight path'}<ArrowRight size={15} /></button>
        <div className="control-footnote"><Info size={13} /> Updates use synthetic airspace data. Re-run to refresh metrics.</div>
      </section>

      <section className="panel map-panel">
        <PanelHeading number="02" title="Airspace topology" subtitle={`${data?.graph.nodes.length ?? '—'} nodes · ${data?.graph.edges.length ?? '—'} segments`} action={<span className="live-tag"><span className="status-dot" /> SYNTHETIC GRAPH</span>} />
        <div className="map-container"><AirspaceMap graph={data?.graph} classicalRoute={base?.route ?? []} quantumRoute={quantum?.route ?? []} hybridRoute={data?.hybrid.route ?? []} /></div>
        <div className="map-legend"><LegendKey type="classical" label="Classical baseline" /><LegendKey type="quantum" label="QAOA decoded" /><LegendKey type="hybrid" label="Hybrid selected" /><LegendKey type="restricted" label="Restricted / high cost" /></div>
        <div className="map-bottomline"><span><Waypoints size={14} /> ROUTE VISUALISATION</span><button className="text-link" onClick={() => onNavigate('optimisation')}>Inspect optimisation <ArrowRight size={13} /></button></div>
      </section>
    </div>

    <div className="section-heading"><div><div className="eyebrow">03 / PERFORMANCE SNAPSHOT</div><h2>Selected route metrics</h2></div><div className="baseline-label"><span className="baseline-line" />Compared against Dijkstra baseline</div></div>
    <div className="metric-grid">
      {metrics.map((m) => <div className={`metric-card metric-${m.tone}`} key={m.label}><div className="metric-top"><span>{m.label}</span><m.icon size={16} /></div><div className="metric-value">{m.value}<small>{m.unit}</small></div><div className="metric-foot"><span className="metric-foot-dot" />{m.foot}</div></div>)}
    </div>

    {data ? <>
      <div className="two-column-grid">
        <section className="panel result-panel"><PanelHeading number="04" title="Route comparison" subtitle="Same graph · Same objective" action={<button className="text-link" onClick={() => onNavigate('comparison')}>Full benchmark <ArrowRight size={13} /></button>} />
          <div className="route-compare-list">
            <RouteRow name="Dijkstra" badge="CLASSICAL" route={base?.route ?? []} distance={base?.distance_km ?? null} objective={base?.objective ?? null} tone="blue" />
            <RouteRow name="QAOA sample" badge="QUANTUM SIM" route={quantum?.route ?? []} distance={quantum?.distance_km ?? null} objective={quantum?.objective ?? null} tone="violet" feasible={quantum?.feasible} />
            <RouteRow name="Hybrid result" badge="SELECTED" route={data.hybrid.route} distance={data.hybrid.distance_km} objective={data.hybrid.objective} tone="cyan" />
          </div>
        </section>
        <section className="panel pipeline-panel"><PanelHeading number="05" title="Optimisation pipeline" subtitle="How this result was produced" action={<Activity size={15} />} />
          <Pipeline data={data} />
          <div className="pipeline-note"><CheckCircle2 size={14} /> The hybrid route is checked against simulation constraints before metrics are displayed.</div>
        </section>
      </div>
      <section className="panel explanation-panel"><div className="explain-icon"><Info size={18} /></div><div><div className="eyebrow">ROUTE EXPLANATION</div><h3>Why this route?</h3><p>{data.explanation}</p></div><button className="button-secondary" onClick={() => onNavigate('methodology')}>How the score works <ArrowRight size={14} /></button></section>
    </> : <EmptyState title="Waiting for optimisation results" text="Start the FastAPI backend, then run the scenario to generate routes, quantum metadata and emissions estimates." />}
  </>;
}

function ScenarioPage({ form, onUpdate, onPreset, onRun, isRunning }: {
  form: ScenarioRequest; onUpdate: <K extends keyof ScenarioRequest>(key: K, value: ScenarioRequest[K]) => void;
  onPreset: (name: keyof typeof PRESETS) => void; onRun: () => void; isRunning: boolean;
}) {
  return <div className="page-stack">
    <section className="panel panel-pad"><PanelHeading number="01" title="Choose a test scenario" subtitle="Predefined conditions provide reproducible demonstrations" action={<Database size={15} />} />
      <div className="scenario-card-grid">{([
        ['Normal', 'Normal conditions', 'Balanced baseline conditions.', Compass],
        ['Congestion', 'High congestion', 'Adds pressure on busy segments.', RadioTower],
        ['Headwind', 'Strong headwind', 'Penalises unfavourable wind.', Wind],
        ['Restricted', 'Restricted airspace', 'Marks restricted synthetic edges.', ShieldAlert],
        ['Emissions', 'Emissions priority', 'Increases the CO₂ objective weight.', Leaf],
        ['Fuel', 'Fuel priority', 'Prioritises fuel in the weighted cost.', Gauge],
      ] as const).map(([key, title, desc, Icon]) => <button className={`scenario-card ${form.scenario_name === PRESETS[key].scenario_name ? 'chosen' : ''}`} key={key} onClick={() => onPreset(key)}><div className="scenario-card-icon"><Icon size={19} /></div><div><b>{title}</b><p>{desc}</p></div><ArrowRight size={15} className="scenario-card-arrow" /></button>)}</div>
    </section>
    <div className="two-column-grid scenario-config-grid">
      <section className="panel panel-pad"><PanelHeading number="02" title="Flight parameters" subtitle="Synthetic scenario inputs" />
        <div className="select-grid"><label className="field-label">Origin node<select value={form.origin} onChange={(e) => onUpdate('origin', e.target.value)}><option value="A01">A01 — Departure airport</option></select></label><label className="field-label">Destination node<select value={form.destination} onChange={(e) => onUpdate('destination', e.target.value)}><option value="A10">A10 — Arrival airport</option></select></label><label className="field-label">Aircraft category<select value={form.aircraft_category} onChange={(e) => onUpdate('aircraft_category', e.target.value)}><option>Narrow-body</option><option>Wide-body</option><option>Regional</option></select></label><label className="field-label">Scenario label<input value={form.scenario_name} onChange={(e) => onUpdate('scenario_name', e.target.value)} /></label></div>
        <RangeField label="Cruise speed assumption" value={form.cruise_speed_kmh} min={600} max={950} step={10} display={`${fmt(form.cruise_speed_kmh, 0)} km/h`} onChange={(v) => onUpdate('cruise_speed_kmh', v)} />
        <RangeField label="Fuel burn assumption" value={form.fuel_burn_kg_per_km} min={1} max={4} step={0.05} display={`${fmt(form.fuel_burn_kg_per_km, 2)} kg/km`} onChange={(v) => onUpdate('fuel_burn_kg_per_km', v)} />
        <RangeField label="Maximum route distance" value={form.max_distance_km} min={500} max={1400} step={25} display={`${fmt(form.max_distance_km, 0)} km`} onChange={(v) => onUpdate('max_distance_km', v)} />
      </section>
      <section className="panel panel-pad"><PanelHeading number="03" title="Environment & operations" subtitle="Factors that change route cost" />
        <RangeField label="Wind component" value={form.wind_condition} min={-0.8} max={0.8} step={0.05} display={form.wind_condition < 0 ? `Headwind ${fmt(Math.abs(form.wind_condition), 2)}` : `Tailwind ${fmt(form.wind_condition, 2)}`} onChange={(v) => onUpdate('wind_condition', v)} />
        <RangeField label="Weather severity" value={form.weather_penalty} min={0} max={0.6} step={0.02} display={fmt(form.weather_penalty, 2)} onChange={(v) => onUpdate('weather_penalty', v)} />
        <RangeField label="Congestion intensity" value={form.congestion_level} min={0} max={1} step={0.05} display={fmt(form.congestion_level, 2)} onChange={(v) => onUpdate('congestion_level', v)} />
        <RangeField label="Delay sensitivity" value={form.delay_sensitivity} min={0} max={1} step={0.05} display={fmt(form.delay_sensitivity, 2)} onChange={(v) => onUpdate('delay_sensitivity', v)} />
        <label className="toggle-row larger"><span><ShieldAlert size={15} /> Apply restricted-airspace flags</span><input type="checkbox" checked={form.restricted_airspace} onChange={(e) => onUpdate('restricted_airspace', e.target.checked)} /><i /></label>
        <label className="toggle-row larger"><span><Sparkles size={15} /> Include synthetic ML fuel cost</span><input type="checkbox" checked={form.use_ml_cost} onChange={(e) => onUpdate('use_ml_cost', e.target.checked)} /><i /></label>
      </section>
    </div>
    <section className="panel panel-pad"><PanelHeading number="04" title="Objective weights" subtitle="All algorithms share this weighted cost model" action={<span className="weight-total">Six cost weights</span>} />
      <div className="weight-grid">{([
        ['distance_weight', 'Distance', 3], ['fuel_weight', 'Fuel', 3], ['emission_weight', 'CO₂ emissions', 3], ['congestion_weight', 'Congestion', 3], ['delay_weight', 'Delay', 3], ['weather_weight', 'Weather', 3],
      ] as const).map(([key, label, max]) => <RangeField key={key} label={label} value={form[key]} min={0} max={max} step={0.1} display={`${fmt(form[key], 1)}×`} onChange={(v) => onUpdate(key, v)} />)}</div>
      <div className="form-actions"><div className="field-note"><Info size={14} /> Weights are relative priorities after per-edge normalisation, not currency values.</div><button className="button-primary" onClick={onRun} disabled={isRunning}><Play size={15} />{isRunning ? 'Running experiment…' : 'Run scenario'}</button></div>
    </section>
  </div>;
}

function OptimisationPage({ data, onRun, isRunning }: { data: OptimizationResponse | null; onRun: () => void; isRunning: boolean }) {
  return <div className="page-stack">
    <section className="panel panel-pad"><PanelHeading number="01" title="Processing stages" subtitle="A reduced hybrid quantum-classical workflow" action={<button className="button-secondary compact" onClick={onRun} disabled={isRunning}><RefreshCw size={14} className={isRunning ? 'spin' : ''} /> Rerun pipeline</button>} />
      <Pipeline data={data} large />
    </section>
    {data ? <><div className="algorithm-cards">{data.classical.map((r) => <AlgorithmCard key={r.algorithm} result={r} type="classical" />)}<AlgorithmCard result={data.quantum} type="quantum" /><AlgorithmCard result={data.hybrid} type="hybrid" /></div>
      <section className="panel panel-pad"><PanelHeading number="02" title="Candidate corridors" subtitle={`${data.candidate_routes.length} feasible candidate routes were considered`} />
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Candidate route</th><th>Distance</th><th>Fuel</th><th>CO₂</th><th>Objective</th><th>Status</th></tr></thead><tbody>{data.candidate_routes.map((r, i) => <tr key={`${r.route.join('-')}-${i}`}><td><span className="candidate-index">R{i + 1}</span>{r.route.join(' → ')}</td><td>{fmt(r.distance_km)} km</td><td>{fmt(r.fuel_kg, 0)} kg</td><td>{fmt(r.co2_kg, 0)} kg</td><td>{fmt(r.objective, 3)}</td><td><span className={`status-pill ${r.feasible ? 'success' : 'warning'}`}>{r.feasible ? 'Feasible' : 'Constraint hit'}</span></td></tr>)}</tbody></table></div>
      </section></> : <EmptyState title="Optimisation hasn't run yet" text="Run the scenario to populate classical, QAOA and hybrid metrics." />}
  </div>;
}

function QuantumPage({ data }: { data: OptimizationResponse | null }) {
  if (!data) return <EmptyState title="Quantum lab is waiting" text="Run an optimisation first. The QUBO matrix and QAOA experiment are returned by the backend." />;
  const { qubo, simulation, meta } = data.quantum_details;
  const histogram = Object.entries(simulation.probabilities || {}).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([bitstring, count]) => ({ bitstring, count }));
  const qMax = Math.max(1, ...qubo.Q.flat().map((v) => Math.abs(v)));
  const hasQuantumRoute = data.quantum.route.length > 0 && data.quantum.feasible;
  return <div className="page-stack">
    <section className="quantum-banner"><div className="quantum-orb"><Atom size={30} strokeWidth={1.25} /></div><div className="quantum-banner-copy"><div className="eyebrow">LOCAL QUANTUM-CIRCUIT EXPERIMENT</div><h2>From route choices to quantum energy</h2><p>AeroQ reduces the routing task to a small binary selection problem, maps the QUBO to an Ising cost Hamiltonian and evaluates a QAOA circuit locally.</p></div><div className="quantum-banner-status"><span className={`status-pill ${simulation.fallback ? 'warning' : 'success'}`}>{simulation.fallback ? 'SIMULATOR FALLBACK' : 'QISKIT EXECUTION'}</span><small>{simulation.backend}</small></div></section>
    <div className="quantum-stat-grid"><StatBlock icon={<Atom size={16} />} label="QUBITS" value={String(simulation.qubits)} hint="One per route candidate" /><StatBlock icon={<Layers3 size={16} />} label="QAOA DEPTH" value={`p = ${simulation.layers}`} hint="Cost + mixer layers" /><StatBlock icon={<Activity size={16} />} label="MEASUREMENT SHOTS" value={simulation.shots.toLocaleString()} hint="Sampled final states" /><StatBlock icon={<Clock3 size={16} />} label="CIRCUIT RUNTIME" value={`${fmt(simulation.runtime_ms, 1)} ms`} hint={simulation.method || 'Local simulator'} /></div>
    <div className="two-column-grid quantum-grid">
      <section className="panel panel-pad"><PanelHeading number="01" title="QUBO coefficient matrix" subtitle="Diagonal and pairwise route-selection coefficients" action={<span className="formula-chip">E(x) = xᵀQx + P(Σx − 1)²</span>} />
        <div className="qubo-matrix" style={{ '--matrix-count': Math.max(1, qubo.variables.length) } as CSSProperties}><div className="qubo-corner">Qᵢⱼ</div>{qubo.variables.map((v) => <div key={`col-${v}`} className="matrix-header">{v}</div>)}{qubo.Q.map((row, i) => <div className="matrix-row" key={`row-${i}`}><div className="matrix-header row-head">{qubo.variables[i]}</div>{row.map((v, j) => <div key={`${i}-${j}`} title={`${qubo.variables[i]}, ${qubo.variables[j]}: ${v}`} className={`matrix-cell ${i === j ? 'diagonal' : ''}`} style={{ backgroundColor: matrixColor(v, qMax) }}>{fmt(v, 1)}</div>)}</div>)}</div>
        <div className="matrix-scale"><span>− coefficient</span><div /><span>+ coefficient</span></div><div className="matrix-footnote"><Info size={13} /> Each binary variable selects one candidate route. The one-hot penalty discourages selecting zero or multiple routes. The full QUBO is also evaluated classically for validation.</div>
      </section>
      <section className="panel panel-pad"><PanelHeading number="02" title="Measured bitstrings" subtitle="Most frequently observed states from simulation" action={<span className="weight-total">{histogram.length} shown</span>} />
        {histogram.length ? <div className="histogram"><ResponsiveContainer width="100%" height={280}><BarChart data={histogram} margin={{ top: 8, right: 4, left: -22, bottom: 46 }}><CartesianGrid strokeDasharray="3 5" stroke="#203248" vertical={false} /><XAxis dataKey="bitstring" angle={-36} textAnchor="end" tick={{ fill: '#8fa4ba', fontSize: 10 }} interval={0} /><YAxis tick={{ fill: '#8fa4ba', fontSize: 10 }} /><Tooltip contentStyle={{ background: '#0b1728', border: '1px solid #294057', borderRadius: 8, color: '#eaf4ff' }} /><Bar dataKey="count" name="Shot count" fill="#36d5cf" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="empty-inline">No measured probabilities were returned.</div>}
        <div className="energy-summary"><div><span>MEASURED BEST ENERGY</span><b>{fmt(simulation.energy, 4)}</b></div><div><span>EXPECTATION ENERGY</span><b>{fmt(simulation.expectation_energy, 4)}</b></div><div><span>PENALTY P</span><b>{fmt(qubo.penalty, 1)}</b></div></div>
      </section>
    </div>
    <section className="panel panel-pad"><PanelHeading number="03" title="Circuit mechanics" subtitle="Conceptual gate flow; exact circuit depth and gate count are shown below" />
      <div className="circuit-panel"><div className="circuit-rows">{Array.from({ length: simulation.qubits }, (_, i) => <div className="circuit-row" key={i}><span className="qubit-label">q{i}</span><span className="wire" /><span className="gate gate-h">H</span><span className="wire" /><span className="gate gate-cost">COST</span><span className="wire" /><span className="gate gate-mixer">RX</span><span className="wire" /><span className="gate gate-measure">M</span></div>)}</div><div className="circuit-explainer"><div><b><span className="circle-num">1</span> Prepare superposition</b><p>Hadamard gates put each qubit into a superposition of binary values.</p></div><div><b><span className="circle-num">2</span> Apply cost unitary</b><p>RZ and RZZ operations encode the Ising cost terms derived from the QUBO.</p></div><div><b><span className="circle-num">3</span> Mix and measure</b><p>RX mixer rotations redistribute amplitudes; the circuit is sampled to evaluate route candidates.</p></div></div></div>
      <div className="quantum-meta-grid"><MetaItem label="Simulation backend" value={simulation.backend} /><MetaItem label="Classical parameter optimiser" value={simulation.method || 'QAOA parameter search'} /><MetaItem label="Circuit depth" value={simulation.circuit_depth != null ? String(simulation.circuit_depth) : 'Not reported by fallback'} /><MetaItem label="Gate count" value={simulation.gate_count != null ? String(simulation.gate_count) : 'Not reported by fallback'} /><MetaItem label="Gamma (γ)" value={Array.isArray(simulation.gamma) ? simulation.gamma.map((v) => fmt(v, 3)).join(', ') : fmt(simulation.gamma, 3)} /><MetaItem label="Beta (β)" value={Array.isArray(simulation.beta) ? simulation.beta.map((v) => fmt(v, 3)).join(', ') : fmt(simulation.beta, 3)} /><MetaItem label="Optimiser status" value={simulation.optimizer_success === false ? 'Finished with warning' : simulation.optimizer_success ? 'Converged' : 'Simulator-specific'} /><MetaItem label="Fallback note" value={String(meta.fallback_reason ?? (simulation.fallback ? 'Qiskit unavailable; NumPy state-vector fallback used.' : 'No fallback used.'))} /></div>
    </section>
    <section className="panel quantum-result-panel"><div className="quantum-result-icon"><Target size={20} /></div><div><div className="eyebrow">DECODED ROUTE</div><h3>{hasQuantumRoute ? data.quantum.route.join('  →  ') : 'No feasible one-hot route was observed'}</h3><p>{hasQuantumRoute ? `The measured candidate has an objective of ${fmt(data.quantum.objective, 4)} and is marked feasible under the selected simulation constraints.` : (data.quantum.explanation || 'The hybrid stage performed classical feasibility repair; this is not reported as a QAOA-selected route.')}</p></div><span className={`status-pill ${hasQuantumRoute ? 'success' : 'warning'}`}>{hasQuantumRoute ? 'FEASIBLE SAMPLE' : 'NO FEASIBLE SAMPLE'}</span></section>
    <div className="safety-note"><ShieldAlert size={15} /><span>This is local circuit simulation, not a result from a quantum annealer or real quantum computer. It does not establish quantum advantage.</span></div>
  </div>;
}

function MlPage({ data, modelInfo, onRefresh }: { data: OptimizationResponse | null; modelInfo: ModelInfo | null; onRefresh: () => void }) {
  const info = modelInfo ?? (data?.ml_details ? {
    model: data.ml_details.model || 'RandomForestRegressor', data_source: data.ml_details.data_source || 'synthetic demonstration data',
    training_rows: data.ml_details.training_rows || 0, test_rows: data.ml_details.test_rows || 0,
    test_r2: data.ml_details.test_r2 ?? 0, mae_kg: data.ml_details.mae_kg ?? 0, rmse_kg: data.ml_details.rmse_kg ?? 0,
    ridge_baseline_mae_kg: data.ml_details.ridge_baseline_mae_kg ?? 0,
    feature_importances: data.ml_details.feature_importances || [], warning: data.ml_details.warning || 'Synthetic demo model only.',
  } : null);
  return <div className="page-stack">
    <section className="ml-hero"><div className="ml-hero-mark"><Sparkles size={24} /></div><div><div className="eyebrow">PREDICTIVE RESEARCH / SYNTHETIC DATA</div><h2>Fuel impact surrogate</h2><p>A Random Forest learns the documented synthetic fuel relationship across segment conditions. It is a demonstration of how a learned estimate could be integrated into route cost—not an airline-trained model.</p></div><button className="button-secondary" onClick={onRefresh}><RefreshCw size={14} /> Refresh metrics</button></section>
    {info ? <><div className="ml-metric-grid"><MetricSimple label="HELD-OUT TEST R²" value={fmt(info.test_r2, 4)} sub="On synthetic test set" /><MetricSimple label="TEST MAE" value={`${fmt(info.mae_kg, 2)} kg`} sub="Mean absolute error" /><MetricSimple label="TEST RMSE" value={`${fmt(info.rmse_kg, 2)} kg`} sub="Root mean square error" /><MetricSimple label="TEST ROWS" value={String(info.test_rows)} sub={`${info.training_rows} training rows`} /></div>
      <div className="two-column-grid"><section className="panel panel-pad"><PanelHeading number="01" title="Feature importance" subtitle="Relative importance for this fitted forest" />{info.feature_importances.length ? <div className="feature-bars">{info.feature_importances.slice().sort((a, b) => b.importance - a.importance).map((item) => <div className="feature-row" key={item.feature}><div><span>{item.feature}</span><b>{fmt(item.importance * 100, 1)}%</b></div><div className="feature-track"><span style={{ width: `${Math.min(100, item.importance * 100)}%` }} /></div></div>)}</div> : <EmptyInline text="Feature importances are not available." />}</section>
      <section className="panel panel-pad"><PanelHeading number="02" title="Model validation" subtitle="Random Forest vs Ridge baseline" /><div className="validation-row"><span>Random Forest test MAE</span><b>{fmt(info.mae_kg, 2)} kg</b></div><div className="validation-row"><span>Ridge baseline test MAE</span><b>{fmt(info.ridge_baseline_mae_kg, 2)} kg</b></div><div className="validation-row"><span>Test R²</span><b>{fmt(info.test_r2, 4)}</b></div><div className="validation-disclaimer"><Info size={14} /><p>{info.warning}</p></div></section></div></> : <EmptyState title="ML model information unavailable" text="Start the backend and reload this page. The ML model is optional for the main optimiser." />}
    {data && <section className="panel panel-pad"><PanelHeading number="03" title="Fuel estimate on the current demo graph" subtitle="Mean of segment-level synthetic estimates, not a full-flight prediction" /><div className="delta-grid"><div className="delta-item"><span>Baseline modelled segment fuel</span><b>{fmt(data.graph.edges.reduce((sum, edge) => sum + edge.fuel_kg, 0) / Math.max(1, data.graph.edges.length), 2)} kg</b><small>Mean across {data.graph.edges.length} synthetic segments</small></div><div className="delta-item"><span>Random Forest segment estimate</span><b>{fmt(data.graph.edges.reduce((sum, edge) => sum + (edge.ml_fuel_kg ?? edge.fuel_kg), 0) / Math.max(1, data.graph.edges.length), 2)} kg</b><small>Uses model estimates included in the graph response</small></div><div className="delta-item"><span>ML cost enabled</span><b>{data.ml_details.enabled ? 'YES' : 'NO'}</b><small>Current optimisation request</small></div><div className="delta-item"><span>Segment estimate count</span><b>{data.graph.edges.filter((edge) => edge.ml_fuel_kg != null).length}</b><small>Only when ML cost is enabled</small></div></div></section>}
    <div className="safety-note"><ShieldAlert size={15} /><span>Training targets are generated from synthetic assumptions. These metrics do not represent real aviation fuel-prediction accuracy.</span></div>
  </div>;
}

function ComparisonPage({ data }: { data: OptimizationResponse | null }) {
  if (!data) return <EmptyState title="No benchmark results yet" text="Run an optimisation to compare algorithms on the same graph and cost model." />;
  const results = [...data.classical, data.quantum, data.hybrid];
  const chartRows = results.map((r) => ({ name: r.algorithm.replace(' state-vector fallback', ' fallback'), objective: r.objective ?? 0, runtime: r.runtime_ms ?? 0, fuel: r.fuel_kg ?? 0, co2: r.co2_kg ?? 0, feasible: r.feasible }));
  return <div className="page-stack">
    <div className="benchmark-callout"><div><div className="eyebrow">FAIR COMPARISON RULE</div><b>One synthetic graph. One weighted cost model. Shared constraints.</b><p>Classical, quantum and hybrid methods are compared using the same route metrics. A local QAOA result is not evidence of quantum advantage.</p></div><div className="benchmark-icon"><GitCompareArrows size={23} /></div></div>
    <section className="panel panel-pad"><PanelHeading number="01" title="Algorithm scorecard" subtitle="Route metrics returned by the backend" />
      <div className="table-wrap"><table className="data-table benchmark-table"><thead><tr><th>Method</th><th>Feasibility</th><th>Distance</th><th>Fuel</th><th>CO₂</th><th>Time</th><th>Objective</th><th>Runtime</th></tr></thead><tbody>{results.map((r) => <tr key={r.algorithm}><td><b>{r.algorithm}</b></td><td><span className={`status-pill ${r.feasible ? 'success' : 'warning'}`}>{r.feasible ? 'Feasible' : 'Not decoded'}</span></td><td>{fmt(r.distance_km)} km</td><td>{fmt(r.fuel_kg, 0)} kg</td><td>{fmt(r.co2_kg, 0)} kg</td><td>{fmt(r.time_min)} min</td><td>{fmt(r.objective, 3)}</td><td>{fmt(r.runtime_ms, 2)} ms</td></tr>)}</tbody></table></div>
    </section>
    <div className="two-column-grid"><section className="panel panel-pad"><PanelHeading number="02" title="Objective score" subtitle="Lower is better for this objective" /><ResponsiveContainer width="100%" height={280}><BarChart data={chartRows} margin={{ top: 12, right: 6, left: -20, bottom: 44 }}><CartesianGrid strokeDasharray="3 5" stroke="#203248" vertical={false} /><XAxis dataKey="name" angle={-20} textAnchor="end" tick={{ fill: '#8fa4ba', fontSize: 10 }} interval={0} /><YAxis tick={{ fill: '#8fa4ba', fontSize: 10 }} /><Tooltip contentStyle={{ background: '#0b1728', border: '1px solid #294057', borderRadius: 8, color: '#eaf4ff' }} /><Bar dataKey="objective" name="Objective" radius={[4, 4, 0, 0]}>{chartRows.map((entry, index) => <Cell key={entry.name} fill={index === chartRows.length - 1 ? '#35d5ce' : index === chartRows.length - 2 ? '#b4a0ff' : '#4288c7'} />)}</Bar></BarChart></ResponsiveContainer></section>
      <section className="panel panel-pad"><PanelHeading number="03" title="Runtime profile" subtitle="Measured locally; machine dependent" /><ResponsiveContainer width="100%" height={280}><BarChart data={chartRows} margin={{ top: 12, right: 6, left: -20, bottom: 44 }}><CartesianGrid strokeDasharray="3 5" stroke="#203248" vertical={false} /><XAxis dataKey="name" angle={-20} textAnchor="end" tick={{ fill: '#8fa4ba', fontSize: 10 }} interval={0} /><YAxis tick={{ fill: '#8fa4ba', fontSize: 10 }} /><Tooltip contentStyle={{ background: '#0b1728', border: '1px solid #294057', borderRadius: 8, color: '#eaf4ff' }} /><Bar dataKey="runtime" name="Runtime (ms)" fill="#e8ad53" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></section></div>
    <section className="panel panel-pad"><PanelHeading number="04" title="Measured deltas vs Dijkstra" subtitle="Computed from returned results — not predicted gains" />
      <div className="delta-grid">{[
        ['Fuel change', data.comparison.fuel_reduction_pct], ['CO₂ change', data.comparison.emission_reduction_pct], ['Distance change', data.comparison.distance_difference_pct], ['Objective change', data.comparison.objective_improvement_pct],
      ].map(([label, value]) => <div className="delta-item" key={String(label)}><span>{String(label)}</span><b className={Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : ''}>{pct(Number(value))}</b><small>{Number(value) === 0 ? 'No measured change' : Number(value) > 0 ? 'Reduction / improvement' : 'Increase vs baseline'}</small></div>)}</div>
    </section>
  </div>;
}

function SensitivityPage({ form, results, busy, onRun }: { form: ScenarioRequest; results: SensitivityPoint[] | null; busy: boolean; onRun: () => void }) {
  return <div className="page-stack"><section className="panel panel-pad"><PanelHeading number="01" title="Emission-weight sweep" subtitle="Five runs with different CO₂ objective priorities" action={<button className="button-primary compact" onClick={onRun} disabled={busy}><LineChartIcon size={14} />{busy ? 'Calculating…' : 'Run sensitivity'}</button>} /><p className="section-copy">The backend runs the optimisation at emission weights 0.25, 0.75, 1.0, 1.5 and 2.0. Other scenario settings stay fixed to the current controls.</p>
      {results ? <div className="two-column-grid sensitivity-charts"><div className="chart-card"><h3>Estimated CO₂ vs emission weight</h3><ResponsiveContainer width="100%" height={270}><LineChart data={results}><CartesianGrid strokeDasharray="3 5" stroke="#203248" /><XAxis dataKey="emission_weight" tick={{ fill: '#8fa4ba', fontSize: 11 }} /><YAxis tick={{ fill: '#8fa4ba', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#0b1728', border: '1px solid #294057', borderRadius: 8, color: '#eaf4ff' }} /><Line type="monotone" dataKey="co2_kg" name="CO₂ (kg)" stroke="#38d3ca" strokeWidth={2.5} dot={{ r: 4, fill: '#38d3ca' }} /></LineChart></ResponsiveContainer></div><div className="chart-card"><h3>Objective vs emission weight</h3><ResponsiveContainer width="100%" height={270}><LineChart data={results}><CartesianGrid strokeDasharray="3 5" stroke="#203248" /><XAxis dataKey="emission_weight" tick={{ fill: '#8fa4ba', fontSize: 11 }} /><YAxis tick={{ fill: '#8fa4ba', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#0b1728', border: '1px solid #294057', borderRadius: 8, color: '#eaf4ff' }} /><Line type="monotone" dataKey="objective" name="Objective score" stroke="#b4a0ff" strokeWidth={2.5} dot={{ r: 4, fill: '#b4a0ff' }} /></LineChart></ResponsiveContainer></div></div> : <div className="sensitivity-empty"><div className="sensitivity-icon"><LineChartIcon size={23} /></div><h3>See priorities change the route</h3><p>Run a weight sweep to compare route, objective and emissions across five backend optimisation runs.</p><button className="button-primary" onClick={onRun} disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}{busy ? 'Running sweep…' : 'Run sensitivity sweep'}</button></div>}
    </section>
    {results && <section className="panel panel-pad"><PanelHeading number="02" title="Sweep results" subtitle="Computed route at each emission weight" /><div className="table-wrap"><table className="data-table"><thead><tr><th>Emission weight</th><th>Selected route</th><th>Objective</th><th>Fuel</th><th>CO₂</th></tr></thead><tbody>{results.map((r) => <tr key={r.emission_weight}><td><b>{fmt(r.emission_weight, 2)}×</b></td><td>{r.route.join(' → ')}</td><td>{fmt(r.objective, 3)}</td><td>{fmt(r.fuel_kg, 0)} kg</td><td>{fmt(r.co2_kg, 0)} kg</td></tr>)}</tbody></table></div></section>}
    <div className="note-block"><Info size={14} /><span>Objective scores are recomputed from the current synthetic scenario. Different weights can change the route, but route changes are not guaranteed for every scenario. Current emission weight: {fmt(form.emission_weight, 1)}×.</span></div>
  </div>;
}

function ExperimentsPage({ experiments, onRefresh }: { experiments: ExperimentRecord[]; onRefresh: () => void }) {
  return <div className="page-stack"><section className="panel panel-pad"><PanelHeading number="01" title="Local experiment archive" subtitle="Saved runs from this AeroQ installation" action={<button className="button-secondary compact" onClick={onRefresh}><RefreshCw size={14} /> Refresh log</button>} />
    {experiments.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Run ID</th><th>Timestamp</th><th>Scenario</th><th>Hybrid route</th><th>Distance</th><th>Fuel</th><th>CO₂</th><th>Quantum backend</th></tr></thead><tbody>{experiments.map((e) => <tr key={e.id}><td><span className="mono-id">{e.id}</span></td><td>{new Date(e.created_at).toLocaleString()}</td><td>{e.scenario}</td><td>{e.hybrid_route.join(' → ')}</td><td>{fmt(e.distance_km)} km</td><td>{fmt(e.fuel_kg, 0)} kg</td><td>{fmt(e.co2_kg, 0)} kg</td><td>{e.quantum_backend || 'Not recorded'}</td></tr>)}</tbody></table></div> : <EmptyState title="No experiments recorded yet" text="Run the dashboard demo. Each successful optimisation is saved to the local data/experiments.json file." />}
  </section><div className="note-block"><Database size={14} /><span>The experiment log contains synthetic scenario runs saved on the local machine. It is not a connection to an airline or live operational aviation database.</span></div></div>;
}

function MethodologyPage() {
  return <div className="page-stack">
    <section className="methodology-hero"><div className="methodology-mark"><BookOpen size={23} /></div><div><div className="eyebrow">AEROQ RESEARCH NOTES</div><h2>Optimising the route, not just the distance.</h2><p>AeroQ is a local research demonstrator for comparing graph search, binary optimisation and quantum-circuit simulation on a small synthetic airspace network.</p></div></section>
    <div className="method-grid">
      <MethodCard number="01" title="Airspace as a graph" icon={<Waypoints size={17} />}><p>Airports and waypoints are nodes. Segments are edges with synthetic distance, time, fuel, wind, congestion, weather, delay and restriction attributes.</p><code>G = (V, E)</code></MethodCard>
      <MethodCard number="02" title="Classical baselines" icon={<Route size={17} />}><p>Dijkstra and A* search for low-cost paths using the same weighted edge-cost function. A* uses waypoint coordinates as a heuristic.</p><code>min Σ edge_cost(e)</code></MethodCard>
      <MethodCard number="03" title="QUBO formulation" icon={<Layers3 size={17} />}><p>Each candidate route gets a binary variable. The one-hot penalty encourages selecting exactly one candidate.</p><code>E(x) = Σ cᵢxᵢ + P(Σxᵢ − 1)²</code></MethodCard>
      <MethodCard number="04" title="QAOA circuit" icon={<Atom size={17} />}><p>The cost Hamiltonian phase is alternated with an X-mixer. A classical optimiser tunes γ and β parameters and the local simulator produces a measurement distribution.</p><code>|ψ(γ, β)⟩ = ∏ Uᴹ(β)Uᶜ(γ)|+⟩</code></MethodCard>
      <MethodCard number="05" title="Hybrid search" icon={<GitCompareArrows size={17} />}><p>Classical preprocessing reduces the candidates, QAOA explores the binary model and post-processing checks feasibility. The hybrid result may match the classical result.</p><code>Reduce → QUBO → QAOA → Validate</code></MethodCard>
      <MethodCard number="06" title="Fuel & CO₂ model" icon={<Leaf size={17} />}><p>Fuel is estimated from distance, the assumed burn rate and synthetic weather/congestion/wind factors. The demo uses 3.16 kg CO₂ per kg fuel.</p><code>CO₂ = fuel × 3.16</code></MethodCard>
    </div>
    <section className="panel panel-pad"><PanelHeading number="07" title="Interpret results responsibly" subtitle="What this prototype demonstrates—and what it does not" />
      <div className="limits-grid"><div className="limit-item allowed"><CheckCircle2 size={17} /><div><b>What it can demonstrate</b><p>Route cost modelling on synthetic graphs, comparisons between algorithms, reduced QUBO construction, local QAOA circuit simulation and reproducible sensitivity experiments.</p></div></div><div className="limit-item not-allowed"><ShieldAlert size={17} /><div><b>What it cannot claim</b><p>It is not certified navigation software, does not control real aircraft or air traffic, uses no live operational airspace data and does not prove quantum advantage.</p></div></div></div>
    </section>
    <div className="safety-note"><ShieldAlert size={15} /><span>This prototype is a research and simulation demonstrator. It does not provide certified aviation navigation, operational flight planning, air-traffic-control or aviation safety advice.</span></div>
  </div>;
}

function AirspaceMap({ graph, classicalRoute, quantumRoute, hybridRoute }: { graph?: { nodes: GraphNode[]; edges: GraphEdge[] }; classicalRoute: string[]; quantumRoute: string[]; hybridRoute: string[] }) {
  if (!graph?.nodes?.length) return <div className="map-empty"><LoaderCircle size={22} /><span>Waiting for graph generation…</span></div>;
  const xs = graph.nodes.map((n) => n.x); const ys = graph.nodes.map((n) => n.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const px = (n: GraphNode) => 42 + ((n.x - minX) / (maxX - minX || 1)) * 690;
  const py = (n: GraphNode) => 42 + ((n.y - minY) / (maxY - minY || 1)) * 306;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const points = (route: string[]) => route.map((id) => byId.get(id)).filter((n): n is GraphNode => Boolean(n));
  const routeLines = (route: string[], kind: string) => {
    const nodes = points(route);
    return nodes.slice(0, -1).map((a, i) => { const b = nodes[i + 1]; return <line key={`${kind}-${a.id}-${b.id}`} x1={px(a)} y1={py(a)} x2={px(b)} y2={py(b)} className={`route-line route-${kind}`} />; });
  };
  return <svg className="airspace-svg" viewBox="0 0 780 390" role="img" aria-label="Synthetic airspace graph showing route alternatives">
    <defs><pattern id="mapGrid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M 34 0 L 0 0 0 34" fill="none" stroke="#243a50" strokeWidth="0.7" opacity=".7" /></pattern><radialGradient id="mapGlow"><stop offset="0%" stopColor="#0f5267" stopOpacity=".27" /><stop offset="100%" stopColor="#071726" stopOpacity="0" /></radialGradient></defs>
    <rect width="780" height="390" fill="url(#mapGrid)" /><ellipse cx="420" cy="180" rx="340" ry="210" fill="url(#mapGlow)" />
    <path d="M25 320 Q150 260 180 295 T360 260 T540 295 T760 230" fill="none" stroke="#203e56" strokeWidth="1.2" strokeDasharray="5 7" /><path d="M20 85 Q160 120 300 65 T550 85 T765 35" fill="none" stroke="#234158" strokeWidth="1" strokeDasharray="2 8" />
    {graph.edges.map((edge) => { const a = byId.get(edge.source); const b = byId.get(edge.target); if (!a || !b) return null; return <line key={`${edge.source}-${edge.target}`} x1={px(a)} y1={py(a)} x2={px(b)} y2={py(b)} className={`network-edge ${edge.restriction > 0 ? 'edge-restricted' : edge.congestion > 0.55 ? 'edge-congested' : ''}`}><title>{`${edge.source} → ${edge.target} · ${fmt(edge.distance, 1)} km · congestion ${fmt(edge.congestion, 2)}`}</title></line>; })}
    {routeLines(classicalRoute, 'classical')}{routeLines(quantumRoute, 'quantum')}{routeLines(hybridRoute, 'hybrid')}
    {graph.nodes.map((node) => <g key={node.id} className="map-node"><title>{`${node.id} · ${node.kind}`}</title>{node.kind === 'airport' && <circle cx={px(node)} cy={py(node)} r="15" className="airport-halo" />}<circle cx={px(node)} cy={py(node)} r={node.kind === 'airport' ? 7 : 4.5} className={node.kind === 'airport' ? 'airport-point' : 'waypoint-point'} /><circle cx={px(node)} cy={py(node)} r="1.6" fill="#e9fbff" /><text x={px(node) + (node.x > 8 ? -11 : 12)} y={py(node) - 11} textAnchor={node.x > 8 ? 'end' : 'start'} className={node.kind === 'airport' ? 'airport-label' : 'waypoint-label'}>{node.id}</text></g>)}
    <g className="map-corner-label"><text x="16" y="20">SYNTHETIC AIRSPACE · NOT FOR NAVIGATION</text><text x="765" y="375" textAnchor="end">COORDINATE GRID / DEMO</text></g>
  </svg>;
}

function PanelHeading({ number, title, subtitle, action }: { number?: string; title: string; subtitle?: string; action?: ReactNode }) { return <div className="panel-heading"><div className="panel-heading-main">{number && <span className="panel-number">{number}</span>}<div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div></div>{action && <div className="panel-action">{action}</div>}</div>; }
function Fact({ label, value, tone = 'normal' }: { label: string; value: string; tone?: string }) { return <div className="mission-fact"><span>{label}</span><b className={tone === 'warning' ? 'text-amber' : ''}>{value}</b></div>; }
function RangeField({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) { return <label className="range-field"><span className="range-field-head"><span>{label}</span><b>{display}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ '--range-progress': `${Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100))}%` } as CSSProperties} /></label>; }
function LegendKey({ type, label }: { type: string; label: string }) { return <span className="legend-key"><i className={`legend-swatch ${type}`} />{label}</span>; }
function RouteRow({ name, badge, route, distance, objective, tone, feasible = true }: { name: string; badge: string; route: string[]; distance: number | null; objective: number | null; tone: string; feasible?: boolean }) { return <div className={`route-row route-row-${tone}`}><div className="route-row-heading"><span className="route-tone-mark" /><b>{name}</b><span className="route-row-badge">{badge}</span><div className="route-row-values"><b>{fmt(distance, 1)} <small>km</small></b><span>Cost {fmt(objective, 3)}</span></div></div><div className="route-row-path">{route.length ? route.map((node, i) => <span key={`${node}-${i}`} className="route-chip-wrap"><span className="route-chip">{node}</span>{i < route.length - 1 && <ArrowRight size={11} />}</span>) : <span className="unavailable-text">No feasible route decoded from the measured state</span>}</div>{!feasible && route.length > 0 && <div className="route-row-warning"><AlertTriangle size={12} /> Candidate did not pass feasibility checks.</div>}</div>; }
function Pipeline({ data, large = false }: { data: OptimizationResponse | null; large?: boolean }) { const hasData = Boolean(data); const stages = [
  { label: 'Scenario', small: 'Inputs', icon: Compass, done: hasData }, { label: 'Airspace graph', small: 'NetworkX', icon: Waypoints, done: hasData }, { label: 'Classical', small: 'Dijkstra / A*', icon: Route, done: hasData }, { label: 'QUBO model', small: 'Binary objective', icon: Layers3, done: Boolean(data?.quantum_details.qubo) }, { label: 'QAOA circuit', small: data?.quantum_details.simulation.fallback ? 'NumPy fallback' : 'Qiskit / local', icon: Atom, done: Boolean(data?.quantum_details.simulation) }, { label: 'Hybrid', small: 'Candidate repair', icon: GitCompareArrows, done: Boolean(data?.hybrid) }, { label: 'Validation', small: data?.hybrid.feasible ? 'Feasible' : 'Check constraints', icon: CheckCircle2, done: Boolean(data?.hybrid) }, { label: 'Emissions', small: 'Fuel + CO₂', icon: Leaf, done: Boolean(data?.hybrid.co2_kg) },
  ]; return <div className={`pipeline ${large ? 'pipeline-large' : ''}`}>{stages.map((stage, i) => <div key={stage.label} className={`pipeline-stage ${stage.done ? 'done' : ''}`}><div className="pipeline-stage-icon"><stage.icon size={16} />{stage.done && <span className="pipeline-check"><Check size={9} /></span>}</div><b>{stage.label}</b><small>{stage.small}</small>{i < stages.length - 1 && <ArrowRight className="pipeline-arrow" size={13} />}</div>)}</div>; }
function AlgorithmCard({ result, type }: { result: RouteResult; type: string }) { return <article className={`algorithm-card algorithm-${type}`}><div className="algorithm-card-top"><span>{type === 'classical' ? <Route size={15} /> : type === 'quantum' ? <Atom size={15} /> : <GitCompareArrows size={15} />}{result.algorithm}</span><span className={`status-pill ${result.feasible ? 'success' : 'warning'}`}>{result.feasible ? 'FEASIBLE' : 'NO ROUTE'}</span></div><strong>{fmt(result.objective, 3)}</strong><small>Objective score</small><div className="algorithm-card-route">{result.route.length ? result.route.join(' → ') : 'No measured route candidate'}</div><div className="algorithm-card-stats"><span>{fmt(result.distance_km)} km</span><span>{fmt(result.runtime_ms, 2)} ms</span></div></article>; }
function StatBlock({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) { return <div className="quantum-stat"><div className="quantum-stat-icon">{icon}</div><span>{label}</span><b>{value}</b><small>{hint}</small></div>; }
function MetaItem({ label, value }: { label: string; value: string }) { return <div className="meta-item"><span>{label}</span><b>{value}</b></div>; }
function matrixColor(value: number, max: number): string { const alpha = 0.07 + (Math.abs(value) / max) * 0.48; return value < 0 ? `rgba(54, 213, 206, ${alpha})` : `rgba(82, 142, 204, ${alpha})`; }
function MetricSimple({ label, value, sub }: { label: string; value: string; sub: string }) { return <div className="metric-simple"><span>{label}</span><b>{value}</b><small>{sub}</small></div>; }
function MethodCard({ number, title, icon, children }: { number: string; title: string; icon: ReactNode; children: ReactNode }) { return <article className="panel method-card"><div className="method-card-head"><span>{number}</span><i>{icon}</i></div><h3>{title}</h3>{children}</article>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <section className="empty-state"><div className="empty-state-icon"><RadioTower size={24} /></div><h3>{title}</h3><p>{text}</p></section>; }
function EmptyInline({ text }: { text: string }) { return <div className="empty-inline"><Info size={15} />{text}</div>; }
