import { createClient } from '../supabase/client';
import type { Category, CategoryFormData } from '../../types/categories';

export async function getCategories(client?: any): Promise<Category[]> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .or(`user_id.eq.${user.id},is_system.eq.true`)
    .order('is_income', { ascending: false })
    .order('name', { ascending: true });

  if (error || !data) {
    console.error('Error fetching categories:', error?.message);
    return [];
  }

  return data;
}

export async function createCategory(
  data: CategoryFormData,
  client?: any
): Promise<Category> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  if (!data.name?.trim()) throw new Error('Category name is required.');

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
    throw new Error(error?.message || 'Failed to create category.');
  }

  return inserted;
}

export async function updateCategory(
  id: string,
  data: Partial<CategoryFormData>,
  client?: any
): Promise<Category> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !existing) {
    throw new Error('Category not found.');
  }

  if (existing.is_system) {
    throw new Error('Default system categories cannot be modified.');
  }

  const updatePayload: Record<string, any> = {};
  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.icon !== undefined) updatePayload.icon = data.icon;
  if (data.color_index !== undefined) updatePayload.color_index = data.color_index;
  if (data.is_income !== undefined) updatePayload.is_income = data.is_income;

  const { data: updated, error } = await supabase
    .from('categories')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_system', false)
    .select()
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Category not found.');
  }

  return updated;
}

export async function deleteCategory(
  id: string,
  client?: any
): Promise<{ success: boolean; error?: string }> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: existing } = await supabase
    .from('categories')
    .select('id, is_system')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing?.is_system) {
    return { success: false, error: 'System categories cannot be deleted.' };
  }

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
