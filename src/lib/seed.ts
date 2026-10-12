// Built-in techniques and a starter list of Arabian Gulf species commonly
// caught in Kuwait. Everything here is editable in the app. Scientific names
// are only given where the common Kuwaiti name maps reliably to one species;
// otherwise they are left empty for the user to fill in.

export const BUILTIN_TECHNIQUES = [
  { code: "jigging", name_ar: "جيقنق", name_en: "Jigging", sort_order: 1 },
  { code: "trolling", name_ar: "ترولنق (سحب)", name_en: "Trolling", sort_order: 2 },
  { code: "shore", name_ar: "صيد من الساحل", name_en: "Shore fishing", sort_order: 3 },
  { code: "bottom", name_ar: "حداق (قاع)", name_en: "Bottom fishing", sort_order: 4 },
  { code: "casting", name_ar: "رمي (كاستنق)", name_en: "Casting / Popping", sort_order: 5 },
] as const;

export interface SeedSpecies {
  name_ar: string;
  name_en: string;
  scientific_name: string | null;
  family: string | null;
  aliases: string[];
  notes?: string;
}

export const SEED_SPECIES: SeedSpecies[] = [
  {
    name_ar: "هامور",
    name_en: "Orange-spotted grouper",
    scientific_name: "Epinephelus coioides",
    family: "Serranidae",
    aliases: ["هامورة", "Hamour", "Hammour", "Grouper", "Estuary cod"],
  },
  {
    name_ar: "بالول",
    name_en: "Balool",
    scientific_name: null,
    family: "Serranidae",
    aliases: ["Baloul", "بلول", "Balool grouper"],
    notes:
      "Local name. Please confirm the exact species and add the scientific name if you know it. / اسم محلي — أكّد النوع وأضف الاسم العلمي إذا كان معروفاً.",
  },
  {
    name_ar: "شعم",
    name_en: "Yellowfin seabream",
    scientific_name: "Acanthopagrus latus",
    family: "Sparidae",
    aliases: ["Sheim", "Shaem", "شعمة"],
  },
  {
    name_ar: "سبيطي",
    name_en: "Sobaity seabream",
    scientific_name: "Sparidentex hasta",
    family: "Sparidae",
    aliases: ["Sobaity", "Sobaiti", "صبيطي"],
  },
  {
    name_ar: "شعري",
    name_en: "Spangled emperor",
    scientific_name: "Lethrinus nebulosus",
    family: "Lethrinidae",
    aliases: ["Sheiry", "Shaari", "Emperor"],
  },
  {
    name_ar: "نويبي",
    name_en: "Tigertooth croaker",
    scientific_name: "Otolithes ruber",
    family: "Sciaenidae",
    aliases: ["Newaiby", "Nuwaibi", "نوبي"],
  },
  {
    name_ar: "زبيدي",
    name_en: "Silver pomfret",
    scientific_name: "Pampus argenteus",
    family: "Stromateidae",
    aliases: ["Zobaidy", "Zubaidi", "Pomfret"],
  },
  {
    name_ar: "نقرور",
    name_en: "Javelin grunter",
    scientific_name: "Pomadasys kaakan",
    family: "Haemulidae",
    aliases: ["Nagroor", "Grunt"],
  },
  {
    name_ar: "كنعد",
    name_en: "Narrow-barred Spanish mackerel",
    scientific_name: "Scomberomorus commerson",
    family: "Scombridae",
    aliases: ["Kingfish", "Kanaad", "Kingfish mackerel"],
  },
  {
    name_ar: "جيذر",
    name_en: "Longtail tuna",
    scientific_name: "Thunnus tonggol",
    family: "Scombridae",
    aliases: ["Jaidher", "Tuna", "جيدر"],
  },
  {
    name_ar: "صبور",
    name_en: "Hilsa shad",
    scientific_name: "Tenualosa ilisha",
    family: "Clupeidae",
    aliases: ["Suboor", "Hilsa"],
  },
  {
    name_ar: "صافي",
    name_en: "White-spotted rabbitfish",
    scientific_name: "Siganus canaliculatus",
    family: "Siganidae",
    aliases: ["Safi", "Rabbitfish"],
  },
  {
    name_ar: "بياح",
    name_en: "Klunzinger's mullet",
    scientific_name: "Planiliza klunzingeri",
    family: "Mugilidae",
    aliases: ["Biah", "Mullet"],
  },
  {
    name_ar: "جش",
    name_en: "Trevally / jack",
    scientific_name: null,
    family: "Carangidae",
    aliases: ["Jesh", "Trevally", "Jack"],
  },
  {
    name_ar: "باراكودا",
    name_en: "Barracuda",
    scientific_name: null,
    family: "Sphyraenidae",
    aliases: ["Barracuda"],
  },
  {
    name_ar: "كوبيا",
    name_en: "Cobia",
    scientific_name: "Rachycentron canadum",
    family: "Rachycentridae",
    aliases: ["Cobia"],
  },
];
