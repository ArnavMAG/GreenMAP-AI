export type Filter = "all" | "high";
export type DivisionId = "mysuru" | "bengaluru" | "belagavi" | "kalaburagi";
export type Profile = "dry-interior" | "south-plateau" | "ghats-coast" | "urban";

/** Districts scoring at or above this value count as "High Solar" (filter, cards, map dimming). */
export const HIGH_SCORE_THRESHOLD = 90;

/**
 * The four revenue/administrative divisions of Karnataka and their map colours.
 * (Colour mapping as requested: Mysuru = green, Bengaluru = red, Belagavi = blue, Kalaburagi = gold.)
 */
export const DIVISIONS: Record<DivisionId, { name: string; color: string }> = {
  mysuru: { name: "Mysuru Division", color: "#22c55e" },
  bengaluru: { name: "Bengaluru Division", color: "#ef4444" },
  belagavi: { name: "Belagavi Division", color: "#3b82f6" },
  kalaburagi: { name: "Kalaburagi (Gulbarga) Division", color: "#eab308" },
};

export const DIVISION_IDS = Object.keys(DIVISIONS) as DivisionId[];

export interface District {
  id: string;
  /** Display name. */
  name: string;
  /** Name used in the boundary GeoJSON (`district` property). */
  geoName: string;
  division: DivisionId;
  profile: Profile;
  /** District headquarters / main administrative city. */
  city: string;
  /** Mean altitude in metres across the district's talukas (talukas without a value are left out of the mean). */
  altitude: number;
  /** Mean Global Horizontal Irradiance across the district's talukas (kWh/m²/day). */
  ghi: number;
  /** Mean Direct Normal Irradiance across the district's talukas (kWh/m²/day). */
  dni: number;
  /** Number of talukas in the source spreadsheet that were averaged into this district. */
  talukas: number;
  /** Irradiance suitability index, 50–100, derived from `ghi` and `dni` (see `suitabilityScore`). */
  solar: number;
  /**
   * Legacy planning figure (GW) that the locked map tooltip still reads. It is not part of the spreadsheet
   * and is not displayed anywhere in the dashboard components.
   */
  demandGW: number;
  /** Optional district-specific note. */
  extra?: string;
  /** Optional note about the boundary shape. */
  boundaryNote?: string;
}

export const PROFILES: Record<Profile, { label: string; considerations: string[] }> = {
  "dry-interior": {
    label: "Dry interior plateau",
    considerations: [
      "Confirm land ownership and acquisition costs.",
      "Check grid evacuation capacity nearby.",
      "Check water availability for panel cleaning.",
    ],
  },
  "south-plateau": {
    label: "Southern plateau and farmland",
    considerations: [
      "Competition with agricultural land use.",
      "Check slope across candidate parcels on the Terrain Height Map.",
      "Confirm grid connection points and capacity.",
    ],
  },
  "ghats-coast": {
    label: "Western Ghats and coast",
    considerations: [
      "Steep slopes and forest cover can restrict development.",
      "Check protected-area and forest-land restrictions.",
      "Rooftop or small distributed solar may be more practical than large farms.",
    ],
  },
  urban: {
    label: "Urban and peri-urban",
    considerations: [
      "Land is scarce and expensive for ground-mounted arrays.",
      "Assess rooftop availability and shading.",
      "Check net-metering and local grid rules.",
    ],
  },
};

/**
 * Source spreadsheet, one row per taluka: [district, taluka, altitude (m, null = NA), GHI, DNI].
 * District values below are the plain mean of their talukas; "NA" altitudes are skipped in the altitude mean.
 */
const TALUKA_ROWS: [string, string, number | null, number, number][] = [
  ["Bagalkot", "Bagalkot", 770, 5.83, 5.31],
  ["Bagalkot", "Jamkhandi", 543, 5.88, 5.39],
  ["Bagalkot", "Mudhol", 548, 5.88, 5.4],
  ["Bagalkot", "Badami", 586, 5.91, 5.52],
  ["Bagalkot", "Bilgi", 564, 5.9, 5.46],
  ["Bagalkot", "Hungund", 530, 5.83, 5.38],
  ["Bangalore Rural", "Doddaballapur", 880, 5.88, 5.43],
  ["Bangalore Rural", "Devanahalli", null, 5.9, 5.45],
  ["Bangalore Rural", "Hoskote", 875, 5.87, 5.39],
  ["Bangalore Rural", "Nelamangala", 882, 5.94, 5.55],
  ["Bangalore Urban", "Anekal", 915, 5.92, 5.48],
  ["Belgaum", "Athani", 554, 5.78, 5.24],
  ["Belgaum", "Bailhongal", 664, 5.79, 5.44],
  ["Belgaum", "Belgaum", 762, 5.7, 5.35],
  ["Belgaum", "Chikodi", 683, 5.86, 5.45],
  ["Belgaum", "Gokak", 553, 5.85, 5.42],
  ["Belgaum", "Hukeri", 631, 5.85, 5.46],
  ["Belgaum", "Khanapur", 649, 5.73, 5.44],
  ["Belgaum", "Raybag", 590, 5.87, 5.46],
  ["Belgaum", "Ramdurg", 570, 5.89, 5.51],
  ["Belgaum", "Saundatti", 610, 5.84, 5.44],
  ["Uttar Kannada", "Karwar", 586, 5.76, 5.55],
  ["Uttar Kannada", "Sirsi", 590, 5.71, 5.39],
  ["Uttar Kannada", "Joida", null, 5.69, 5.5],
  ["Uttar Kannada", "Bhatkal", 3, 5.7, 5.35],
  ["Uttar Kannada", "Kumta", 2, 5.67, 5.36],
  ["Uttar Kannada", "Ankola", 16, 5.69, 5.41],
  ["Uttar Kannada", "Haliyal", 559, 5.78, 5.44],
  ["Uttar Kannada", "Honnavar", 2, 5.75, 5.49],
  ["Uttar Kannada", "Mundgod", 567, 5.79, 5.41],
  ["Uttar Kannada", "Siddapura", 564, 5.67, 5.42],
  ["Uttar Kannada", "Yellapura", 541, 5.73, 5.42],
  ["Udupi", "Udupi", 39, 5.72, 5.35],
  ["Udupi", "Karkala", 80, 5.52, 4.95],
  ["Udupi", "Kundapura", 80, 5.45, 4.93],
  ["Yadgir", "Shahpur", 428, 5.9, 5.42],
  ["Yadgir", "Shorapur", 472, 5.95, 5.48],
  ["Yadgir", "Yadgir", 389, 5.89, 5.41],
  ["Bellary", "Bellary", 444, 5.92, 5.41],
  ["Bellary", "Hospet", 479, 5.95, 5.52],
  ["Bellary", "Kampli", 414, 5.88, 5.34],
  ["Bellary", "Hoovina Hadagali", null, 5.89, 5.46],
  ["Bellary", "Kudligi", 596, 5.88, 5.41],
  ["Bellary", "Sanduru", 564, 5.76, 5.19],
  ["Bellary", "Siraguppa", 373, 5.92, 5.4],
  ["Bellary", "Hagari Bommanahalli", null, 5.9, 5.41],
  ["Bidar", "Bidar", 614, 5.73, 5.22],
  ["Bidar", "Basavakalyan", 621, 5.77, 5.21],
  ["Bidar", "Bhalki", 587, 5.71, 5.16],
  ["Bidar", "Humnabad", 638, 5.76, 5.26],
  ["Bidar", "Aurad", 542, 5.74, 5.22],
  ["Bijapur", "Bijapur", 770, 5.86, 5.38],
  ["Bijapur", "Indi", 464, 5.87, 5.36],
  ["Bijapur", "Muddebihal", 563, 5.92, 5.44],
  ["Bijapur", "Sindagi", 500, 5.88, 5.38],
  ["Bijapur", "Basavana Bagevadi", 607, 5.82, 5.26],
  ["Chamraj Nagar", "Chamarajanagar", null, 5.88, 5.51],
  ["Chamraj Nagar", "Gundlupet", 816, 5.86, 5.46],
  ["Chamraj Nagar", "Kollegal", 587, 5.92, 5.52],
  ["Chamraj Nagar", "Yelandur", 555, 5.86, 5.45],
  ["Chikkaballapur", "Chikkaballapur", 915, 5.89, 5.48],
  ["Chikkaballapur", "Chintamani", 865, 5.92, 5.55],
  ["Chikkaballapur", "Gauribidanur", 694, 5.88, 5.43],
  ["Chikkaballapur", "Sidlaghatta", 878, 5.89, 5.46],
  ["Chikkaballapur", "Bagepalli", 707, 5.95, 5.61],
  ["Chikkaballapur", "Gudibanda", 826, 5.96, 5.64],
  ["Chikmagalur", "Chikmagalur", null, 5.55, 5.14],
  ["Chikmagalur", "Kadur", 763, 5.87, 5.48],
  ["Chikmagalur", "Koppa", 763, 5.51, 5.06],
  ["Chikmagalur", "Mudigere", 915, 5.51, 5.06],
  ["Chikmagalur", "Narasimharajapura", 643, 5.68, 5.26],
  ["Chikmagalur", "Shringeri", 672, 5.51, 5.06],
  ["Chikmagalur", "Terikere", 697, 5.86, 5.46],
  ["Chitradurga", "Chitradurga", 732, 5.89, 5.45],
  ["Chitradurga", "Challakere", 585, 6.02, 5.68],
  ["Chitradurga", "Hiriyur", 630, 5.9, 5.45],
  ["Chitradurga", "Holalkere", 710, 5.86, 5.41],
  ["Chitradurga", "Hosadurga", 739, 5.91, 5.5],
  ["Chitradurga", "Molakalmuru", null, 5.93, 5.56],
  ["Dakshina Kannada", "Mangalore", 22, 5.77, 5.33],
  ["Dakshina Kannada", "Puttur", 87, 5.61, 5.18],
  ["Dakshina Kannada", "Bantwal", 36, 5.62, 5.13],
  ["Dakshina Kannada", "Belthangady", 685, 5.57, 5.09],
  ["Dakshina Kannada", "Sullia", 108, 5.6, 5.14],
  ["Davangere", "Davangere", null, 5.9, 5.51],
  ["Davangere", "Harihar", 539, 5.88, 5.47],
  ["Davangere", "Channagiri", 662, 5.85, 5.44],
  ["Davangere", "Harpanahalli", 633, 5.9, 5.49],
  ["Davangere", "Honnali", 540, 5.86, 5.43],
  ["Davangere", "Jagalur", 668, 5.89, 5.44],
  ["Dharwad", "Dharwad", 679, 5.81, 5.43],
  ["Dharwad", "Hubli", 670.75, 5.83, 5.47],
  ["Dharwad", "Kalghatgi", 536, 5.81, 5.44],
  ["Dharwad", "Kundgol", 615, 5.82, 5.38],
  ["Dharwad", "Navalgund", 578, 5.83, 5.4],
  ["Gadag", "Gadag-Betageri", null, 5.9, 5.51],
  ["Gadag", "Nargund", 605, 5.84, 5.42],
  ["Gadag", "Mundargi", 528, 5.9, 5.45],
  ["Gadag", "Ron", 592, 5.85, 5.42],
  ["Gadag", "Shirahatti", 659, 5.85, 5.4],
  ["Gulbarga", "Gulbarga", 454, 5.79, 5.28],
  ["Gulbarga", "Aland", 480, 5.78, 5.24],
  ["Gulbarga", "Sedam", null, 5.76, 5.2],
  ["Gulbarga", "Afzalpur", 408, 5.8, 5.25],
  ["Gulbarga", "Chincholi", 462, 5.69, 5.1],
  ["Gulbarga", "Chitapur", 403, 5.79, 5.23],
  ["Gulbarga", "Jevargi", 393, 5.82, 5.28],
  ["Hassan", "Hassan", 72, 5.8, 5.38],
  ["Hassan", "Arsikere", 806, 5.83, 5.42],
  ["Hassan", "Channarayapattana", 827, 5.81, 5.33],
  ["Hassan", "Holenarasipura", 849, 5.87, 5.41],
  ["Hassan", "Sakleshpur", 949, 5.54, 5.14],
  ["Hassan", "Alur", 974, 5.67, 5.24],
  ["Hassan", "Arkalgud", 916, 5.76, 5.31],
  ["Hassan", "Belur", 975, 5.74, 5.39],
  ["Haveri", "Haveri", 571, 5.86, 5.45],
  ["Haveri", "Ranebennuru", 604, 5.89, 5.48],
  ["Haveri", "Byadgi", 601, 5.89, 5.51],
  ["Haveri", "Hangal", 555, 5.85, 5.49],
  ["Haveri", "Savanur", 573, 5.87, 5.47],
  ["Haveri", "Hirekerur", null, 5.85, 5.5],
  ["Haveri", "Shiggaon", 601, 5.84, 5.44],
  ["Kodagu", "Madikeri", 1525, 5.41, 4.87],
  ["Kodagu", "Somwarpet", 1027, 5.51, 5.05],
  ["Kodagu", "Virajpet", 909, 5.52, 5.01],
  ["Kolar", "Kolar", 821, 5.91, 5.5],
  ["Kolar", "Bangarapet", 843, 5.87, 5.38],
  ["Kolar", "Malur", 909, 5.89, 5.41],
  ["Kolar", "Mulbagal", 826, 5.92, 5.54],
  ["Kolar", "Srinivaspur", 819, 5.86, 5.43],
  ["Koppal", "Koppal", 529, 5.88, 5.36],
  ["Koppal", "Gangavathi", null, 5.95, 5.45],
  ["Koppal", "Kushtagi", 639, 5.95, 5.49],
  ["Koppal", "Yelbarga", 605, 5.89, 5.42],
  ["Mandya", "Mandya", 678, 5.97, 5.54],
  ["Mandya", "Maddur", 662, 5.97, 5.55],
  ["Mandya", "Malavalli", 610, 5.97, 5.59],
  ["Mandya", "Srirangapatna", 679, 5.98, 5.55],
  ["Mandya", "Krishnarajpet", 790, 5.86, 5.36],
  ["Mandya", "Nagamangala", 772, 5.92, 5.48],
  ["Mandya", "Pandavapura", 709, 5.93, 5.48],
  ["Mysore", "Mysore", 763, 5.94, 5.48],
  ["Mysore", "Hunsur", 792, 5.81, 5.33],
  ["Mysore", "Krishnarajanagar", null, 5.91, 5.48],
  ["Mysore", "Nanjangud", 656, 5.96, 5.54],
  ["Mysore", "Heggadadevanakote", 694, 5.83, 5.37],
  ["Mysore", "Piriyapatna", 844, 5.76, 5.27],
  ["Mysore", "Tirumakudalu Narasipura", 638, 5.98, 5.59],
  ["Ramanagara", "Ramanagara", null, 5.9, 5.4],
  ["Ramanagara", "Magadi", 925, 5.87, 5.39],
  ["Ramanagara", "Kanakapura", 637, 5.88, 5.4],
  ["Ramanagara", "Channapatna", null, 5.9, 5.4],
  ["Raichur", "Raichur", 407, 5.92, 5.43],
  ["Raichur", "Manvi", 361, 5.94, 5.47],
  ["Raichur", "Sindhanur", 377, 5.92, 5.39],
  ["Raichur", "Devadurga", 398, 5.92, 5.42],
  ["Raichur", "Lingsugur", 499, 5.91, 5.38],
  ["Shimoga", "Shimoga", 569, 5.84, 5.44],
  ["Shimoga", "Sagara", 579, 5.7, 5.29],
  ["Shimoga", "Bhadravathi", 597, 5.77, 5.36],
  ["Shimoga", "Hosanagara", 585, 5.85, 5.44],
  ["Shimoga", "Shikaripura", 603, 5.81, 5.42],
  ["Shimoga", "Soraba", 580, 5.77, 5.41],
  ["Shimoga", "Thirthahalli", 591, 5.61, 5.12],
  ["Tumkur", "Tumkur", 822, 5.86, 5.43],
  ["Tumkur", "Chikkanayakana Halli", 804, 5.85, 5.4],
  ["Tumkur", "Kunigal", 773, 5.87, 5.41],
  ["Tumkur", "Madhugiri", 787, 5.96, 5.49],
  ["Tumkur", "Sira", 661, 5.97, 5.6],
  ["Tumkur", "Tiptur", 862, 5.86, 5.4],
  ["Tumkur", "Gubbi", 767, 5.87, 5.42],
  ["Tumkur", "Koratagere", 750, 5.94, 5.55],
  ["Tumkur", "Pavagada", 646, 5.99, 5.6],
  ["Tumkur", "Turuvekere", 794, 5.91, 5.48],
];

/** Spreadsheet district name -> name used by the map boundaries / dashboard. */
const SHEET_TO_APP: Record<string, string> = {
  Bagalkot: "Bagalkote",
  "Bangalore Rural": "Bengaluru Rural",
  "Bangalore Urban": "Bengaluru Urban",
  Belgaum: "Belagavi",
  "Uttar Kannada": "Uttara Kannada",
  Udupi: "Udupi",
  Yadgir: "Yadgir",
  Bellary: "Ballari",
  Bidar: "Bidar",
  Bijapur: "Vijayapura",
  "Chamraj Nagar": "Chamarajanagara",
  Chikkaballapur: "Chikkaballapura",
  Chikmagalur: "Chikkamagaluru",
  Chitradurga: "Chitradurga",
  "Dakshina Kannada": "Dakshina Kannada",
  Davangere: "Davanagere",
  Dharwad: "Dharwad",
  Gadag: "Gadag",
  Gulbarga: "Kalaburagi",
  Hassan: "Hassan",
  Haveri: "Haveri",
  Kodagu: "Kodagu",
  Kolar: "Kolar",
  Koppal: "Koppal",
  Mandya: "Mandya",
  Mysore: "Mysuru",
  Ramanagara: "Ramanagara",
  Raichur: "Raichur",
  Shimoga: "Shivamogga",
  Tumkur: "Tumakuru",
};

interface Aggregate {
  altitude: number;
  ghi: number;
  dni: number;
  talukas: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const AGGREGATES: Record<string, Aggregate> = (() => {
  const by = new Map<string, typeof TALUKA_ROWS>();
  TALUKA_ROWS.forEach((r) => by.set(SHEET_TO_APP[r[0]], [...(by.get(SHEET_TO_APP[r[0]]) ?? []), r]));
  const out: Record<string, Aggregate> = {};
  by.forEach((rows, name) => {
    const alts = rows.map((r) => r[2]).filter((x): x is number => x !== null);
    out[name] = {
      altitude: Math.round(mean(alts)),
      ghi: Math.round(mean(rows.map((r) => r[3])) * 100) / 100,
      dni: Math.round(mean(rows.map((r) => r[4])) * 100) / 100,
      talukas: rows.length,
    };
  });
  return out;
})();

const aggValues = Object.values(AGGREGATES);
const RANGE = {
  ghiMin: Math.min(...aggValues.map((a) => a.ghi)),
  ghiMax: Math.max(...aggValues.map((a) => a.ghi)),
  dniMin: Math.min(...aggValues.map((a) => a.dni)),
  dniMax: Math.max(...aggValues.map((a) => a.dni)),
};

/**
 * Suitability index (50–100) used for ranking, filters and the AI rating.
 * 60 % GHI + 40 % DNI, each min–max scaled across the Karnataka districts in the spreadsheet, then mapped to 50–100.
 * It is therefore a RELATIVE ranking inside Karnataka, not an absolute yield figure.
 */
export function suitabilityScore(ghi: number, dni: number): number {
  const g = (ghi - RANGE.ghiMin) / (RANGE.ghiMax - RANGE.ghiMin);
  const n = (dni - RANGE.dniMin) / (RANGE.dniMax - RANGE.dniMin);
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return Math.round(50 + 50 * (0.6 * clamp(g) + 0.4 * clamp(n)));
}

const d = (
  name: string,
  division: DivisionId,
  profile: Profile,
  city: string,
  demandGW: number,
  extra?: string,
  boundaryNote?: string,
): District => {
  const a = AGGREGATES[name];
  return {
    id: name.toLowerCase().replace(/[^a-z]+/g, "-"),
    name,
    geoName: name, // all boundary names match the display names
    division,
    profile,
    city,
    ...a,
    solar: suitabilityScore(a.ghi, a.dni),
    demandGW,
    extra,
    boundaryNote,
  };
};

/** Division membership follows Karnataka's four administrative divisions; this table is the single source of truth. */
export const districts: District[] = [
  // Mysuru Division
  d("Mysuru", "mysuru", "south-plateau", "Mysuru", 0.7),
  d("Mandya", "mysuru", "south-plateau", "Mandya", 0.6),
  d("Chamarajanagara", "mysuru", "south-plateau", "Chamarajanagar", 0.25),
  d("Hassan", "mysuru", "south-plateau", "Hassan", 0.5),
  d("Chikkamagaluru", "mysuru", "ghats-coast", "Chikkamagaluru", 0.35),
  d("Kodagu", "mysuru", "ghats-coast", "Madikeri", 0.2),
  d("Dakshina Kannada", "mysuru", "ghats-coast", "Mangaluru", 0.8),
  d("Udupi", "mysuru", "ghats-coast", "Udupi", 0.35),

  // Bengaluru Division
  d("Bengaluru Urban", "bengaluru", "urban", "Bengaluru", 4.5),
  d("Bengaluru Rural", "bengaluru", "south-plateau", "Devanahalli", 0.5),
  d("Ramanagara", "bengaluru", "south-plateau", "Ramanagara", 0.45),
  d("Kolar", "bengaluru", "south-plateau", "Kolar", 0.5),
  d("Chikkaballapura", "bengaluru", "south-plateau", "Chikkaballapura", 0.4),
  d("Tumakuru", "bengaluru", "dry-interior", "Tumakuru", 0.8, "Includes Pavagada taluka (GHI 5.99), among the highest in the dataset."),
  d("Chitradurga", "bengaluru", "dry-interior", "Chitradurga", 0.4, "Includes Challakere taluka, GHI 6.02 – the highest single-taluka value in the dataset."),
  d("Davanagere", "bengaluru", "dry-interior", "Davanagere", 0.5),
  d("Shivamogga", "bengaluru", "ghats-coast", "Shivamogga", 0.5),

  // Belagavi Division
  d("Belagavi", "belagavi", "south-plateau", "Belagavi", 0.9),
  d("Bagalkote", "belagavi", "dry-interior", "Bagalkot", 0.5),
  d("Vijayapura", "belagavi", "dry-interior", "Vijayapura", 0.55),
  d("Dharwad", "belagavi", "south-plateau", "Dharwad", 0.6),
  d("Gadag", "belagavi", "dry-interior", "Gadag", 0.3),
  d("Haveri", "belagavi", "south-plateau", "Haveri", 0.4),
  d("Uttara Kannada", "belagavi", "ghats-coast", "Karwar", 0.4),

  // Kalaburagi Division
  d("Kalaburagi", "kalaburagi", "dry-interior", "Kalaburagi", 0.6),
  d("Bidar", "kalaburagi", "dry-interior", "Bidar", 0.35),
  d("Yadgir", "kalaburagi", "dry-interior", "Yadgir", 0.25),
  d("Raichur", "kalaburagi", "dry-interior", "Raichur", 0.6),
  d("Koppal", "kalaburagi", "dry-interior", "Koppal", 0.35),
  d(
    "Ballari",
    "kalaburagi",
    "dry-interior",
    "Ballari",
    0.8,
    undefined,
    "The map boundary predates the 2021 creation of Vijayanagara district, so it covers both Ballari and Vijayanagara.",
  ),
];

export const districtById = (id: string | null): District | null =>
  (id && districts.find((x) => x.id === id)) || null;

/** Karnataka-wide means of the district values, used for comparisons. */
export const STATE_AVG = {
  ghi: mean(districts.map((x) => x.ghi)),
  dni: mean(districts.map((x) => x.dni)),
  altitude: mean(districts.map((x) => x.altitude)),
};

export interface Tier {
  label: string;
  color: string;
}

/** Bar / badge tiers by suitability score. */
export const TIERS: { min: number; tier: Tier }[] = [
  { min: 95, tier: { label: "95+ (strongest)", color: "#4ade80" } },
  { min: 85, tier: { label: "85–94", color: "#fbbf24" } },
  { min: 0, tier: { label: "Below 85", color: "#fb923c" } },
];

export function tierFor(score: number): Tier {
  return (TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1]).tier;
}

export function visibleDistricts(filter: Filter): District[] {
  return districts.filter((x) => (filter === "all" ? true : x.solar >= HIGH_SCORE_THRESHOLD));
}

export function rankedDistricts(filter: Filter): District[] {
  return [...visibleDistricts(filter)].sort((a, b) => b.solar - a.solar || b.ghi - a.ghi);
}

export function avg(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}

/** Result of one on-device AI analysis run (produced by the web worker). */
export interface AiResult {
  /** Suitability rating, 50–100. */
  score: number;
  /** Two-sentence brief about the district's altitude, GHI and DNI. */
  brief: string;
  /** "model" = text generated by the language model; "data" = the model's text failed validation, data-grounded text shown instead. */
  source: "model" | "data";
  /** Wall-clock time of the run in ms. */
  ms: number;
}

/** Plain-language, data-derived points for the "Why it may be suitable" section. */
export function reasonsFor(x: District): string[] {
  const dGhi = x.ghi - STATE_AVG.ghi;
  const dDni = x.dni - STATE_AVG.dni;
  const rank = [...districts].sort((a, b) => b.solar - a.solar || b.ghi - a.ghi).findIndex((y) => y.id === x.id) + 1;
  const rel = (v: number) => `${Math.abs(v).toFixed(2)} ${v >= 0 ? "above" : "below"}`;
  const out = [
    `GHI of ${x.ghi.toFixed(2)} kWh/m²/day is ${rel(dGhi)} the Karnataka district average (${STATE_AVG.ghi.toFixed(2)}).`,
    `DNI of ${x.dni.toFixed(2)} kWh/m²/day is ${rel(dDni)} the Karnataka district average (${STATE_AVG.dni.toFixed(2)}).`,
    `Ranks #${rank} of ${districts.length} districts on the irradiance index (${x.solar}/100).`,
  ];
  if (x.altitude >= 900) out.push(`Mean elevation of ${x.altitude} m: elevated terrain, so check slope on the Terrain Height Map.`);
  else if (x.altitude <= 150) out.push(`Mean elevation of ${x.altitude} m: coastal lowland.`);
  else out.push(`Mean elevation of ${x.altitude} m across ${x.talukas} taluka${x.talukas === 1 ? "" : "s"}.`);
  if (x.extra) out.push(x.extra);
  return out;
}
