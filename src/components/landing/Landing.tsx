import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type Lenis from "lenis";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CloudRain,
  Droplets,
  Gauge,
  Layers3,
  MapPinned,
  Network,
  Route,
  Shield,
  Waves,
  Wind,
} from "lucide-react";
import change2020 from "@/assets/sat_2020.jpg";
import change2024 from "@/assets/sat_2024.jpg";
import "./landing.css";

const FEATURES = [
  {
    verb: "Observe",
    title: "Read the conditions before they compound.",
    body: "Bring rainfall, road, drainage and facility context into one operational view. Every signal keeps its source and evidence status attached.",
    Icon: CloudRain,
    visual: "rain",
    tag: "WEATHER CONTEXT",
  },
  {
    verb: "Model",
    title: "See where drainage pressure builds.",
    body: "Explore how rainfall assumptions load the stormwater network, with modelled inflows and capacity thresholds visible at each stage.",
    Icon: Waves,
    visual: "drain",
    tag: "DRAINAGE NETWORK",
  },
  {
    verb: "Locate",
    title: "Find the streets where water collects.",
    body: "Follow scenario flood zones into road segments and inspect the depth assumptions that change vehicle access.",
    Icon: Droplets,
    visual: "flood",
    tag: "FLOOD EXPOSURE",
  },
  {
    verb: "Assess",
    title: "Understand how the network slows.",
    body: "Read traffic conditions alongside closures and water depth. Keep provider observations distinct from scenario-derived speeds.",
    Icon: Gauge,
    visual: "traffic",
    tag: "ROAD CONDITIONS",
  },
  {
    verb: "Respond",
    title: "Reassess the route to critical care.",
    body: "Compare an emergency vehicle's primary path with a bypass and inspect estimated travel time, delay and route source.",
    Icon: Route,
    visual: "route",
    tag: "EMERGENCY ACCESS",
  },
  {
    verb: "Trace",
    title: "Follow the links across city systems.",
    body: "Connect a hazard to the infrastructure it can affect, then continue downstream to services and facilities that depend on it.",
    Icon: Network,
    visual: "cascade",
    tag: "DEPENDENCY CHAIN",
  },
  {
    verb: "Compare",
    title: "Test the intervention before the next event.",
    body: "Compare scenario assumptions and mitigation choices over a clearly marked planning horizon. Model outputs are not forecasts.",
    Icon: Activity,
    visual: "compare",
    tag: "SCENARIO REVIEW",
  },
] as const;

const HORIZON = [
  { hour: "0h", title: "Baseline", detail: "Starting conditions" },
  { hour: "6h", title: "Pressure builds", detail: "Rainfall assumptions" },
  { hour: "24h", title: "Impacts emerge", detail: "Drainage & roads" },
  { hour: "48h", title: "Access changes", detail: "Facilities & routes" },
  { hour: "72h", title: "Plan the response", detail: "Compare interventions" },
] as const;

const MODULES = [
  {
    href: "/gis-explorer-3d",
    name: "3D GIS Explorer",
    tag: "CITY VIEW",
    text: "Explore roads, facilities and scenario layers around Marine Lines.",
    size: "large",
    Icon: MapPinned,
  },
  {
    href: "/gis-explorer-3d",
    name: "Rainfall scenario",
    tag: "MODELLED",
    text: "Change rainfall inputs and follow connected impacts across the network.",
    size: "tall",
    Icon: CloudRain,
  },
  {
    href: "/gis-explorer-3d",
    name: "Emergency routes",
    tag: "TRAFFIC AWARE",
    text: "Compare a route to critical care with traffic context and arrival estimates.",
    size: "tall",
    Icon: Route,
  },
  {
    href: "/gis-explorer-3d",
    name: "Infrastructure risk",
    tag: "SOURCE LABELLED",
    text: "Inspect exposure and access conditions for essential services.",
    size: "wide",
    Icon: Shield,
  },
] as const;

function FeatureVisual({ type }: { type: (typeof FEATURES)[number]["visual"] }) {
  return (
    <div className={`pr-feature-visual pr-viz-${type}`} aria-hidden="true">
      <div className="pr-viz-head">
        <span>MARINE LINES · SCENARIO</span>
        <span className="pr-viz-state">
          <i /> MODELLED
        </span>
      </div>
      {type === "rain" && (
        <div className="pr-viz-rain">
          <div className="pr-viz-value">
            64<span> mm/h</span>
          </div>
          <div className="pr-rain-bars">
            {[22, 31, 28, 45, 38, 62, 48, 76, 59, 92, 70, 100, 82, 66, 87, 59, 43, 55].map(
              (n, i) => (
                <i key={i} style={{ height: `${n}%` }} />
              ),
            )}
          </div>
          <small>Illustrative rainfall input · scenario control</small>
        </div>
      )}
      {type === "drain" && (
        <div className="pr-viz-network">
          <div className="pr-net-node main">
            <Waves size={16} />
            <span>Trunk drain</span>
            <b>86%</b>
          </div>
          <div className="pr-net-branches">
            <i />
            <i />
            <i />
          </div>
          <div className="pr-net-row">
            <span>
              Culvert A <b>stressed</b>
            </span>
            <span>
              Pump station <b>modelled</b>
            </span>
            <span>
              Sea outfall <b>connected</b>
            </span>
          </div>
        </div>
      )}
      {type === "flood" && (
        <div className="pr-viz-map">
          <span className="pr-map-water water-a" />
          <span className="pr-map-water water-b" />
          <span className="pr-map-road road-a" />
          <span className="pr-map-road road-b" />
          <span className="pr-map-road road-c" />
          <i className="pr-map-pin pin-a" />
          <i className="pr-map-pin pin-b" />
          <small>SCENARIO FLOOD EXTENT</small>
        </div>
      )}
      {type === "traffic" && (
        <div className="pr-viz-road-list">
          <div>
            <span className="road-status clear" />
            Marine Drive <b>32 km/h</b>
            <small>OPEN</small>
          </div>
          <div>
            <span className="road-status slow" />
            Maharshi Karve Rd <b>12 km/h</b>
            <small>HEAVY</small>
          </div>
          <div>
            <span className="road-status closed" />
            Princess Street <b>—</b>
            <small>SCENARIO CLOSURE</small>
          </div>
        </div>
      )}
      {type === "route" && (
        <div className="pr-viz-route">
          <div className="pr-route-map">
            <span className="route-grid r1" />
            <span className="route-grid r2" />
            <span className="route-path primary" />
            <span className="route-path alternate" />
            <i className="route-origin" />
            <i className="route-dest" />
            <i className="route-car">
              <Route size={13} />
            </i>
          </div>
          <div className="pr-route-times">
            <span>
              <small>PRIMARY</small>
              <b>12 min</b>
              <em>Scenario estimate</em>
            </span>
            <span>
              <small>COASTAL BYPASS</small>
              <b>8 min</b>
              <em>Alternative route</em>
            </span>
          </div>
        </div>
      )}
      {type === "cascade" && (
        <div className="pr-viz-chain">
          <span>Rainfall</span>
          <i />
          <span>Drainage</span>
          <i />
          <span>Road access</span>
          <i />
          <span>EMS route</span>
        </div>
      )}
      {type === "compare" && (
        <div className="pr-viz-compare">
          <div className="pr-compare-chart">
            <i style={{ height: "88%" }} />
            <i style={{ height: "72%" }} />
            <i style={{ height: "61%" }} />
            <i style={{ height: "45%" }} />
            <i style={{ height: "37%" }} />
            <i style={{ height: "24%" }} />
          </div>
          <div className="pr-compare-labels">
            <span>BASELINE SCENARIO</span>
            <span>MITIGATION SCENARIO</span>
          </div>
          <small>Illustrative comparison · assumptions shown in workspace</small>
        </div>
      )}
    </div>
  );
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    const host = root.current;
    const cv = canvas.current;
    if (!host || !cv) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];

    void (async () => {
      const [{ gsap }, { ScrollTrigger }, { SplitText }, { PravaahLandingScene }] =
        await Promise.all([
          import("gsap"),
          import("gsap/ScrollTrigger"),
          import("gsap/SplitText"),
          import("./scene"),
        ]);
      if (disposed) return;
      gsap.registerPlugin(ScrollTrigger, SplitText);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let scene: InstanceType<typeof PravaahLandingScene> | null = null;
      try {
        scene = new PravaahLandingScene(cv);
        cleanups.push(() => scene?.dispose());
      } catch {
        setSceneFailed(true);
        host.classList.add("pr-no-webgl");
      }
      const onResize = () => scene?.resize();
      window.addEventListener("resize", onResize);
      cleanups.push(() => window.removeEventListener("resize", onResize));
      scene?.setProgress(reduced ? 0.9 : 0);

      let lenis: Lenis | null = null;
      let lenisTick: ((time: number) => void) | null = null;
      if (!reduced) {
        const LenisModule = await import("lenis");
        if (disposed) return;
        const Lenis = LenisModule.default;
        const instance = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
        lenis = instance;
        instance.on("scroll", ScrollTrigger.update);
        lenisTick = (time: number) => lenis?.raf(time * 1000);
        gsap.ticker.add(lenisTick);
        gsap.ticker.lagSmoothing(0);
        host.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
          const onClick = (event: MouseEvent) => {
            const href = anchor.getAttribute("href");
            if (!href || href === "#") return;
            event.preventDefault();
            lenis?.scrollTo(href, { duration: 1.45, offset: -4 });
          };
          anchor.addEventListener("click", onClick);
          cleanups.push(() => anchor.removeEventListener("click", onClick));
        });
      }

      const ctx = gsap.context(() => {
        gsap.to(".pr-page-progress i", {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
        });
        ScrollTrigger.create({
          start: 100,
          end: "max",
          toggleClass: { targets: ".pr-nav", className: "is-solid" },
        });
        const heroSplit = new SplitText(".pr-hero-title", { type: "lines,words", mask: "lines" });
        gsap.from(heroSplit.words, {
          yPercent: 115,
          duration: 1,
          ease: "expo.out",
          stagger: 0.035,
          delay: 0.22,
        });
        gsap.from(".pr-hero-fade", {
          y: 20,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.08,
          delay: 0.55,
        });

        if (reduced) {
          host.classList.add("pr-static");
          setReady(true);
          return;
        }

        const dive = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: ".pr-dive",
            start: "top top",
            end: "+=500%",
            pin: true,
            scrub: 1.05,
            onUpdate: (trigger) => scene?.setProgress(trigger.progress),
            onToggle: (trigger) => (trigger.isActive ? scene?.start() : scene?.stop()),
          },
        });
        dive
          .to(".pr-hero-content", { opacity: 0, y: -48, duration: 0.1 }, 0.035)
          .to(".pr-scroll-cue", { opacity: 0, duration: 0.03 }, 0.02);
        const diveMoments = [0.13, 0.34, 0.56];
        diveMoments.forEach((at, index) => {
          dive
            .fromTo(
              `.pr-dive-note-${index}`,
              { opacity: 0, y: 42 },
              { opacity: 1, y: 0, duration: 0.05 },
              at,
            )
            .to(`.pr-dive-note-${index}`, { opacity: 0, y: -38, duration: 0.05 }, at + 0.16);
        });
        dive
          .fromTo(
            ".pr-route-note",
            { opacity: 0, y: 36 },
            { opacity: 1, y: 0, duration: 0.06 },
            0.73,
          )
          .to(".pr-route-note", { opacity: 0, y: -30, duration: 0.04 }, 0.87)
          .fromTo(
            ".pr-dive-punch",
            { opacity: 0, scale: 0.95 },
            { opacity: 1, scale: 1, duration: 0.07 },
            0.89,
          )
          .to({}, { duration: 0.02 }, 0.99);

        const landChange = gsap.timeline({
          scrollTrigger: {
            trigger: ".pr-change",
            start: "top top",
            end: "+=170%",
            pin: true,
            scrub: 0.8,
          },
        });
        landChange
          .fromTo(
            ".pr-change-after",
            { clipPath: "inset(0 0 0 100%)" },
            { clipPath: "inset(0 0 0 0%)", duration: 1 },
            0.08,
          )
          .fromTo(".pr-change-wipe", { left: "100%" }, { left: "0%", duration: 1 }, 0.08)
          .to(".pr-change-year-old", { yPercent: -100, duration: 0.32 }, 0.57)
          .to(".pr-change-year-new", { yPercent: -100, duration: 0.32 }, 0.57)
          .fromTo(
            ".pr-change-copy p",
            { opacity: 0.26, y: 12 },
            { opacity: 1, y: 0, stagger: 0.15, duration: 0.35 },
            0.05,
          );

        const horizon = gsap.timeline({
          scrollTrigger: {
            trigger: ".pr-horizon",
            start: "top top",
            end: "+=150%",
            pin: true,
            scrub: 0.8,
            onUpdate: (trigger) => {
              host.style.setProperty("--pr-horizon-progress", String(trigger.progress));
              const index = Math.min(4, Math.floor(trigger.progress * 5));
              host
                .querySelectorAll(".pr-horizon-step")
                .forEach((step, i) => step.classList.toggle("is-current", i === index));
            },
          },
        });
        horizon
          .fromTo(".pr-horizon-water", { height: "3%" }, { height: "78%", duration: 1 }, 0.05)
          .fromTo(".pr-horizon-route", { width: "0%" }, { width: "68%", duration: 1 }, 0.08)
          .fromTo(
            ".pr-horizon-readout",
            { opacity: 0.35, y: 15 },
            { opacity: 1, y: 0, stagger: 0.13, duration: 0.35 },
            0.06,
          );

        const media = gsap.matchMedia();
        media.add("(min-width: 900px)", () => {
          const track = host.querySelector<HTMLElement>(".pr-feature-track");
          if (!track) return;
          const distance = () =>
            Math.max(0, track.scrollWidth - window.innerWidth + window.innerWidth * 0.06);
          const move = gsap.to(track, {
            x: () => -distance(),
            ease: "none",
            scrollTrigger: {
              trigger: ".pr-features",
              start: "top top",
              end: () => `+=${distance()}`,
              pin: true,
              scrub: 1,
              invalidateOnRefresh: true,
              onUpdate: (trigger) => {
                host.style.setProperty("--pr-feature-progress", String(trigger.progress));
                const index = Math.min(
                  FEATURES.length - 1,
                  Math.floor(trigger.progress * FEATURES.length),
                );
                setActiveFeature(index);
                host
                  .querySelectorAll(".pr-method-steps li")
                  .forEach((step, i) => step.classList.toggle("is-on", i === index));
              },
            },
          });
          host.querySelectorAll<HTMLElement>(".pr-feature-panel").forEach((panel) => {
            ScrollTrigger.create({
              trigger: panel,
              containerAnimation: move,
              start: "left 70%",
              end: "right 30%",
              toggleClass: "is-active",
            });
            gsap.from(panel.querySelectorAll(".pr-feature-copy > *"), {
              y: 36,
              opacity: 0,
              stagger: 0.05,
              ease: "power3.out",
              scrollTrigger: {
                trigger: panel,
                containerAnimation: move,
                start: "left 87%",
                end: "left 45%",
                scrub: true,
              },
            });
          });
          return () => move.scrollTrigger?.kill();
        });
        media.add("(max-width: 899px)", () => {
          host.querySelectorAll<HTMLElement>(".pr-feature-panel").forEach((panel, index) => {
            ScrollTrigger.create({
              trigger: panel,
              start: "top 75%",
              end: "bottom 25%",
              toggleClass: "is-active",
              onToggle: (trigger) => {
                if (trigger.isActive) setActiveFeature(index);
              },
            });
          });
        });
        ScrollTrigger.batch(".pr-module-card", {
          start: "top 88%",
          once: true,
          onEnter: (cards) =>
            gsap.from(cards, {
              y: 54,
              opacity: 0,
              rotateX: -8,
              duration: 0.85,
              ease: "expo.out",
              stagger: 0.08,
            }),
        });
        host.querySelectorAll<HTMLElement>(".pr-section-title").forEach((title) => {
          const split = new SplitText(title, { type: "lines,words", mask: "lines" });
          gsap.from(split.words, {
            yPercent: 105,
            duration: 0.85,
            ease: "expo.out",
            stagger: 0.025,
            scrollTrigger: { trigger: title, start: "top 82%" },
          });
        });
        gsap.from(".pr-footer-note", {
          opacity: 0,
          y: 20,
          duration: 0.8,
          scrollTrigger: { trigger: ".pr-footer", start: "top 85%" },
        });
        cleanups.push(() => media.revert());
      }, host);

      cleanups.push(() => ctx.revert());
      if (lenis && lenisTick)
        cleanups.push(() => {
          gsap.ticker.remove(lenisTick!);
          lenis?.destroy();
        });
      window.setTimeout(() => {
        if (!disposed) setReady(true);
        ScrollTrigger.refresh();
      }, 350);
    })();

    return () => {
      disposed = true;
      cleanups.reverse().forEach((cleanup) => cleanup());
    };
  }, []);

  const tilt = (event: React.PointerEvent<HTMLAnchorElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--rx", `${-y * 5}deg`);
    event.currentTarget.style.setProperty("--ry", `${x * 6}deg`);
    event.currentTarget.style.setProperty("--mx", `${(x + 0.5) * 100}%`);
    event.currentTarget.style.setProperty("--my", `${(y + 0.5) * 100}%`);
  };
  const resetTilt = (event: React.PointerEvent<HTMLAnchorElement>) => {
    event.currentTarget.style.setProperty("--rx", "0deg");
    event.currentTarget.style.setProperty("--ry", "0deg");
  };

  return (
    <main className="pr-story" ref={root}>
      <div className={`pr-curtain ${ready ? "is-gone" : ""}`} aria-hidden="true">
        <span className="pr-brand-glyph">
          <Waves size={27} />
        </span>
        <b>PRAVAAH</b>
        <small>URBAN RESILIENCE INTELLIGENCE</small>
      </div>
      <div className="pr-page-progress" aria-hidden="true">
        <i />
      </div>
      <nav className="pr-nav" aria-label="PRAVAAH landing page">
        <a className="pr-brand" href="#top">
          <span className="pr-brand-glyph">
            <Waves size={19} />
          </span>
          <span>
            <b>PRAVAAH</b>
            <small>URBAN RESILIENCE INTELLIGENCE</small>
          </span>
        </a>
        <div className="pr-nav-links">
          <a href="#dive">The city</a>
          <a href="#change">Land change</a>
          <a href="#features">Capabilities</a>
          <a href="#sources">Data & evidence</a>
        </div>
        <Link className="pr-nav-cta" to="/dashboard">
          Open Dashboards <ArrowUpRight size={15} />
        </Link>
      </nav>
      <div className="pr-jump-rail" aria-label="Page sections">
        <a href="#dive">City</a>
        <a href="#change">Change</a>
        <a href="#horizon">0–72h</a>
        <a href="#features">Features</a>
        <a href="#platform">Platform</a>
        <a className="pr-jump-cta" href="#launch">
          Launch ↗
        </a>
      </div>

      <section className="pr-dive" id="top">
        <span className="pr-anchor" id="dive" />
        <canvas
          ref={canvas}
          className="pr-scene-canvas"
          aria-label="Animated map showing India, Maharashtra, then the Marine Lines road network in Mumbai"
        />
        <div className="pr-scene-fallback" aria-hidden="true">
          <div className="pr-fallback-india">
            <span>INDIA</span>
            <i className="pin pulse" />
            <b>MUMBAI</b>
          </div>
        </div>
        {sceneFailed && (
          <span className="pr-map-status">Interactive map unavailable · showing route story</span>
        )}
        <div className="pr-vignette" aria-hidden="true" />
        <div className="pr-grain" aria-hidden="true" />
        <header className="pr-hero-content">
          <span className="pr-kicker pr-hero-fade">
            <i /> URBAN RESILIENCE · MUMBAI
          </span>
          <h1 className="pr-hero-title">
            See the city.
            <br />
            <em>Understand the cascade.</em>
          </h1>
          <p className="pr-hero-fade">
            A disruption never stays in one place. Trace the path from rainfall to drainage, road
            access and emergency response — across one connected city system.
          </p>
          <div className="pr-hero-actions pr-hero-fade">
            <Link
              to="/gis-explorer-3d"
              search={{ state: undefined, layer: undefined }}
              className="pr-button pr-button-primary"
            >
              Explore the Digital Twin <ArrowRight size={16} />
            </Link>
            <a href="#features" className="pr-button pr-button-quiet">
              See how it works
            </a>
          </div>
          <span className="pr-hero-proof pr-hero-fade">
            <Shield size={14} /> Modelled scenario outputs are identified as such.
          </span>
        </header>
        <div className="pr-scroll-cue">
          <span>SCROLL TO DIVE</span>
          <ArrowDown size={16} />
        </div>
        <aside className="pr-dive-note pr-dive-note-0">
          <span className="pr-kicker">01 · INDIA</span>
          <p>
            One country.
            <br />
            <em>Interconnected systems.</em>
          </p>
          <small>
            Start at the national scale, then follow the geography into the demonstration area.
          </small>
        </aside>
        <aside className="pr-dive-note pr-dive-note-1 right">
          <span className="pr-kicker">02 · MAHARASHTRA</span>
          <p>
            Zoom into the
            <br />
            <em>western coast.</em>
          </p>
          <small>
            The state boundary is geographic context. The impacts shown later are scenario content.
          </small>
        </aside>
        <aside className="pr-dive-note pr-dive-note-2">
          <span className="pr-kicker">03 · MUMBAI</span>
          <p>
            Marine Lines.
            <br />
            <em>Roads meet the coast.</em>
          </p>
          <small>South Mumbai demonstration corridor · source-labelled map geometry.</small>
        </aside>
        <aside className="pr-route-note">
          <span className="pr-kicker">04 · RESPONSE ROUTE · SCENARIO</span>
          <p>
            When roads change,
            <br />
            <em>the route must too.</em>
          </p>
          <div className="pr-route-legend">
            <span>
              <i className="legend-origin" /> Cross Maidan · origin
            </span>
            <span>
              <i className="legend-destination" /> Saifee Hospital · destination
            </span>
          </div>
          <small>Ambulance path and flood overlays are modelled demo geometry.</small>
        </aside>
        <div className="pr-dive-punch">
          <p>
            Rainfall becomes road pressure.
            <br />
            <em>Road pressure changes who can reach help.</em>
          </p>
          <span>SCROLL TO TRACE THE CASCADE ↓</span>
        </div>
        <div className="pr-map-credits">
          India state outlines · bundled geographic data <span>·</span> City roads · PRAVAAH
          scenario geometry
        </div>
        <div className="pr-dive-progress">
          <span>INDIA</span>
          <i />
          <span>MAHARASHTRA</span>
          <i />
          <span>MARINE LINES</span>
        </div>
      </section>

      <section className="pr-change" id="change">
        <div className="pr-change-media">
          <img
            className="pr-change-before"
            src={change2020}
            alt="Illustrative land-cover image for the 2020 comparison"
          />
          <div className="pr-change-after">
            <img src={change2024} alt="Illustrative land-cover image for the 2024 comparison" />
          </div>
          <div className="pr-change-wipe" aria-hidden="true" />
          <span className="pr-change-side old">2020</span>
          <span className="pr-change-side new">2024</span>
          <div className="pr-change-years">
            <span className="pr-change-year-old">2020</span>
            <span className="pr-change-year-new">2024</span>
          </div>
          <span className="pr-change-credit">
            Illustrative land-cover comparison · sample images in project assets
          </span>
        </div>
        <div className="pr-change-copy">
          <span className="pr-kicker dark">A CITY THAT KEEPS CHANGING</span>
          <h2 className="pr-section-title">Four years. A different surface. A different risk.</h2>
          <p>Land cover and built form shape how rainfall moves through a neighbourhood.</p>
          <p>
            Compare 2020 and 2024 imagery as context for the changing city — then inspect current
            scenario layers around Marine Lines.
          </p>
          <p>
            <b>
              Historical images are illustrative examples, not a measured Mumbai land-change
              analysis.
            </b>
          </p>
        </div>
      </section>

      <section className="pr-horizon" id="horizon">
        <div className="pr-horizon-head">
          <span className="pr-kicker dark">SCENARIO HORIZON · ILLUSTRATIVE</span>
          <h2 className="pr-section-title">
            From <em>0 hours</em> to <em>72 hours.</em>
          </h2>
          <p>
            A planning window for exploring how conditions could evolve. This is a synthetic
            scenario timeline, not a weather forecast.
          </p>
        </div>
        <div className="pr-horizon-stage">
          <div className="pr-horizon-water" />
          <div className="pr-horizon-grid" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="pr-horizon-overlay">
            <span className="pr-horizon-chip">
              <i /> SYNTHETIC SCENARIO
            </span>
            <div className="pr-horizon-road">
              <span className="pr-horizon-route" />
              <i className="pr-horizon-origin" />
              <i className="pr-horizon-hospital">
                <Shield size={16} />
              </i>
              <i className="pr-horizon-vehicle">
                <Route size={14} />
              </i>
            </div>
            <div className="pr-horizon-readout">
              <span>
                NETWORK STATUS <b>SCENARIO MODEL</b>
              </span>
              <span>
                ROUTE ACCESS <b>REASSESSING</b>
              </span>
              <span>
                DATA CLASS <b>ILLUSTRATIVE</b>
              </span>
            </div>
          </div>
        </div>
        <div className="pr-horizon-steps">
          {HORIZON.map((item, index) => (
            <div className={`pr-horizon-step ${index === 0 ? "is-current" : ""}`} key={item.hour}>
              <span>{item.hour}</span>
              <b>{item.title}</b>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
        <div className="pr-horizon-foot">
          <span>0h · BASELINE</span>
          <i />
          <span>72h · PLANNING HORIZON</span>
        </div>
      </section>

      <section className="pr-features" id="features">
        <header className="pr-method-head">
          <span className="pr-kicker dark">THE OPERATIONAL METHOD</span>
          <h2 className="pr-section-title">
            Seven moves from signal
            <br />
            to <em>response.</em>
          </h2>
          <ol className="pr-method-steps">
            {FEATURES.map((feature, index) => (
              <li className={index === activeFeature ? "is-on" : ""} key={feature.verb}>
                <span>0{index + 1}</span>
                {feature.verb}
              </li>
            ))}
          </ol>
          <div className="pr-method-progress">
            <i />
          </div>
        </header>
        <div className="pr-feature-track">
          {FEATURES.map(({ verb, title, body, Icon, visual, tag }, index) => (
            <article className={`pr-feature-panel ${index === 0 ? "is-active" : ""}`} key={verb}>
              <div className="pr-feature-copy">
                <span className="pr-feature-number">0{index + 1}</span>
                <span className="pr-kicker dark">{verb.toUpperCase()}</span>
                <h3>{title}</h3>
                <p>{body}</p>
                <Link
                  to="/gis-explorer-3d"
                  search={{ state: undefined, layer: undefined }}
                  className="pr-inline-link"
                >
                  Open in the Digital Twin <ArrowUpRight size={14} />
                </Link>
              </div>
              <div className="pr-feature-demo">
                <div className="pr-feature-demo-top">
                  <span>
                    <Icon size={15} /> {tag}
                  </span>
                  <i>MARINE LINES</i>
                </div>
                <FeatureVisual type={visual} />
                <small className="pr-demo-disclaimer">
                  Demo interface · source and model status shown in product
                </small>
              </div>
            </article>
          ))}
        </div>
        <div className="pr-feature-mobile-progress" aria-live="polite">
          0{activeFeature + 1} / 07 <span>{FEATURES[activeFeature]?.verb}</span>
        </div>
      </section>

      <section className="pr-platform" id="platform">
        <div className="pr-section-head">
          <span className="pr-kicker">THE DIGITAL TWIN</span>
          <h2 className="pr-section-title">
            A connected view of
            <br />
            <em>urban resilience.</em>
          </h2>
          <p>Move from a city-wide picture into the systems that determine access and response.</p>
        </div>
        <div className="pr-module-grid">
          {MODULES.map(({ href, name, tag, text, size, Icon }) => (
            <Link
              to={href}
              search={{ state: undefined, layer: undefined }}
              className={`pr-module-card ${size}`}
              key={name}
              onPointerMove={tilt}
              onPointerLeave={resetTilt}
            >
              <span className="pr-module-glow" />
              <span className="pr-module-tag">{tag}</span>
              <span className="pr-module-icon">
                <Icon size={20} />
              </span>
              <span className="pr-module-copy">
                <b>{name}</b>
                <small>{text}</small>
              </span>
              <span className="pr-module-go">
                <ArrowUpRight size={17} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="pr-evidence" id="sources">
        <div className="pr-section-head">
          <span className="pr-kicker dark">THE EVIDENCE LEDGER</span>
          <h2 className="pr-section-title">
            Observed, modelled,
            <br />
            <em>and clearly labelled.</em>
          </h2>
        </div>
        <div className="pr-evidence-grid">
          <article className="pr-evidence-col observed">
            <span className="pr-evidence-stamp">SOURCE-BACKED</span>
            <h3>Observed context</h3>
            <ul>
              <li>OpenStreetMap roads and place context</li>
              <li>TomTom traffic and routing when configured</li>
              <li>Weather and imagery source status in the workspace</li>
              <li>Source attribution travels with each layer</li>
            </ul>
          </article>
          <article className="pr-evidence-col modelled">
            <span className="pr-evidence-stamp">MODELLED</span>
            <h3>Scenario outputs</h3>
            <ul>
              <li>Rainfall-to-drainage calculations</li>
              <li>Flood exposure and road access changes</li>
              <li>Ambulance travel path and delay assumptions</li>
              <li>Illustrative 0–72 hour planning horizon</li>
            </ul>
          </article>
          <article className="pr-evidence-col gap">
            <span className="pr-evidence-stamp">TO VALIDATE</span>
            <h3>What needs stronger evidence</h3>
            <ul>
              <li>Local drainage capacities and calibration</li>
              <li>Measured flood-depth observations</li>
              <li>Validated city-scale travel-time forecasts</li>
              <li>Graph relationships with field evidence</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="pr-launch" id="launch">
        <div className="pr-launch-art" aria-hidden="true">
          <div className="pr-launch-orbit orbit-one" />
          <div className="pr-launch-orbit orbit-two" />
          <span>
            <Waves size={29} />
          </span>
          <small>RAIN · ROADS · RESPONSE</small>
        </div>
        <div className="pr-launch-copy">
          <span className="pr-kicker">
            <i /> MARINE LINES · MUMBAI
          </span>
          <h2 className="pr-section-title">
            Bring the whole
            <br />
            picture <em>into focus.</em>
          </h2>
          <p>
            Inspect the 3D map, change rainfall assumptions and follow how the scenario moves
            through roads and emergency access.
          </p>
          <Link
            to="/gis-explorer-3d"
            search={{ state: undefined, layer: undefined }}
            className="pr-button pr-button-primary"
          >
            Launch Command Center <ArrowRight size={16} />
          </Link>
          <small>Modelled demo scenario · not for live emergency dispatch.</small>
        </div>
      </section>

      <footer className="pr-footer">
        <a className="pr-brand" href="#top">
          <span className="pr-brand-glyph">
            <Waves size={19} />
          </span>
          <span>
            <b>PRAVAAH</b>
            <small>See the city. Understand the cascade.</small>
          </span>
        </a>
        <nav aria-label="Footer navigation">
          <a href="#dive">The city</a>
          <a href="#features">Seven capabilities</a>
          <a href="#platform">Digital Twin</a>
          <a href="#sources">Evidence ledger</a>
          <Link to="/dashboard">Operational Dashboards</Link>
          <Link to="/gis-explorer-3d" search={{ state: undefined, layer: undefined }}>
            GIS Explorer
          </Link>
        </nav>
        <p className="pr-footer-note">
          Urban resilience prototype for Mumbai. Scenario outputs are synthetic or modelled unless a
          source is explicitly identified. Not an official warning or emergency dispatch system.
        </p>
      </footer>
    </main>
  );
}
