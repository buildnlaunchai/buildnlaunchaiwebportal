export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          applications_open: boolean
          auto_approve: boolean
          default_plan_id: string | null
          discord_webhook_url: string | null
          id: boolean
          maintenance_mode: boolean
          skool_invite_url: string | null
          trial_days: number
          updated_at: string
        }
        Insert: {
          applications_open?: boolean
          auto_approve?: boolean
          default_plan_id?: string | null
          discord_webhook_url?: string | null
          id?: boolean
          maintenance_mode?: boolean
          skool_invite_url?: string | null
          trial_days?: number
          updated_at?: string
        }
        Update: {
          applications_open?: boolean
          auto_approve?: boolean
          default_plan_id?: string | null
          discord_webhook_url?: string | null
          id?: boolean
          maintenance_mode?: boolean
          skool_invite_url?: string | null
          trial_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_default_plan_id_fkey"
            columns: ["default_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          admin_note: string | null
          company: string | null
          country: string | null
          created_at: string
          email: string
          full_name: string
          heard_from: string | null
          id: string
          referral_code: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          role_title: string | null
          socials: string | null
          status: Database["public"]["Enums"]["application_status"]
          tools_wanted: string[] | null
          use_case: string
          user_id: string
          website_url: string | null
          willingness_to_pay: string | null
        }
        Insert: {
          admin_note?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          email: string
          full_name: string
          heard_from?: string | null
          id?: string
          referral_code?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role_title?: string | null
          socials?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          tools_wanted?: string[] | null
          use_case: string
          user_id: string
          website_url?: string | null
          willingness_to_pay?: string | null
        }
        Update: {
          admin_note?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          email?: string
          full_name?: string
          heard_from?: string | null
          id?: string
          referral_code?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role_title?: string | null
          socials?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          tools_wanted?: string[] | null
          use_case?: string
          user_id?: string
          website_url?: string | null
          willingness_to_pay?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          target_user: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          target_user?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          target_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_target_user_fkey"
            columns: ["target_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          is_gift: boolean
          plan_id: string | null
          provider: string | null
          provider_subscription_id: string | null
          source: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          is_gift?: boolean
          plan_id?: string | null
          provider?: string | null
          provider_subscription_id?: string | null
          source?: string | null
          started_at?: string | null
          status: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          is_gift?: boolean
          plan_id?: string | null
          provider?: string | null
          provider_subscription_id?: string | null
          source?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_tools: {
        Row: {
          plan_id: string
          tool_id: string
        }
        Insert: {
          plan_id: string
          tool_id: string
        }
        Update: {
          plan_id?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_tools_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          max_runs_per_day: number | null
          name: string
          price_monthly: number
          provider: string | null
          provider_price_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          max_runs_per_day?: number | null
          name: string
          price_monthly?: number
          provider?: string | null
          provider_price_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          max_runs_per_day?: number | null
          name?: string
          price_monthly?: number
          provider?: string | null
          provider_price_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_suspended: boolean
          onboarded_at: string | null
          referral_code: string | null
          referred_by: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_suspended?: boolean
          onboarded_at?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_suspended?: boolean
          onboarded_at?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: number
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      tool_runs: {
        Row: {
          artifacts_expire_at: string | null
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          expires_at: string | null
          id: string
          input: Json
          output: Json | null
          providers_used: Database["public"]["Enums"]["api_provider"][]
          status: Database["public"]["Enums"]["run_status"]
          tool_id: string
          user_id: string
        }
        Insert: {
          artifacts_expire_at?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          input?: Json
          output?: Json | null
          providers_used?: Database["public"]["Enums"]["api_provider"][]
          status?: Database["public"]["Enums"]["run_status"]
          tool_id: string
          user_id: string
        }
        Update: {
          artifacts_expire_at?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          input?: Json
          output?: Json | null
          providers_used?: Database["public"]["Enums"]["api_provider"][]
          status?: Database["public"]["Enums"]["run_status"]
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_runs_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_secrets: {
        Row: {
          embed_url: string | null
          external_url: string | null
          function_name: string | null
          tool_id: string
          updated_at: string
        }
        Insert: {
          embed_url?: string | null
          external_url?: string | null
          function_name?: string | null
          tool_id: string
          updated_at?: string
        }
        Update: {
          embed_url?: string | null
          external_url?: string | null
          function_name?: string | null
          tool_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_secrets_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: true
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          access_type: Database["public"]["Enums"]["tool_access_type"]
          category: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          input_schema: Json
          internal_key: string | null
          launched_at: string | null
          name: string
          output_schema: Json
          rate_limit_per_day: number | null
          required_providers: Database["public"]["Enums"]["api_provider"][]
          runtime: Database["public"]["Enums"]["tool_runtime"]
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["tool_status"]
          tagline: string
          timeout_seconds: number
          updated_at: string
          version: string | null
          video_url: string | null
        }
        Insert: {
          access_type?: Database["public"]["Enums"]["tool_access_type"]
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          input_schema?: Json
          internal_key?: string | null
          launched_at?: string | null
          name: string
          output_schema?: Json
          rate_limit_per_day?: number | null
          required_providers?: Database["public"]["Enums"]["api_provider"][]
          runtime?: Database["public"]["Enums"]["tool_runtime"]
          slug: string
          sort_order?: number
          status?: Database["public"]["Enums"]["tool_status"]
          tagline: string
          timeout_seconds?: number
          updated_at?: string
          version?: string | null
          video_url?: string | null
        }
        Update: {
          access_type?: Database["public"]["Enums"]["tool_access_type"]
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          input_schema?: Json
          internal_key?: string | null
          launched_at?: string | null
          name?: string
          output_schema?: Json
          rate_limit_per_day?: number | null
          required_providers?: Database["public"]["Enums"]["api_provider"][]
          runtime?: Database["public"]["Enums"]["tool_runtime"]
          slug?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["tool_status"]
          tagline?: string
          timeout_seconds?: number
          updated_at?: string
          version?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          auth_tag: string
          ciphertext: string
          created_at: string
          id: string
          iv: string
          key_hint: string
          label: string | null
          last_used_at: string | null
          last_verified_at: string | null
          provider: Database["public"]["Enums"]["api_provider"]
          status: Database["public"]["Enums"]["key_status"]
          user_id: string
        }
        Insert: {
          auth_tag: string
          ciphertext: string
          created_at?: string
          id?: string
          iv: string
          key_hint: string
          label?: string | null
          last_used_at?: string | null
          last_verified_at?: string | null
          provider: Database["public"]["Enums"]["api_provider"]
          status?: Database["public"]["Enums"]["key_status"]
          user_id: string
        }
        Update: {
          auth_tag?: string
          ciphertext?: string
          created_at?: string
          id?: string
          iv?: string
          key_hint?: string
          label?: string | null
          last_used_at?: string | null
          last_verified_at?: string | null
          provider?: Database["public"]["Enums"]["api_provider"]
          status?: Database["public"]["Enums"]["key_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tool_access: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          source: Database["public"]["Enums"]["grant_source"]
          tool_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          source?: Database["public"]["Enums"]["grant_source"]
          tool_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          source?: Database["public"]["Enums"]["grant_source"]
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tool_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tool_access_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tool_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      app_settings_public: {
        Row: {
          applications_open: boolean | null
          maintenance_mode: boolean | null
        }
        Insert: {
          applications_open?: boolean | null
          maintenance_mode?: boolean | null
        }
        Update: {
          applications_open?: boolean | null
          maintenance_mode?: boolean | null
        }
        Relationships: []
      }
      user_api_keys_public: {
        Row: {
          created_at: string | null
          id: string | null
          key_hint: string | null
          label: string | null
          last_used_at: string | null
          last_verified_at: string | null
          provider: Database["public"]["Enums"]["api_provider"] | null
          status: Database["public"]["Enums"]["key_status"] | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          key_hint?: string | null
          label?: string | null
          last_used_at?: string | null
          last_verified_at?: string | null
          provider?: Database["public"]["Enums"]["api_provider"] | null
          status?: Database["public"]["Enums"]["key_status"] | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          key_hint?: string | null
          label?: string | null
          last_used_at?: string | null
          last_verified_at?: string | null
          provider?: Database["public"]["Enums"]["api_provider"] | null
          status?: Database["public"]["Enums"]["key_status"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accessible_tool_ids: { Args: { uid?: string }; Returns: string[] }
      approve_application: {
        Args: { p_application_id: string; p_expires_at?: string }
        Returns: string
      }
      can_access_tool: {
        Args: { p_tool_id: string; uid?: string }
        Returns: boolean
      }
      has_active_membership: { Args: { uid?: string }; Returns: boolean }
      has_required_keys: {
        Args: { p_tool_id: string; uid?: string }
        Returns: boolean
      }
      is_admin: { Args: { uid?: string }; Returns: boolean }
      log_audit: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_type?: string
          p_metadata?: Json
          p_target_user?: string
        }
        Returns: undefined
      }
      rate_limit_take: {
        Args: { p_bucket: string; p_limit: number; p_window: string }
        Returns: boolean
      }
    }
    Enums: {
      api_provider:
        | "openai"
        | "anthropic"
        | "google_ai"
        | "openrouter"
        | "elevenlabs"
        | "replicate"
        | "fal"
        | "perplexity"
        | "serper"
        | "apify"
        | "youtube_data"
        | "custom"
      application_status: "pending" | "approved" | "waitlisted" | "rejected"
      grant_source: "global" | "plan" | "manual" | "code"
      key_status: "unverified" | "valid" | "invalid"
      membership_status: "trialing" | "active" | "expired" | "revoked"
      run_status: "queued" | "running" | "success" | "error" | "timeout"
      tool_access_type: "public_preview" | "members" | "plan" | "manual"
      tool_runtime: "edge_function" | "internal" | "iframe" | "external_link"
      tool_status:
        | "draft"
        | "coming_soon"
        | "published"
        | "maintenance"
        | "archived"
      user_role: "member" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      api_provider: [
        "openai",
        "anthropic",
        "google_ai",
        "openrouter",
        "elevenlabs",
        "replicate",
        "fal",
        "perplexity",
        "serper",
        "apify",
        "youtube_data",
        "custom",
      ],
      application_status: ["pending", "approved", "waitlisted", "rejected"],
      grant_source: ["global", "plan", "manual", "code"],
      key_status: ["unverified", "valid", "invalid"],
      membership_status: ["trialing", "active", "expired", "revoked"],
      run_status: ["queued", "running", "success", "error", "timeout"],
      tool_access_type: ["public_preview", "members", "plan", "manual"],
      tool_runtime: ["edge_function", "internal", "iframe", "external_link"],
      tool_status: [
        "draft",
        "coming_soon",
        "published",
        "maintenance",
        "archived",
      ],
      user_role: ["member", "admin"],
    },
  },
} as const
