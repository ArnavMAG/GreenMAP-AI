# GreenMap AI

A hackathon prototype dashboard for exploring candidate locations for solar farms and wind turbines in Karnataka, India.

**Stack:** React 18, TypeScript, Tailwind CSS, Leaflet, OpenStreetMap tiles, Vite.

## Run

```bash
npm install
npm run dev      # development server
npm run build    # type-check + production build into dist/
```

## Features

- Sidebar: Overview, Explore Map, Solar Potential, Wind Potential, Reports
- Interactive Leaflet map centred on Karnataka with real OpenStreetMap tiles
- All Sites / Solar / Wind filters
- Five clickable candidate markers (selection syncs with the ranking list and details panel)
- Summary cards, ranked list and a details panel explaining why a site may be suitable
- Responsive layout (sidebar collapses to a top bar on small screens)

## Data disclaimer

All suitability scores in `src/data/sites.ts` are **illustrative sample values** for a prototype.
Locations are approximate area-level candidates. No satellite, meteorological, land-use or grid data
is used, and nothing has been scientifically verified. A real assessment would need irradiance,
wind-speed, terrain, land, grid and environmental datasets.
