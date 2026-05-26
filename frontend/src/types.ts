export interface User {
  id: number;
  name: string;
  email: string;
  role: 'Admin' | 'Employee';
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
  created_at?: string;
}
