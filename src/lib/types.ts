export type Sport = "tennis" | "padel";
export type UserRole = "member" | "organiser" | "admin";
export type AccountStatus = "pending" | "approved" | "rejected";
export type Gender = "M" | "V";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  status: AccountStatus;
}

// A member of the club list. Registrations point to members, not accounts.
export interface ClubMember {
  id: string;
  last_name: string;
  first_name: string;
  full_name: string;
  gender: Gender | null;
  tennis_singles_ranking: string | null;
  tennis_doubles_ranking: string | null;
  padel_ranking: string | null;
  profile_id: string | null;
}

export const MEMBER_COLUMNS =
  "id, last_name, first_name, full_name, gender, tennis_singles_ranking, tennis_doubles_ranking, padel_ranking, profile_id";

export interface Registration {
  id: string;
  member_id: string;
  tennis: boolean;
  padel: boolean;
  eats: boolean;
  // When the member signed up for the sport: the order of the reserve list.
  tennis_since: string | null;
  padel_since: string | null;
  registered_by: string | null;
  created_at: string;
  member: Pick<
    ClubMember,
    "full_name" | "tennis_singles_ranking" | "tennis_doubles_ranking" | "padel_ranking"
  > | null;
}

export interface ClubEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  registration_deadline: string | null;
  has_tennis: boolean;
  has_padel: boolean;
  // Players per sport; who registers after that is on the reserve list.
  max_tennis: number | null;
  max_padel: number | null;
  // Name of the meal people can register for, e.g. "Barbecue"; null when none.
  catering: string | null;
  registrations: Registration[];
}

// Select string shared by the pages that show events with their registrations.
export const EVENT_SELECT = `
  id, title, description, location, starts_at, ends_at, registration_deadline,
  has_tennis, has_padel, max_tennis, max_padel, catering,
  registrations (
    id, member_id, tennis, padel, eats, tennis_since, padel_since, registered_by, created_at,
    member:club_members ( full_name, tennis_singles_ranking, tennis_doubles_ranking, padel_ranking )
  )
`;
