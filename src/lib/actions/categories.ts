'use server';

import { createClient } from '../supabase/server';
import type { Category, CategoryFormData } from '../../types/categories';

// Initial local seed for testing prior to live database trigger
let localCategoriesStore: Category[] = [
  { id: 'cat_1', user_id: 'default', name: 'Food & Dining', icon: 'Utensils', color_index: 5, is_income: false, is_system: true, created_at: new Date().toISOString() },
  { id: 'cat_2', user_id: 'default', name: 'Groceries', icon: 'ShoppingBag', color_index: 4, is_income: false, is_system: true, created_at: new Date().toISOString() },
  { id: 'cat_3', user_id: 'default', name: 'Transport', icon: 'Car', color_index: 1, is_income: false, is_system: true, created_at: new Date().toISOString() },
  { id: 'cat_4', user_id: 'default', name: 'Fuel', icon: 'Fuel', color_index: 6, is_income: false, is_system: true, created_at: new Date().toISOString() },
  { id: 'cat_5', user_id: 'default', name: 'Salary', icon: 'Briefcase', color_index: 1, is_income: true, is_system: true, created_at: new Date().toISOString() },
  { id: 'cat_6', user_id: 'default', name: 'Freelance / Consulting', icon: 'Laptop', color_index: 0, is_income: true, is_system: true, created_at: new Date().toISOString() },
  { id: 'cat_7', user_id: 'default', name: 'Client Payment', icon: 'Building2', color_index: 0, is_income: true, is_system: true, created_at: new Date().toISOString() },
];

export async function getCategories(): Promise<Category[]> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('is_income', { ascending: false })
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        return data;
      }
    }
  } catch {
    // Fall back to localCategoriesStore
  }
  return [...localCategoriesStore];
}

export async function createCategory(data: CategoryFormData): Promise<Category> {
  if (!data.name?.trim()) throw new Error('Category name is required.');

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
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

      if (!error && inserted) return inserted;
    }
  } catch {
    // Continue to local
  }

  const newCat: Category = {
    id: `cat_${Date.now()}`,
    user_id: 'default',
    name: data.name.trim(),
    icon: data.icon || null,
    color_index: data.color_index ?? 0,
    is_income: data.is_income ?? false,
    is_system: false,
    created_at: new Date().toISOString(),
  };
  localCategoriesStore.push(newCat);
  return newCat;
}

export async function updateCategory(
  id: string,
  data: Partial<CategoryFormData>
): Promise<Category> {
  const cat = localCategoriesStore.find((c) => c.id === id);
  if (cat?.is_system) {
    throw new Error('Default system categories cannot be modified.');
  }

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: updated, error } = await supabase
        .from('categories')
        .update(data)
        .eq('id', id)
        .eq('is_system', false)
        .select()
        .single();

      if (!error && updated) return updated;
    }
  } catch {
    // Continue to local
  }

  const idx = localCategoriesStore.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error('Category not found.');

  localCategoriesStore[idx] = { ...localCategoriesStore[idx], ...data };
  return localCategoriesStore[idx];
}

export async function deleteCategory(id: string): Promise<{ success: boolean; error?: string }> {
  const cat = localCategoriesStore.find((c) => c.id === id);
  if (cat?.is_system) {
    return { success: false, error: 'System categories cannot be deleted.' };
  }

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id)
        .eq('is_system', false);

      if (error) return { success: false, error: error.message };
    }
  } catch {
    // Continue to local
  }

  localCategoriesStore = localCategoriesStore.filter((c) => c.id !== id);
  return { success: true };
}
