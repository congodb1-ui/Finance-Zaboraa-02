import { createClient } from '../supabase/client';
import type { Category, CategoryFormData } from '../../types/categories';

export async function getCategories(): Promise<Category[]> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Query categories (system categories are available to authenticated users, plus user's custom categories)
    let query = supabase
      .from('categories')
      .select('*')
      .order('is_income', { ascending: false })
      .order('name', { ascending: true });

    if (user) {
      query = query.or(`is_system.eq.true,user_id.eq.${user.id}`);
    } else {
      query = query.eq('is_system', true);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Failed to get categories:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('getCategories error:', err);
    return [];
  }
}

export async function createCategory(data: CategoryFormData): Promise<Category> {
  if (!data.name?.trim()) throw new Error('Category name is required.');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: inserted, error } = await supabase
    .from('categories')
    .insert({
      user_id: user.id,
      name: data.name.trim(),
      icon: data.icon || null,
      color_index: data.color_index ?? 0,
      is_income: data.is_income ?? false,
      is_system: false,
    })
    .select()
    .single();

  if (error || !inserted) {
    console.error('Failed to create category:', error);
    throw new Error(error?.message || 'Failed to create category');
  }

  return inserted;
}

export async function updateCategory(
  id: string,
  data: Partial<CategoryFormData>
): Promise<Category> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: updated, error } = await supabase
    .from('categories')
    .update({
      ...data,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_system', false)
    .select()
    .single();

  if (error || !updated) {
    console.error('Failed to update category:', error);
    throw new Error(error?.message || 'Default system categories cannot be modified or category not found.');
  }

  return updated;
}

export async function deleteCategory(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_system', false);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
