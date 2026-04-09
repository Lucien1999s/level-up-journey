export type Locale = "en" | "zh";

export type DomainProficiencyRating =
  | "Initiate"
  | "Apprentice"
  | "Practitioner"
  | "Specialist"
  | "Expert"
  | "Master";

export type BadgeType = "achievement" | "identity";
export type BadgeTier = "bronze" | "silver" | "gold";

export interface PathProgress {
  id: number;
  name: string;
  level: number;
  total_exp: number;
  xp_to_next_level: number;
  current_status: string;
  past_achievements: string;
  lang: string;
}

export interface Domain {
  id: number;
  name: string;
  summary: string;
  proficiency_rating: DomainProficiencyRating;
  proficiency_reason: string;
}

export interface Badge {
  id: number;
  name: string;
  type: BadgeType;
  tier: BadgeTier;
  progress: number;
  is_completed: boolean;
  reason: string;
}

export interface PathRecord {
  path: PathProgress;
  domains: Domain[];
  badges: Badge[];
}

export interface JourneyDataResponse {
  paths: PathRecord[];
}

export interface AccountSessionResponse {
  email: string;
}

export interface MatchedActionGroup {
  path_id: number;
  path_name: string;
  matched_domains: string[];
  evidence: string;
}

export interface DomainActionUpdate {
  domain_id: number | null;
  name: string;
  is_new: boolean;
  action_summary: string;
  proficiency_rating: DomainProficiencyRating;
  proficiency_reason: string;
}

export interface PathActionUpdate {
  path_id: number;
  path_name: string;
  previous_level: number;
  new_level: number;
  exp_gain: number;
  new_total_exp: number;
  evidence: string;
  feedback: string;
  domain_updates: DomainActionUpdate[];
}

export interface BadgeActionUpdate {
  path_id: number;
  badge_id: number;
  badge_name: string;
  previous_progress: number;
  new_progress: number;
  is_completed: boolean;
  reason: string;
}

export interface ActionLogResponse {
  action_log: string;
  matched_action_groups: MatchedActionGroup[];
  path_updates: PathActionUpdate[];
  badge_updates: BadgeActionUpdate[];
}
