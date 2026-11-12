export interface Category {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color_index: number;
  is_income: boolean;
  is_system: boolean;
  created_at: string;
}

export type CategoryFormData = Omit<Category, 'id' | 'user_id' | 'created_at'>;
