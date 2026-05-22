export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  linkedin: string;
  education: string;
  target_role: string;
  target_location: string;
  seniority: string;
  salary_expectation: string;
  work_authorization: string;
  target_companies: string;
  cv_url: string;
  cv_text: string;
  plan: "free" | "paid";
  stripe_customer_id: string;
  stripe_subscription_id: string;
  daily_refreshes_used: number;
  daily_refreshes_reset_at: string | null;
  created_at: string;
}

export interface ApplicationStep {
  name: string;
  detail: string;
  fields: string[];
}

export interface Job {
  id: string;
  user_id: string;
  adzuna_id: string;
  company: string;
  role: string;
  location: string;
  score: number;
  score_rationale: string;
  portal: string;
  needs_login: boolean;
  steps: number;
  estimated_time: string;
  status: "new" | "open" | "closing" | "closed";
  kit_ready: boolean;
  url: string;
  description: string;
  posted_date: string;
  closed_date: string | null;
  last_checked: string | null;
  created_at: string;
  application_flow?: ApplicationStep[];
  tip?: string;
}

export interface Kit {
  id: string;
  job_id: string;
  user_id: string;
  cover_letter: string;
  tailored_cv: string;
  personal_info: Record<string, string>;
  screening_answers: { question: string; answer: string }[];
  skills_gap: { skill: string; tip: string }[];
  preview_data: Record<string, unknown>;
  generated_at: string;
}

export interface JobInsights {
  id: string;
  job_id: string;
  user_id: string;
  key_skills: { skill: string; required: boolean; description: string }[];
  company_mission: string;
  word_cloud: { word: string; count: number }[];
  gap_analysis: { skill: string; have: boolean; gap_level: "strong" | "partial" | "missing"; action: string }[];
  suggested_insights: { title: string; content: string }[];
  research_topics: { topic: string; why: string }[];
  generated_at: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Anecdote {
  id: string;
  user_id: string;
  company: string;
  job_title: string;
  date_range: string;
  situation_bullets: string[];
  task_bullets: string[];
  action_bullets: string[];
  result_bullets: string[];
  long_term_implications: string;
  skill_tags: string[];
  status: "in_process" | "approved";
  conversation_history: ConversationMessage[];
  created_at: string;
  updated_at: string;
}

export interface NetworkContact {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  connection_source: string;
  last_interaction: string | null;
  discussion_notes: string;
  created_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  job_id: string;
  kit_id: string | null;
  company: string;
  role: string;
  portal: string;
  applied_date: string;
  posting_status: "open" | "closed" | "unknown";
  application_status:
    | "applied"
    | "interviewing"
    | "offer"
    | "rejected"
    | "withdrawn";
  follow_up_sent: boolean;
  follow_up_message: string | null;
  last_checked: string | null;
  created_at: string;
}
