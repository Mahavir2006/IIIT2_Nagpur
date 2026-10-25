// Development city: Haridwar–Rishikesh on the Ganga, downstream of Tehri dam and the Rishiganga
// reach the flood engine already models. Zone centres and populations are approximate (OSM /
// Census 2011 order of magnitude); exposure factors are judgement from terrain, not survey data.

import { withNeighbours, type CityConfig } from '../city';

export const HARIDWAR: CityConfig = withNeighbours({
  id: 'haridwar',
  name: 'Haridwar–Rishikesh',
  region: 'Uttarakhand',
  center: [78.17, 29.99],
  zoom: 10.6,
  river: 'Ganga',
  zones: [
    { id: 'hw-munikireti', name: 'Muni Ki Reti / Tapovan', center: [78.317, 30.128], population: 30000, lowLying: 0.35, riverExposure: 0.9, drainCapacity: 0.7, substationExposure: 0.4, neighbours: ['hw-rishikesh'] },
    { id: 'hw-rishikesh', name: 'Rishikesh town', center: [78.297, 30.103], population: 105000, lowLying: 0.45, riverExposure: 0.75, drainCapacity: 0.6, substationExposure: 0.45, neighbours: ['hw-munikireti', 'hw-raiwala'] },
    { id: 'hw-raiwala', name: 'Raiwala', center: [78.228, 30.024], population: 22000, lowLying: 0.5, riverExposure: 0.6, drainCapacity: 0.55, substationExposure: 0.35, neighbours: ['hw-rishikesh', 'hw-harkipauri', 'hw-shyampur'] },
    { id: 'hw-harkipauri', name: 'Har Ki Pauri / old city', center: [78.168, 29.957], population: 95000, lowLying: 0.65, riverExposure: 0.9, drainCapacity: 0.45, substationExposure: 0.6, neighbours: [] },
    { id: 'hw-shyampur', name: 'Chandi / Shyampur (east bank)', center: [78.196, 29.935], population: 18000, lowLying: 0.55, riverExposure: 0.8, drainCapacity: 0.5, substationExposure: 0.5, neighbours: [] },
    { id: 'hw-kankhal', name: 'Kankhal', center: [78.142, 29.925], population: 62000, lowLying: 0.6, riverExposure: 0.7, drainCapacity: 0.5, substationExposure: 0.55, neighbours: [] },
    { id: 'hw-jwalapur', name: 'Jwalapur', center: [78.108, 29.918], population: 140000, lowLying: 0.7, riverExposure: 0.35, drainCapacity: 0.4, substationExposure: 0.5, neighbours: [] },
    { id: 'hw-bhel', name: 'BHEL Ranipur', center: [78.082, 29.942], population: 70000, lowLying: 0.3, riverExposure: 0.1, drainCapacity: 0.8, substationExposure: 0.3, neighbours: [] },
    { id: 'hw-sidcul', name: 'SIDCUL industrial area', center: [78.050, 29.962], population: 42000, lowLying: 0.35, riverExposure: 0.05, drainCapacity: 0.65, substationExposure: 0.4, neighbours: [] },
    { id: 'hw-bahadrabad', name: 'Bahadrabad', center: [78.020, 29.925], population: 32000, lowLying: 0.55, riverExposure: 0.2, drainCapacity: 0.45, substationExposure: 0.45, neighbours: [] },
  ],
  hospitals: [
    { id: 'h-aiims-rk', name: 'AIIMS Rishikesh', zoneId: 'hw-rishikesh', beds: 960 },
    { id: 'h-harmilap', name: 'Harmilap District Hospital', zoneId: 'hw-harkipauri', beds: 200 },
    { id: 'h-bhel', name: 'BHEL Main Hospital', zoneId: 'hw-bhel', beds: 250 },
    { id: 'h-jwalapur-chc', name: 'Jwalapur community health centre', zoneId: 'hw-jwalapur', beds: 60 },
    { id: 'h-kankhal-chc', name: 'Kankhal community health centre', zoneId: 'hw-kankhal', beds: 50 },
  ],
  resources: { pumps: 6, generators: 4, ambulances: 8, surgeBeds: 120, crews: 5 },
  dataNote: 'Zone centres and populations are approximate; dependencies between systems are not given to the model.',
}, 6.5);
