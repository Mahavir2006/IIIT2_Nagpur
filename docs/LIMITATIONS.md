# What is real and what is illustrative

## Real computation
* Breach hydrograph from a weir equation on a notch that grows over time, with lake storage computed from the terrain.
* SPH near field and conservative handoff into a 2D shallow water solver. The mass balance error is about 1e-13 % in `npm test`.
* Flood arrival, depth, speed and hazard (depth times speed) on every cell.
* The rapid mode surrogate, the 40 member ensemble and the roughness calibration.

## Illustrative, and labelled as such in the UI
* **Terrain** is synthetic. It is shaped to the corridor's distances, bed slopes and gorge widths, but it is not a DEM.
* **Satellite series** in chapter 2 is synthetic.
* **Risk weights** in chapter 3 are hand set to show the SHAP style explanation. They are not a trained model.
* **Asset heights and populations** are indicative.
* **Lives saved policies** use a simple response time assumption. They are a decision aid, not a casualty forecast.

## Honest caveats for judges
* The browser SPH is a lightweight WCSPH. Production would use DualSPHysics on GPU.
* The downstream solver is our own 2D scheme, not Delft3D. Production connects Delft3D FM through an adapter with the same handoff contract.
* The 2021 hindcast shows that no single clear water roughness fits both observed front speeds, because the real flow was a debris flow. The prototype states this rather than tuning it away.
* Satellite IoU validation is deliberately left out until real terrain is used.

## Sources used in the copy
* Shugar et al., Science 373, 300 to 306 (2021): the volume of about 27 million m³, the front speeds of about 25 and 16 m/s, and the peak discharge range of 8,200 to 14,200 m³/s at Raini.
* GSI and PIB releases on the Chamoli event; the SIH26161 problem statement.

---

# Whole Ganga basin view (`src/basin/`, "Whole Ganga Map")

The close-up Rishiganga scene above is one continuous domain. The basin view is a
second, much larger scene that the flood routes into after it leaves that domain -
see `data/ganga/SOURCES.md` for full provenance and `docs/ARCHITECTURE.md` for how
the two scenes are wired together.

## Real computation
* **Terrain elevation** is real: SRTM 90m (CGIAR-CSI), fetched per grid cell from
  the Open Topo Data public API (`tools/prep_ganga/02_fetch_dem.py`). At this
  resolution (~20 km/cell over the whole basin) it resolves Himalaya-vs-plains-
  vs-delta relief, not individual valleys.
* **Coupling and routing**: the Muskingum-Cunge routing in `basinCore.js` derives
  wave celerity per reach, per timestep, from that reach's own Manning rating
  curve, and the local Rishiganga model's outlet hydrograph is averaged (not
  point-sampled) into each 300s routing step. Mass balance across the whole
  17-reach network holds to the same 1e-6 tolerance as the local model's ledger
  (`npm run test:basin`).
* **Town/structure coordinates** are accurate to roughly town-centre precision.

## Illustrative, and labelled as such in `data/ganga/SOURCES.md`
* **River paths between towns** are hand-digitized 2-5 point approximations
  anchored to real town/confluence coordinates, not a traced hydrography
  product (MERIT Hydro / HydroRIVERS / OSM) - an earlier draft of the sourcing
  doc incorrectly claimed that.
* **Channel rating curves** (`sections.json`) are synthesized from a Manning's
  equation approximation, not a surveyed cross-section.
* **CWC warning/danger levels and populations** are illustrative round numbers,
  not looked up from real CWC gauge records or Census/WorldPop data.
* **Baseflow presets** (lean season / monsoon) are illustrative, shaped to
  increase downstream and at confluences, not CWC/WRIS gauge data.
* **The Farakka Hooghly/Padma split** (30/70) is a fixed assumption loosely
  anchored to the lean-season treaty allocation, not a modelled barrage
  operating rule.
* **Scenario C (hypothetical Tehri Dam failure)** shows an on-screen
  "hypothetical, not an official safety assessment" badge for as long as it's
  selected - it uses Tehri's real height and storage figures with a generic
  Froehlich-style breach shape, not a dam-safety analysis.
