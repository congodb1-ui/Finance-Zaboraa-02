import { createClient } from '../supabase/client';
import type { Workspace, WorkspaceFormData } from '../../types/workspaces';

export async function getWorkspaces(): Promise<Workspace[]> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (error) {
      console.error('Failed to get workspaces:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('getWorkspaces error:', err);
    return [];
  }
}

export async function createWorkspace(data: WorkspaceFormData): Promise<Workspace> {
  if (!data.name?.trim()) throw new Error('Workspace name is required.');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: inserted, error } = await supabase
    .from('workspaces')
    .insert({
      user_id: user.id,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      color_index: data.color_index ?? 0,
    })
    .select()
    .single();

  if (error || !inserted) {
    console.error('Failed to create workspace:', error);
    throw new Error(error?.message || 'Failed to create workspace');
  }

  return inserted;
}

export async function updateWorkspace(
  id: string,
  data: Partial<WorkspaceFormData>
): Promise<Workspace> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: updated, error } = await supabase
    .from('workspaces')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !updated) {
    console.error('Failed to update workspace:', error);
    throw new Error(error?.message || 'Workspace not found');
  }

  return updated;
}

export async function deleteWorkspace(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
