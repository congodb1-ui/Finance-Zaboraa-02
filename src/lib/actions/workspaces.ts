import { createClient } from '../supabase/client';
import type { Workspace, WorkspaceFormData } from '../../types/workspaces';

export async function getWorkspaces(client?: any): Promise<Workspace[]> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (error || !data) {
    console.error('Error fetching workspaces:', error?.message);
    return [];
  }

  return data;
}

export async function createWorkspace(
  data: WorkspaceFormData,
  client?: any
): Promise<Workspace> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  if (!data.name?.trim()) throw new Error('Workspace name is required.');

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
    throw new Error(error?.message || 'Failed to create workspace.');
  }

  return inserted;
}

export async function updateWorkspace(
  id: string,
  data: Partial<WorkspaceFormData>,
  client?: any
): Promise<Workspace> {
  const supabase = client || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.description !== undefined) updatePayload.description = data.description?.trim() || null;
  if (data.color_index !== undefined) updatePayload.color_index = data.color_index;

  const { data: updated, error } = await supabase
    .from('workspaces')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Workspace not found.');
  }

  return updated;
}

export async function deleteWorkspace(
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
