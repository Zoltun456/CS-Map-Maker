export interface Theme {
  name: string;
  colors: string[];
  pitch: string;
  materials: string;
  props: string;
  layout: string;
  fit: string;
}
export const THEMES: Theme[] = [
  {
    name: 'Saltworks',
    colors: ['#f1ede4', '#c9c2b2', '#6f8f9a', '#2f5662', '#c2713c'],
    pitch:
      'A sea-salt refinery on a hot coast. White salt heaps, conveyor gantries and rusted pumping sheds.',
    materials: 'Whitewashed plaster, corrugated metal, salt-crusted concrete, sun-bleached wood.',
    props: 'Conveyors, sacks on pallets, pump housings, rowing boats.',
    layout: 'Site A is the evaporation pans under a long gantry; B is the bagging shed.',
    fit: 'Bright and readable, easy with stock Mirage and Inferno content.',
  },
  {
    name: 'Night market',
    colors: ['#141823', '#2a3346', '#e2475e', '#f2b84b', '#3fc1c9'],
    pitch: 'A rain-soaked street market at night. Neon signs, tarps, steam from food stalls.',
    materials: 'Wet asphalt, tiled shopfronts, painted metal shutters, plastic sheeting.',
    props: 'Food carts, crates of produce, hanging lanterns, scooters.',
    layout: 'Mid is a covered alley of stalls; B is a closed-down arcade.',
    fit: 'Moody, but needs careful lighting so players stay visible.',
  },
  {
    name: 'Ridge station',
    colors: ['#eef3f6', '#a9bccb', '#4c6a80', '#2b2f33', '#d4553d'],
    pitch: 'An alpine cable-car station above the snowline. Timber, steel and big views out.',
    materials: 'Packed snow, dark timber, brushed steel, frosted glass.',
    props: 'Gondola cars, ski racks, generator huts, red rescue sleds.',
    layout: 'A is the gondola hall; B is the maintenance garage; A long is an outdoor walkway.',
    fit: 'Cold, clean palette that makes player models pop.',
  },
  {
    name: 'Freight yard',
    colors: ['#d9c39a', '#b08550', '#6b4b2d', '#3d4f3a', '#9aa7a3'],
    pitch: 'A desert rail depot. Freight cars, loading docks and a water tower.',
    materials: 'Sandstone, faded paint, oily concrete, rusted steel.',
    props: 'Boxcars, flatbeds with crates, fuel tanks, signal posts.',
    layout: 'B tunnels become a rail underpass; site A sits between two parked boxcars.',
    fit: 'Classic Dust feel. Boxcars give tall, readable cover.',
  },
  {
    name: 'Flooded metro',
    colors: ['#1d2a2c', '#3b5354', '#8fb6ad', '#e8e1c9', '#d9a441'],
    pitch: 'An abandoned subway station with ankle-deep water, tiled walls and dead escalators.',
    materials: 'Cream wall tile, wet concrete, rusted rail, grimy signage.',
    props: 'Subway cars, ticket barriers, benches, work lights.',
    layout:
      'A is the platform with a stalled train; B is the ticket hall; mid is the escalator shaft.',
    fit: 'Shallow water footsteps add sound info; keep it bright enough.',
  },
  {
    name: 'Vineyard abbey',
    colors: ['#efe2c6', '#c79b62', '#7b3f3a', '#4f6b3b', '#2e3a44'],
    pitch: 'A hillside monastery making wine. Terraces, stone arches, barrel cellars.',
    materials: 'Warm limestone, terracotta roof tile, oak, painted shutters.',
    props: 'Barrels, grape crates, carts, bell tower.',
    layout:
      'A is the courtyard with a fountain; B is the barrel cellar; A long runs along the vine terraces.',
    fit: 'Pairs well with stock Inferno content. Arches make natural chokes.',
  },
];
