export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color_index: number;
  created_at: string;
  updated_at: string;
}

export type WorkspaceFormData = Omit<Workspace, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
