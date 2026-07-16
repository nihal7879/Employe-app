export interface User {
  id: number;
  name: string;
  email: string;
  role: 'Admin' | 'Employee' | 'Manager';
  allow_backdated_tasks?: boolean;
  allow_log_anytime?: boolean;
}

export interface Employee {
  id: number;
  employee_code: string;
  name: string;
  email: string;
  role_id: number;
  role_name?: string;
  department_id: number;
  department_name?: string;
  designation?: string;
  joining_date?: string;
  phone?: string;
  profile_image?: string;
  is_active: boolean;
  allow_backdated_tasks?: boolean;
  allow_log_anytime?: boolean;
  // Optional expiry for each permission (ISO datetime). null = permanent.
  allow_backdated_until?: string | null;
  allow_log_anytime_until?: string | null;
}

/** Minimal employee shape returned by GET /assigned-tasks/assignees. */
export interface Assignee {
  id: number;
  name: string;
  employee_code: string;
}

export interface Client {
  id: number;
  client_name: string;
  status: string;
  is_active: boolean;
}

export interface Project {
  id: number;
  client_id: number;
  client_name?: string;
  project_code: string;
  project_name: string;
  start_date?: string;
  end_date?: string;
  project_status: string;
  is_active: boolean;
}

export interface Activity {
  id: number;
  activity_name: string;
  is_active: boolean;
}

export interface Department {
  id: number;
  department_name: string;
  is_active: boolean;
}

export type AssignedTaskStatus = 'Open' | 'In Progress' | 'Completed';
export type AssignedTaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface AssignedTaskComment {
  id: number;
  task_id: number;
  author_id: number;
  author_name?: string;
  body: string;
  mentions?: string | null;
  mention_names?: string[];
  created_at: string;
  edited_at?: string | null;
}

export interface AssignedTaskActivity {
  id: number;
  task_id: number;
  actor_id: number;
  actor_name?: string;
  type: 'Created' | 'StatusChanged' | 'Reassigned' | 'Updated' | 'Commented';
  from_value?: string | null;
  to_value?: string | null;
  note?: string | null;
  created_at: string;
}

export interface AssignedTask {
  id: number;
  title: string;
  description?: string;
  assignee_id: number;
  assignee_name?: string;
  assignee_code?: string;
  assigned_by_id: number;
  assigned_by_name?: string;
  client_id?: number | null;
  client_name?: string;
  project_id?: number | null;
  project_name?: string;
  project_code?: string;
  status: AssignedTaskStatus;
  priority: AssignedTaskPriority;
  employee_type?: string | null;
  assigned_date: string;
  start_date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  // NULL until the assignee opens the task — drives the "New" highlight.
  seen_at?: string | null;
  created_at?: string;
  comments?: AssignedTaskComment[];
  activity?: AssignedTaskActivity[];
}

export interface AppNotification {
  id: number;
  recipient_id: number;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  task_id?: number | null;
  is_read: boolean | number;
  created_at: string;
}

export interface DailyTask {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_email?: string;
  employee_code?: string;
  department_name?: string;
  client_id: number;
  client_name?: string;
  project_id: number;
  project_name?: string;
  project_code?: string;
  activity_id: number;
  activity_name?: string;
  hours_spent: number;
  task_title: string;
  description?: string;
  assigned_by?: string;
  reference?: string;
  task_date: string;
  start_time?: string;
  end_time?: string;
  submission_status: 'Submitted' | 'Pending';
  progress_status?: 'Completed' | 'In Progress' | 'Pending';
  is_break?: boolean | number;
  remarks?: string;
  ip_address?: string;
  created_gps?: string;
  created_device?: string;
  created_browser?: string;
  updated_gps?: string;
  updated_device?: string;
  updated_browser?: string;
  created_at?: string;
  // Number of comments on the task (from the list query) — drives the row badge.
  comment_count?: number;
}
