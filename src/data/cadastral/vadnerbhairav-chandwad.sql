CREATE TABLE IF NOT EXISTS parcels (
  id BIGSERIAL PRIMARY KEY,
  parcel_id TEXT NOT NULL,
  survey_number TEXT,
  village TEXT,
  taluka TEXT,
  district TEXT,
  state TEXT,
  source TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  geom GEOMETRY(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS parcels_geom_gix ON parcels USING GIST (geom);
CREATE INDEX IF NOT EXISTS parcels_village_idx ON parcels (village);
CREATE INDEX IF NOT EXISTS parcels_survey_idx ON parcels (survey_number);
-- Dataset: vadnerbhairav-chandwad | source: Maharashtra land records (BhuNaksha) plot outlines, via BhuMe bundle | features: 2457
-- Viewport query: SELECT parcel_id, survey_number, village, taluka, district, state, source,
--   ST_AsGeoJSON(geom)::json AS geometry FROM parcels
--   WHERE ST_Intersects(geom, ST_MakeEnvelope(:minLon,:minLat,:maxLon,:maxLat,4326));
