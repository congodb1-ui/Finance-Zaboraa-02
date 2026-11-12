'use server';

import { createClient } from '../supabase/server';
import type { Workspace, WorkspaceFormData } from '../../types/workspaces';

let localWorkspacesStore: Workspace[] = [
  {
    id: 'ws_personal',
    user_id: 'default',
    name: 'Personal',
    description: 'Personal lifestyle, household bills, groceries and investments',
    color_index: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'ws_business',
    user_id: 'default',
    name: 'Business',
    description: 'Freelance consulting, professional retainers, office rent and vendors',
    color_index: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export async function getWorkspaces(): Promise<Workspace[]> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) return data;
    }
  } catch {
    // Continue
  }
  return [...localWorkspacesStore];
}

export async function createWorkspace(data: WorkspaceFormData): Promise<Workspace> {
  if (!data.name?.trim()) throw new Error('Workspace name is required.');

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
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

      if (!error && inserted) return inserted;
    }
  } catch {
    // Continue
  }

  const newWs: Workspace = {
    id: `ws_${Date.now()}`,
    user_id: 'default',
    name: data.name.trim(),
    description: data.description?.trim() || null,
    color_index: data.color_index ?? 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  localWorkspacesStore.push(newWs);
  return newWs;
}

export async function updateWorkspace(
  id: string,
  data: Partial<WorkspaceFormData>
): Promise<Workspace> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: updated, error } = await supabase
        .from('workspaces')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (!error && updated) return updated;
    }
  } catch {
    // Continue
  }

  const idx = localWorkspacesStore.findIndex((w) => w.id === id);
  if (idx === -1) throw new Error('Workspace not found.');

  localWorkspacesStore[idx] = {
    ...localWorkspacesStore[idx],
    ...data,
    updated_at: new Date().toISOString(),
  };
  return localWorkspacesStore[idx];
}

export async function deleteWorkspace(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { error } = await supabase.from('workspaces').delete().eq('id', id);
      if (error) return { success: false, error: error.message };
    }
  } catch {
    // Continue
  }

  localWorkspacesStore = localWorkspacesStore.filter((w) => w.id !== id);
  return { success: true };
}
