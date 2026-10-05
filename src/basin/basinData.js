/* DAM SYSTEM Basin Data Loader: loads and parses Ganga basin datasets (rivers, towns, structures,
   sections, baseflow, dem_basin) into typed arrays and fast spatial lookups. */
(function (root) {
  'use strict';

  const BasinData = {
    rivers: null,
    towns: null,
    structures: null,
    sections: null,
    baseflow: null,
    dem: null,
    isLoaded: false,

    load: function (rivers, towns, structures, sections, baseflow, dem) {
      this.rivers = rivers || (root.GANGA_DATA && root.GANGA_DATA.rivers);
      this.towns = towns || (root.GANGA_DATA && root.GANGA_DATA.towns);
      this.structures = structures || (root.GANGA_DATA && root.GANGA_DATA.structures);
      this.sections = sections || (root.GANGA_DATA && root.GANGA_DATA.sections);
      this.baseflow = baseflow || (root.GANGA_DATA && root.GANGA_DATA.baseflow);
      this.dem = dem || (root.GANGA_DATA && root.GANGA_DATA.dem);
      this.isLoaded = !!(this.rivers && this.towns && this.structures);
      return this.isLoaded;
    },

    // Lon/Lat to 3D World Transform helper for Basin Scale View
    // Bounding Box: 77.5°E to 89.5°E (width ~ 12°), 21.3°N to 31.5°N (height ~ 10.2°)
    // World coordinates scaled to [-180, 180] in X, [-150, 150] in Z
    lonToX: function (lon) {
      return ((lon - 77.5) / (89.5 - 77.5) - 0.5) * 360;
    },

    latToZ: function (lat) {
      return -((lat - 21.3) / (31.5 - 21.3) - 0.5) * 300;
    },

    elevationToY: function (e, ve) {
      ve = ve || 25;
      return (e / 5000) * ve * 15;
    },

    posV3: function (lon, lat, e, ve) {
      return new THREE.Vector3(this.lonToX(lon), this.elevationToY(e || 0, ve), this.latToZ(lat));
    }
  };

  root.BasinData = BasinData;

})(typeof window !== 'undefined' ? window : globalThis);
