// Held-out city: Nagpur, never used while tuning. Its flagship replay is modelled on the
// 23 Sept 2023 cloudburst, when about 100 mm fell in a few hours and Ambazari lake overflowed into
// the Nag river. Zone centres and populations are approximate; exposure factors are judgement.

import { withNeighbours, type CityConfig } from '../city';

export const NAGPUR: CityConfig = withNeighbours({
  id: 'nagpur',
  name: 'Nagpur',
  region: 'Maharashtra',
  center: [79.08, 21.14],
  zoom: 11.4,
  river: 'Nag',
  zones: [
    { id: 'ng-ambazari', name: 'Ambazari', center: [79.040, 21.130], population: 85000, lowLying: 0.7, riverExposure: 0.85, drainCapacity: 0.45, substationExposure: 0.55, neighbours: [] },
    { id: 'ng-dharampeth', name: 'Dharampeth', center: [79.062, 21.142], population: 150000, lowLying: 0.4, riverExposure: 0.5, drainCapacity: 0.65, substationExposure: 0.4, neighbours: [] },
    { id: 'ng-sitabuldi', name: 'Sitabuldi', center: [79.085, 21.145], population: 90000, lowLying: 0.5, riverExposure: 0.6, drainCapacity: 0.55, substationExposure: 0.5, neighbours: [] },
    { id: 'ng-pratapnagar', name: 'Pratap Nagar', center: [79.048, 21.112], population: 110000, lowLying: 0.45, riverExposure: 0.3, drainCapacity: 0.6, substationExposure: 0.4, neighbours: [] },
    { id: 'ng-mankapur', name: 'Mankapur', center: [79.075, 21.178], population: 70000, lowLying: 0.3, riverExposure: 0.1, drainCapacity: 0.7, substationExposure: 0.3, neighbours: [] },
    { id: 'ng-sadar', name: 'Sadar', center: [79.082, 21.163], population: 75000, lowLying: 0.35, riverExposure: 0.2, drainCapacity: 0.7, substationExposure: 0.35, neighbours: [] },
    { id: 'ng-itwari', name: 'Itwari', center: [79.112, 21.152], population: 130000, lowLying: 0.6, riverExposure: 0.7, drainCapacity: 0.4, substationExposure: 0.55, neighbours: [] },
    { id: 'ng-nandanvan', name: 'Nandanvan', center: [79.132, 21.135], population: 100000, lowLying: 0.55, riverExposure: 0.65, drainCapacity: 0.45, substationExposure: 0.5, neighbours: [] },
    { id: 'ng-manewada', name: 'Manewada', center: [79.110, 21.110], population: 120000, lowLying: 0.5, riverExposure: 0.4, drainCapacity: 0.5, substationExposure: 0.45, neighbours: [] },
    { id: 'ng-hingna', name: 'Hingna MIDC', center: [78.985, 21.108], population: 60000, lowLying: 0.3, riverExposure: 0.05, drainCapacity: 0.6, substationExposure: 0.4, neighbours: [] },
    { id: 'ng-pardi', name: 'Pardi', center: [79.160, 21.160], population: 70000, lowLying: 0.45, riverExposure: 0.45, drainCapacity: 0.5, substationExposure: 0.45, neighbours: [] },
  ],
  hospitals: [
    { id: 'h-gmc', name: 'Govt Medical College (GMC) Nagpur', zoneId: 'ng-manewada', beds: 1400 },
    { id: 'h-mayo', name: 'IGGMC (Mayo) Hospital', zoneId: 'ng-itwari', beds: 850 },
    { id: 'h-lmh', name: 'Lata Mangeshkar Hospital', zoneId: 'ng-hingna', beds: 500 },
    { id: 'h-dharampeth', name: 'Dharampeth private hospitals (aggregate)', zoneId: 'ng-dharampeth', beds: 400 },
    { id: 'h-sitabuldi', name: 'Sitabuldi private hospitals (aggregate)', zoneId: 'ng-sitabuldi', beds: 300 },
  ],
  resources: { pumps: 8, generators: 5, ambulances: 12, surgeBeds: 200, crews: 6 },
  dataNote: 'Held-out city: never used while tuning. Zone centres and populations are approximate.',
}, 4.2);
