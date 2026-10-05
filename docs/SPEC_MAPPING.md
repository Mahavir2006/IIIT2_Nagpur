# Spec mapping

How the prototype's ten chapters map to the 17 chapter handover spec and the USP catalogue.

| Prototype chapter | Spec chapters | USPs shown | Where in code |
|---|---|---|---|
| 1 Valley | 1 | 2 | `chValley`, `buildTerrain` |
| 2 Observe | 2, 3 | 1, 3, 4 | `chObserve`, `obsArea`, lake mesh |
| 3 Risk | 4, 5, 6 | 5, 6, 22 | `chRisk`, `riskModel` |
| 4 Scenarios | 7, 8 | 8, 11 | `chScen`, `runMC`, `runScenarioSurrogate` |
| 5 Breach | 9 | 9 | `chBreach`, `lakeStep`, `sphStep` |
| 6 Propagate | 10 | 9, 10, 23 | `chProp`, `inject`, `sweStep` |
| 7 Impact | 11 | 13, 16 | `chImpact`, `ASSETS`, `ROADS` |
| 8 Evacuate | 12 | 13, 14, 15, 16 | `chEvac`, `evacPlan`, `policies` |
| 9 Validate | 13 | 10, 12, 24 | `chValidate`, `runCalib` |
| 10 Warn | 14 | 17 | `chWarn`, `capData` |
| Always on | 15 | 18 | 3D scene, map layers, time and peak envelope |
| 11 Whole Ganga basin | 10, 11 | 9, 10, 23 | `chapter 11` in `basinUI.js`, `BasinCore.runRouting`, `src/basin/` (see `docs/ARCHITECTURE.md`) |

## Not in this prototype yet

Spec chapter 16 (national dam atlas and EAP), chapter 17 (offline and sovereign mode), USP 7 (cascading dams), live Earth Engine ingestion, InSAR processing, and a trained XGBoost or PINN model.
