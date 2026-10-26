import { Building2, Layers3 } from "lucide-react";
import type { DemoBuilding } from "./demoBuilding";

interface Props {
  record: DemoBuilding;
  open: boolean;
  /** Explosion factor, 0..1. */
  explosion: number;
  selected: number | null;
  onOpen: (open: boolean) => void;
  onExplosion: (value: number) => void;
  onSelect: (floorIndex: number | null) => void;
  onLocate: () => void;
}

const STOP_LABELS = [0, 25, 50, 75, 100];

/**
 * Demo-only vertical cadastre controls. The block only ever renders where
 * `isInsideDemoArea()` allowed it, and every number it shows is labelled as a
 * model value from the fixture - never a surveyed height or a registered unit.
 */
export function GisFloorStack({
  record,
  open,
  explosion,
  selected,
  onOpen,
  onExplosion,
  onSelect,
  onLocate,
}: Props) {
  const percent = Math.round(explosion * 100);
  const active = selected === null ? null : record.levels.find((l) => l.floorIndex === selected);

  return (
    <section className="g3d-floorcard" aria-label="Vertical floor stack">
      <header className="g3d-floorhead">
        <span className="g3d-flooricon">
          <Building2 />
        </span>
        <span>
          <b>{record.name}</b>
          <small>
            {record.address} · {record.district}, {record.state}
          </small>
        </span>
        <span className="g3d-pill demo">DEMO</span>
      </header>

      <dl className="g3d-floormeta">
        <div>
          <dt>Total height</dt>
          <dd>{record.totalHeightM.toFixed(1)} m (model)</dd>
        </div>
        <div>
          <dt>Floors above grade</dt>
          <dd>{record.aboveGradeFloors}</dd>
        </div>
        <div>
          <dt>Levels drawn</dt>
          <dd>{record.levels.length} incl. basement + terrace</dd>
        </div>
      </dl>

      <p className="g3d-floornote">
        {record.evidence.processing} {record.evidence.confidence}
      </p>

      <div className="g3d-actions">
        <button type="button" onClick={() => onLocate()}>
          <Layers3 /> Locate
        </button>
        <button
          type="button"
          className={open ? "primary" : ""}
          aria-pressed={open}
          onClick={() => onOpen(!open)}
        >
          {open ? "Hide stack" : "Show floor stack"}
        </button>
      </div>

      {open && (
        <>
          <div className="g3d-floorslider">
            <label htmlFor="g3d-explosion">Floor explosion</label>
            <input
              id="g3d-explosion"
              type="range"
              min={0}
              max={100}
              step={5}
              value={percent}
              onChange={(event) => onExplosion(Number(event.target.value) / 100)}
            />
            <div className="g3d-floorticks" aria-hidden="true">
              {STOP_LABELS.map((tick) => (
                <span key={tick}>{tick}%</span>
              ))}
            </div>
          </div>

          <div className="g3d-floorpills" role="list" aria-label="Floor levels">
            {record.levels.map((level) => (
              <button
                key={level.floorIndex}
                type="button"
                role="listitem"
                className={`g3d-pill ${selected === level.floorIndex ? "on" : ""} ${
                  level.isBelowGrade ? "below" : ""
                }`}
                title={`${level.floorName} · base ${
                  level.elevationBaseM >= 0 ? "+" : ""
                }${level.elevationBaseM.toFixed(1)} m`}
                onClick={() => onSelect(selected === level.floorIndex ? null : level.floorIndex)}
              >
                {level.floorCode}
              </button>
            ))}
          </div>

          <p className="g3d-floorread">
            {active
              ? `${active.floorName}: slab base ${
                  active.elevationBaseM >= 0 ? "+" : ""
                }${active.elevationBaseM.toFixed(1)} m, ${active.floorHeightM.toFixed(
                  1,
                )} m thick${active.isBelowGrade ? ", below grade" : ""}`
              : "Select a level to isolate it · move the slider to separate the slabs."}
          </p>
        </>
      )}
    </section>
  );
}
