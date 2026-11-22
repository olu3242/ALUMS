export type Community = {
  id: string; slug: string; name: string; department_name: string; graduation_year: number;
  institution_id: string | null; status: "pending_verification" | "active" | "archived"; is_founding: boolean;
  description: string | null; institutions?: { name: string; status: string } | null;
};
export type Membership = { id: string; community_id: string; status: "active" | "suspended" | "left"; verified_at: string; class_communities: Community };
export type MembershipRequest = { id: string; community_id: string; status: string; created_at: string; decision_note: string | null; class_communities: Pick<Community, "name" | "slug"> | null };
export type Profile = {
  id: string; full_name: string; name_at_graduation: string | null; headline: string | null; about: string | null;
  profession: string | null; industry: string | null; employer: string | null; job_title: string | null;
  contact_email: string | null; phone: string | null; linkedin_url: string | null; website_url: string | null;
  open_to_mentoring: boolean; directory_listed: boolean; visibility: Record<string, string>;
};
export type AdminScope = { scope_type: "platform" | "institution" | "community"; scope_id: string | null; label: string; roles: string[]; max_rank: number };
