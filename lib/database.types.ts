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
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { uid?: string }; Returns: boolean }
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
      grant_source: "global" | "plan" | "manual" | "code"
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
      grant_source: ["global", "plan", "manual", "code"],
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
