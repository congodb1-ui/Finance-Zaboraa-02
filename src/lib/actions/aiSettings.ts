import { createClient } from '../supabase/client';

export interface AiSettingsRecord {
  id?: string;
  user_id?: string;
  ai_enabled: boolean;
  feature_toggles?: Record<string, boolean>;
  monthly_report_last_run_at?: string | null;
  monthly_report_cache?: Record<string, any> | null;
  dismissed_anomaly_ids?: string[];
  updated_at?: string;
}

export interface AiSettingsUpsertInput {
  ai_enabled?: boolean;
  feature_toggles?: Record<string, boolean>;
  monthly_report_last_run_at?: string | null;
  monthly_report_cache?: Record<string, any> | null;
  dismissed_anomaly_ids?: string[];
}

const AI_SETTINGS_SELECT =
  'id, user_id, ai_enabled, feature_toggles, monthly_report_last_run_at, monthly_report_cache, dismissed_anomaly_ids, updated_at';

export async function getAiSettings(supabaseClient?: any): Promise<AiSettingsRecord> {
  const supabase = supabaseClient || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ai_enabled: true,
      feature_toggles: {},
      monthly_report_last_run_at: null,
      monthly_report_cache: null,
      dismissed_anomaly_ids: [],
    };
  }

  const { data, error } = await supabase
    .from('ai_settings')
    .select(AI_SETTINGS_SELECT)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error('Error fetching AI settings:', error.message);
    }
    return {
      ai_enabled: true,
      feature_toggles: {},
      monthly_report_last_run_at: null,
      monthly_report_cache: null,
      dismissed_anomaly_ids: [],
    };
  }

  return {
    id: data.id,
    user_id: data.user_id,
    ai_enabled: typeof data.ai_enabled === 'boolean' ? data.ai_enabled : true,
    feature_toggles:
      data.feature_toggles && typeof data.feature_toggles === 'object'
        ? data.feature_toggles
        : {},
    monthly_report_last_run_at: data.monthly_report_last_run_at ?? null,
    monthly_report_cache:
      data.monthly_report_cache && typeof data.monthly_report_cache === 'object'
        ? data.monthly_report_cache
        : null,
    dismissed_anomaly_ids: Array.isArray(data.dismissed_anomaly_ids)
      ? data.dismissed_anomaly_ids
      : [],
    updated_at: data.updated_at,
  };
}

export async function upsertAiSettings(
  data: AiSettingsUpsertInput
): Promise<AiSettingsRecord>;
export async function upsertAiSettings(
  supabaseClient: any,
  data: AiSettingsUpsertInput
): Promise<AiSettingsRecord>;
export async function upsertAiSettings(
  clientOrData: any,
  maybeData?: AiSettingsUpsertInput
): Promise<AiSettingsRecord> {
  const isClientProvided = Boolean(
    clientOrData &&
      typeof clientOrData.from === 'function' &&
      clientOrData.auth &&
      typeof clientOrData.auth.getUser === 'function'
  );

  const supabase = isClientProvided ? clientOrData : createClient();
  const input: AiSettingsUpsertInput = (isClientProvided ? maybeData : clientOrData) || {};

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const payload: Record<string, any> = {
    user_id: user.id,
  };

  if (input.ai_enabled !== undefined) {
    payload.ai_enabled = Boolean(input.ai_enabled);
  }
  if (input.feature_toggles !== undefined) {
    payload.feature_toggles = input.feature_toggles || {};
  }
  if (input.monthly_report_last_run_at !== undefined) {
    payload.monthly_report_last_run_at = input.monthly_report_last_run_at;
  }
  if (input.monthly_report_cache !== undefined) {
    payload.monthly_report_cache = input.monthly_report_cache;
  }
  if (input.dismissed_anomaly_ids !== undefined) {
    payload.dismissed_anomaly_ids = Array.isArray(input.dismissed_anomaly_ids)
      ? input.dismissed_anomaly_ids
      : [];
  }

  const { data: updated, error } = await supabase
    .from('ai_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select(AI_SETTINGS_SELECT)
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Failed to save AI settings.');
  }

  return {
    ...updated,
    dismissed_anomaly_ids: Array.isArray(updated.dismissed_anomaly_ids)
      ? updated.dismissed_anomaly_ids
      : [],
  } as AiSettingsRecord;
}
