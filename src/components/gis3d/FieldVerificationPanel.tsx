/**
 * FIELD VERIFICATION (spec §24).
 *
 * A parcel on a screen is a hypothesis. This panel turns one into a task a
 * human can go and check: a fixed checklist covering condition, access,
 * boundary, current use, ownership and restrictions, plus evidence slots.
 *
 * Honesty notes encoded here:
 *  - "Add GPS" reads the device's real location through the browser API and
 *    records the coordinates it actually returned. If permission is denied it
 *    says so — nothing is fabricated.
 *  - "Add photograph" records the file name of a photo the user picked. It is
 *    never uploaded anywhere and never described as analysed.
 *  - The task status starts as PENDING FIELD VERIFICATION. Nothing in this
 *    feature can mark a parcel as verified from a desk.
 */

import { useState } from "react";
import { Camera, Crosshair, StickyNote, X } from "lucide-react";
import type { FieldVerification } from "@/services/gis3d/landPotentialTypes";

const CHECKS: { id: string; label: string }[] = [
  { id: "condition", label: "Current land condition" },
  { id: "access", label: "Actual access" },
  { id: "boundary", label: "Boundary" },
  { id: "current-use", label: "Current use" },
  { id: "ownership", label: "Ownership / status" },
  { id: "environment", label: "Environmental restrictions" },
  { id: "infrastructure", label: "Local infrastructure" },
];

interface Props {
  parcelId: string;
  tasks: FieldVerification[];
  onClose: () => void;
  onCreate: (task: FieldVerification) => void;
}

let seq = 0;

export function FieldVerificationPanel({ parcelId, tasks, onClose, onCreate }: Props) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [evidence, setEvidence] = useState<FieldVerification["evidence"]>([]);
  const [gpsState, setGpsState] = useState<string | null>(null);
  const mine = tasks.filter((t) => t.parcelId === parcelId);

  const addEvidence = (kind: "photo" | "gps" | "note", label: string) =>
    setEvidence((prev) => [...prev, { id: `ev-${++seq}`, kind, label }]);

  const addGps = () => {
    if (!("geolocation" in navigator)) {
      setGpsState("This browser exposes no location API — no coordinates recorded.");
      return;
    }
    setGpsState("Reading device location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        addEvidence(
          "gps",
          `GPS ${latitude.toFixed(5)}, ${longitude.toFixed(5)} ±${Math.round(accuracy)} m`,
        );
        setGpsState("Coordinates recorded from the device.");
      },
      (err) => {
        setGpsState(`Location unavailable (${err.message}) — no coordinates recorded.`);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const create = () => {
    const task: FieldVerification = {
      id: `fv-${++seq}`,
      parcelId,
      createdAt: new Date().toISOString(),
      checks: CHECKS.map((c) => ({ ...c, done: !!done[c.id] })),
      notes: notes.trim(),
      evidence,
      status: "pending",
    };
    onCreate(task);
    onClose();
  };

  return (
    <div
      className="g3d-modal-back"
      role="dialog"
      aria-modal="true"
      aria-label="Field verification"
      onClick={onClose}
    >
      <div className="g3d-modal g3d-lp-fv" onClick={(e) => e.stopPropagation()}>
        <div className="g3d-modal-head">
          <h3>FIELD VERIFICATION</h3>
          <span className="g3d-badge scenario" style={{ marginLeft: "auto" }}>
            Pending field verification
          </span>
        </div>
        <div className="g3d-modal-body">
          <div className="g3d-stat">
            <span>Parcel</span>
            <b>{parcelId}</b>
          </div>

          <h4>Verify on site</h4>
          <ul className="g3d-lp-checks">
            {CHECKS.map((c) => (
              <li key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!done[c.id]}
                    onChange={(e) => setDone((d) => ({ ...d, [c.id]: e.target.checked }))}
                  />
                  <span>{c.label}</span>
                </label>
              </li>
            ))}
          </ul>

          <h4>Evidence</h4>
          <div className="g3d-actions">
            <label className="g3d-lp-fv-btn">
              <Camera /> Add photograph
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) addEvidence("photo", `Photograph: ${f.name} (stored on this device only)`);
                  e.target.value = "";
                }}
              />
            </label>
            <button type="button" onClick={addGps}>
              <Crosshair /> Add GPS
            </button>
            <button
              type="button"
              onClick={() => {
                const line = notes.trim().split("\n").filter(Boolean).pop();
                if (line) addEvidence("note", `Note: ${line}`);
              }}
            >
              <StickyNote /> Add note
            </button>
          </div>
          {gpsState && <p className="g3d-hint">{gpsState}</p>}

          {evidence.length > 0 && (
            <ul className="g3d-lp-list pos">
              {evidence.map((e) => (
                <li key={e.id}>{e.label}</li>
              ))}
            </ul>
          )}

          <h4>Notes</h4>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What should the field team look for?"
            aria-label="Verification notes"
          />

          <p className="g3d-lp-disclaimer">
            A field task records what still needs checking. It never marks land as verified,
            available or approved from the desk.
          </p>

          {mine.length > 0 && (
            <p className="g3d-hint">
              {mine.length} open task{mine.length === 1 ? "" : "s"} already exist for this parcel.
            </p>
          )}

          <div className="g3d-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={create}>
              Create task
            </button>
          </div>
        </div>
        <button
          type="button"
          className="g3d-x"
          onClick={onClose}
          aria-label="Close"
          style={{ position: "absolute", top: 10, right: 10 }}
        >
          <X />
        </button>
      </div>
    </div>
  );
}
