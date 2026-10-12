// Domain row types. Field names mirror the Postgres columns (snake_case) so
// that records round-trip between IndexedDB, Supabase and JSON backups
// without any mapping layer. `user_id` is never stored on the client: the
// database fills it from auth.uid().

export type ISO = string; // ISO-8601 timestamp (UTC)

export const TIDES = ["high", "rising", "falling", "low"] as const;
export type Tide = (typeof TIDES)[number];

export const MOON_PHASES = [
  "new",
  "waxing_crescent",
  "first_quarter",
  "waxing_gibbous",
  "full",
  "waning_gibbous",
  "last_quarter",
  "waning_crescent",
] as const;
export type MoonPhase = (typeof MOON_PHASES)[number];

export const SEA_STATES = ["calm", "slight", "moderate", "rough", "very_rough"] as const;
export type SeaState = (typeof SEA_STATES)[number];

export const WIND_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type WindDir = (typeof WIND_DIRS)[number];

export const EQUIPMENT_CATEGORIES = [
  "rod",
  "reel",
  "line",
  "leader",
  "lure",
  "jig",
  "hook",
  "bait",
  "accessory",
] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export const GOAL_KINDS = [
  "species_count",
  "distinct_species",
  "trip_count",
  "catch_count",
  "fish_over_weight",
  "fish_over_length",
  "technique_success_rate",
  "species_with_technique",
] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export type IdentificationStatus = "manual" | "ai_confirmed" | "ai_corrected" | "pending_ai" | "unidentified";

interface Timestamps {
  created_at: ISO;
  updated_at: ISO;
}

export interface Technique extends Timestamps {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  is_builtin: boolean;
  sort_order: number;
}

export interface Species extends Timestamps {
  id: string;
  name_ar: string;
  name_en: string | null;
  scientific_name: string | null;
  aliases: string[];
  family: string | null;
  notes: string | null;
  cover_media_id: string | null;
  is_builtin: boolean;
}

export interface Location extends Timestamps {
  id: string;
  name: string;
  area: string | null;
  lat: number | null;
  lng: number | null;
  kind: "boat" | "shore" | "pier" | "other";
  notes: string | null;
  is_demo: boolean;
}

export interface Media extends Timestamps {
  id: string;
  storage_path: string;
  thumb_path: string | null;
  sha256: string;
  kind: "photo" | "video";
  mime_type: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  taken_at: ISO | null;
}

export interface Equipment extends Timestamps {
  id: string;
  category: EquipmentCategory;
  name: string;
  brand: string | null;
  model: string | null;
  specs: string | null;
  pe_rating: number | null;
  photo_media_id: string | null;
  notes: string | null;
  retired: boolean;
  is_demo: boolean;
}

export interface Trip extends Timestamps {
  id: string;
  title: string | null;
  status: "draft" | "completed";
  started_at: ISO;
  ended_at: ISO | null;
  hijri_date_override: string | null; // "1448-04-10"
  location_id: string | null;
  lat: number | null;
  lng: number | null;
  technique_id: string | null;
  target_species_id: string | null;
  weather: string | null;
  air_temp_c: number | null;
  wind_speed_kmh: number | null;
  wind_dir: WindDir | null;
  sea_state: SeaState | null;
  water_depth_m: number | null;
  tide: Tide | null;
  moon_phase: MoonPhase | null; // user-entered; analytics fall back to the calculated phase
  line_pe: number | null;
  lure_bait: string | null;
  gear_notes: string | null;
  notes: string | null;
  is_demo: boolean;
}

export interface AiCandidate {
  name_ar: string;
  name_en: string;
  scientific_name: string | null;
  confidence: number; // 0..1
  matched_species_id: string | null;
  reasoning: string;
}

export interface AiSuggestion {
  model: string;
  created_at: ISO;
  image_quality: "good" | "fair" | "poor" | "not_a_fish";
  summary: string;
  candidates: AiCandidate[];
}

export interface Catch extends Timestamps {
  id: string;
  trip_id: string;
  species_id: string | null;
  caught_at: ISO;
  weight_kg: number | null;
  weight_is_estimate: boolean;
  length_cm: number | null;
  length_is_estimate: boolean;
  location_id: string | null;
  depth_m: number | null;
  technique_id: string | null;
  line_type: string | null;
  pe_rating: number | null;
  lure_bait: string | null;
  weather: string | null;
  tide: Tide | null;
  moon_phase: MoonPhase | null;
  notes: string | null;
  released: boolean;
  photo_media_id: string | null;
  identification_status: IdentificationStatus;
  ai_species_id: string | null;
  ai_suggestion: AiSuggestion | null;
  is_demo: boolean;
}

export interface TripEquipment {
  trip_id: string;
  equipment_id: string;
  created_at: ISO;
}
export interface CatchEquipment {
  catch_id: string;
  equipment_id: string;
  created_at: ISO;
}
export interface TripMedia {
  trip_id: string;
  media_id: string;
  created_at: ISO;
}

export interface Goal extends Timestamps {
  id: string;
  title: string;
  kind: GoalKind;
  target_value: number;
  species_id: string | null;
  technique_id: string | null;
  period_start: string | null; // YYYY-MM-DD (Kuwait date)
  period_end: string | null;
  baseline: { success_rate?: number; trips?: number } | null;
  status: "active" | "archived";
  is_demo: boolean;
}

export interface UserAchievement {
  achievement_code: string;
  unlocked_at: ISO;
  context: Record<string, unknown> | null;
  created_at: ISO;
}

export type EnvKind = "observation" | "forecast" | "model" | "calculated";
export interface EnvironmentObservation extends Timestamps {
  id: string;
  trip_id: string;
  catch_id: string | null;
  source: string;
  kind: EnvKind;
  valid_at: ISO;
  fetched_at: ISO;
  lat: number | null;
  lng: number | null;
  data: Record<string, number | string | null>;
}

export interface Profile {
  id: string;
  display_name: string | null;
  locale: "ar" | "en";
  hijri_offset: number;
}

/** All synchronised tables, keyed by table name. */
export interface Tables {
  techniques: Technique;
  species: Species;
  locations: Location;
  media: Media;
  equipment: Equipment;
  trips: Trip;
  catches: Catch;
  trip_equipment: TripEquipment;
  catch_equipment: CatchEquipment;
  trip_media: TripMedia;
  goals: Goal;
  user_achievements: UserAchievement;
  environment_observations: EnvironmentObservation;
}
export type TableName = keyof Tables;

/**
 * Order matters: parents before children. Used for pushing a full dataset
 * (backup restore, local -> cloud migration) so foreign keys always resolve.
 */
export const TABLE_ORDER: TableName[] = [
  "media",
  "techniques",
  "species",
  "locations",
  "equipment",
  "trips",
  "catches",
  "trip_equipment",
  "catch_equipment",
  "trip_media",
  "goals",
  "user_achievements",
  "environment_observations",
];

/** Primary-key columns for each table (composite for join tables). */
export const TABLE_KEYS: Record<TableName, string[]> = {
  techniques: ["id"],
  species: ["id"],
  locations: ["id"],
  media: ["id"],
  equipment: ["id"],
  trips: ["id"],
  catches: ["id"],
  trip_equipment: ["trip_id", "equipment_id"],
  catch_equipment: ["catch_id", "equipment_id"],
  trip_media: ["trip_id", "media_id"],
  goals: ["id"],
  user_achievements: ["achievement_code"],
  environment_observations: ["id"],
};

/** Conflict target used for upserts (user_achievements PK includes user_id). */
export const UPSERT_CONFLICT: Record<TableName, string> = {
  ...(Object.fromEntries(Object.entries(TABLE_KEYS).map(([k, v]) => [k, v.join(",")])) as Record<TableName, string>),
  user_achievements: "user_id,achievement_code",
};

export function rowKey<T extends TableName>(table: T, row: Partial<Tables[T]>): string {
  return TABLE_KEYS[table].map((k) => String((row as Record<string, unknown>)[k])).join("|");
}

export interface Dataset {
  techniques: Technique[];
  species: Species[];
  locations: Location[];
  media: Media[];
  equipment: Equipment[];
  trips: Trip[];
  catches: Catch[];
  trip_equipment: TripEquipment[];
  catch_equipment: CatchEquipment[];
  trip_media: TripMedia[];
  goals: Goal[];
  user_achievements: UserAchievement[];
  environment_observations: EnvironmentObservation[];
}

export function emptyDataset(): Dataset {
  return {
    techniques: [],
    species: [],
    locations: [],
    media: [],
    equipment: [],
    trips: [],
    catches: [],
    trip_equipment: [],
    catch_equipment: [],
    trip_media: [],
    goals: [],
    user_achievements: [],
    environment_observations: [],
  };
}
