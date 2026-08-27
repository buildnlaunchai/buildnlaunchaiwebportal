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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      access_code_redemptions: {
        Row: {
          code_id: string
          id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          code_id: string
          id?: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          code_id?: string
          id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_code_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "access_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_code_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          duration_days: number | null
          expires_at: string | null
          id: string
          kind: Database["public"]["Enums"]["code_kind"]
          max_uses: number
          note: string | null
          plan_id: string | null
          tool_ids: string[] | null
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          duration_days?: number | null
          expires_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["code_kind"]
          max_uses?: number
          note?: string | null
          plan_id?: string | null
          tool_ids?: string[] | null
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          duration_days?: number | null
          expires_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["code_kind"]
          max_uses?: number
          note?: string | null
          plan_id?: string | null
          tool_ids?: string[] | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "access_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_codes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          published_at: string | null
          title: string
          tool_id: string | null
          variant: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          title: string
          tool_id?: string | null
          variant?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          title?: string
          tool_id?: string | null
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          applications_open: boolean
          auto_approve: boolean
          default_plan_id: string | null
          discord_webhook_url: string | null
          id: boolean
          logo_url: string | null
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
          logo_url?: string | null
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
          logo_url?: string | null
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
      credit_balances: {
        Row: {
          balance: number
          held: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          held?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          held?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_holds: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          max_credits: number
          note: string | null
          resolved_at: string | null
          run_id: string | null
          settled_ledger_id: string | null
          status: Database["public"]["Enums"]["credit_hold_status"]
          tool_id: string | null
          tool_slug: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          max_credits: number
          note?: string | null
          resolved_at?: string | null
          run_id?: string | null
          settled_ledger_id?: string | null
          status?: Database["public"]["Enums"]["credit_hold_status"]
          tool_id?: string | null
          tool_slug?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          max_credits?: number
          note?: string | null
          resolved_at?: string | null
          run_id?: string | null
          settled_ledger_id?: string | null
          status?: Database["public"]["Enums"]["credit_hold_status"]
          tool_id?: string | null
          tool_slug?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_holds_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tool_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_holds_settled_ledger_id_fkey"
            columns: ["settled_ledger_id"]
            isOneToOne: false
            referencedRelation: "credit_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_holds_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_holds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          actor_id: string | null
          balance_after: number
          created_at: string
          credit_usd_value_at: number
          credits: number
          hold_id: string | null
          id: string
          kind: Database["public"]["Enums"]["credit_entry_kind"]
          lot_id: string | null
          margin_multiplier_at: number
          model: string | null
          note: string | null
          provider: Database["public"]["Enums"]["api_provider"] | null
          provider_cost_usd: number | null
          reference: string | null
          run_id: string | null
          source: string | null
          tool_id: string | null
          tool_slug: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          balance_after: number
          created_at?: string
          credit_usd_value_at: number
          credits: number
          hold_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["credit_entry_kind"]
          lot_id?: string | null
          margin_multiplier_at: number
          model?: string | null
          note?: string | null
          provider?: Database["public"]["Enums"]["api_provider"] | null
          provider_cost_usd?: number | null
          reference?: string | null
          run_id?: string | null
          source?: string | null
          tool_id?: string | null
          tool_slug?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          balance_after?: number
          created_at?: string
          credit_usd_value_at?: number
          credits?: number
          hold_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["credit_entry_kind"]
          lot_id?: string | null
          margin_multiplier_at?: number
          model?: string | null
          note?: string | null
          provider?: Database["public"]["Enums"]["api_provider"] | null
          provider_cost_usd?: number | null
          reference?: string | null
          run_id?: string | null
          source?: string | null
          tool_id?: string | null
          tool_slug?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_hold_fk"
            columns: ["hold_id"]
            isOneToOne: false
            referencedRelation: "credit_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_lot_fk"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "credit_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tool_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_lots: {
        Row: {
          created_at: string
          credits_remaining: number
          credits_total: number
          expires_at: string
          id: string
          ledger_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_remaining: number
          credits_total: number
          expires_at: string
          id?: string
          ledger_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_remaining?: number
          credits_total?: number
          expires_at?: string
          id?: string
          ledger_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_lots_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "credit_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_lots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_settings: {
        Row: {
          credit_mode_enabled: boolean
          credit_usd_value: number
          expiry_months: number
          id: boolean
          margin_multiplier: number
          max_concurrent_holds: number
          per_call_max_credits: number
          per_user_daily_max_credits: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          credit_mode_enabled?: boolean
          credit_usd_value?: number
          expiry_months?: number
          id?: boolean
          margin_multiplier?: number
          max_concurrent_holds?: number
          per_call_max_credits?: number
          per_user_daily_max_credits?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          credit_mode_enabled?: boolean
          credit_usd_value?: number
          expiry_months?: number
          id?: boolean
          margin_multiplier?: number
          max_concurrent_holds?: number
          per_call_max_credits?: number
          per_user_daily_max_credits?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creem_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      feature_request_votes: {
        Row: {
          created_at: string
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_request_votes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "feature_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_request_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          body: string | null
          created_at: string
          id: string
          shipped_tool_id: string | null
          status: string
          title: string
          user_id: string
          vote_count: number
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          shipped_tool_id?: string | null
          status?: string
          title: string
          user_id: string
          vote_count?: number
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          shipped_tool_id?: string | null
          status?: string
          title?: string
          user_id?: string
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "feature_requests_shipped_tool_id_fkey"
            columns: ["shipped_tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      key_release_consent: {
        Row: {
          granted_at: string
          id: string
          provider: Database["public"]["Enums"]["api_provider"]
          revoked_at: string | null
          tool_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          provider: Database["public"]["Enums"]["api_provider"]
          revoked_at?: string | null
          tool_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["api_provider"]
          revoked_at?: string | null
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_release_consent_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_release_consent_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      key_release_log: {
        Row: {
          created_at: string
          id: string
          provider: Database["public"]["Enums"]["api_provider"]
          tool_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider: Database["public"]["Enums"]["api_provider"]
          tool_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["api_provider"]
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_release_log_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_release_log_user_id_fkey"
            columns: ["user_id"]
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
          grandfathered_at: string | null
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
          grandfathered_at?: string | null
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
          grandfathered_at?: string | null
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          href: string | null
          id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paddle_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
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
          credit_mode_override: boolean | null
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
          credit_mode_override?: boolean | null
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
          credit_mode_override?: boolean | null
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
      provider_model_prices: {
        Row: {
          created_at: string
          id: string
          input_usd_per_unit: number
          is_active: boolean
          model: string
          output_usd_per_unit: number
          provider: Database["public"]["Enums"]["api_provider"]
          review_after: string | null
          source_note: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_usd_per_unit: number
          is_active?: boolean
          model: string
          output_usd_per_unit?: number
          provider: Database["public"]["Enums"]["api_provider"]
          review_after?: string | null
          source_note?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          input_usd_per_unit?: number
          is_active?: boolean
          model?: string
          output_usd_per_unit?: number
          provider?: Database["public"]["Enums"]["api_provider"]
          review_after?: string | null
          source_note?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
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
      tool_interest: {
        Row: {
          created_at: string
          tool_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tool_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_interest_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_interest_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          consumes_credit: boolean
          cover_image_url: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          input_schema: Json
          internal_key: string | null
          is_featured: boolean
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
          consumes_credit?: boolean
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          input_schema?: Json
          internal_key?: string | null
          is_featured?: boolean
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
          consumes_credit?: boolean
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          input_schema?: Json
          internal_key?: string | null
          is_featured?: boolean
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
          logo_url: string | null
          maintenance_mode: boolean | null
        }
        Insert: {
          applications_open?: boolean | null
          logo_url?: string | null
          maintenance_mode?: boolean | null
        }
        Update: {
          applications_open?: boolean | null
          logo_url?: string | null
          maintenance_mode?: boolean | null
        }
        Relationships: []
      }
      credit_settings_public: {
        Row: {
          credit_mode_enabled: boolean | null
          credit_usd_value: number | null
          expiry_months: number | null
        }
        Insert: {
          credit_mode_enabled?: boolean | null
          credit_usd_value?: number | null
          expiry_months?: number | null
        }
        Update: {
          credit_mode_enabled?: boolean | null
          credit_usd_value?: number | null
          expiry_months?: number | null
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
      accessible_tool_modes: {
        Args: { uid?: string }
        Returns: {
          mode: Database["public"]["Enums"]["tool_access_mode"]
          tool_id: string
        }[]
      }
      approve_application: {
        Args: { p_application_id: string; p_expires_at?: string }
        Returns: string
      }
      can_access_tool: {
        Args: { p_tool_id: string; uid?: string }
        Returns: boolean
      }
      claim_referral: { Args: { p_code: string }; Returns: Json }
      credit_admin_adjust: {
        Args: {
          p_actor?: string
          p_credits: number
          p_note?: string
          p_user_id: string
        }
        Returns: string
      }
      credit_available: { Args: { uid?: string }; Returns: number }
      credit_consume_fifo: {
        Args: {
          p_actor?: string
          p_balance_before: number
          p_credits: number
          p_hold_id?: string
          p_kind: Database["public"]["Enums"]["credit_entry_kind"]
          p_model?: string
          p_note?: string
          p_provider?: Database["public"]["Enums"]["api_provider"]
          p_provider_cost_usd?: number
          p_run_id?: string
          p_source?: string
          p_tool_id?: string
          p_tool_slug?: string
          p_user_id: string
        }
        Returns: {
          consumed: number
          first_ledger_id: string
        }[]
      }
      credit_denial_reason: {
        Args: { p_tool_id: string; uid?: string }
        Returns: string
      }
      credit_hold_open: {
        Args: {
          p_max_credits: number
          p_run_id?: string
          p_tool_id: string
          p_ttl_seconds?: number
          p_user_id: string
        }
        Returns: {
          available: number
          hold_id: string
          status: string
        }[]
      }
      credit_hold_release: {
        Args: { p_hold_id: string; p_reason?: string }
        Returns: string
      }
      credit_hold_settle: {
        Args: {
          p_hold_id: string
          p_model?: string
          p_provider?: Database["public"]["Enums"]["api_provider"]
          p_provider_cost_usd?: number
          p_run_id?: string
        }
        Returns: string
      }
      credit_holds_sweep: { Args: never; Returns: number }
      credit_lots_expire: { Args: never; Returns: number }
      credit_mode_for: { Args: { uid: string }; Returns: boolean }
      credit_quote: { Args: { p_provider_cost_usd: number }; Returns: number }
      credit_refund: {
        Args: { p_actor?: string; p_ledger_id: string; p_note?: string }
        Returns: string
      }
      credit_set_mode_override: {
        Args: { p_user_id: string; p_value: boolean }
        Returns: Json
      }
      credit_topup: {
        Args: {
          p_credits: number
          p_note?: string
          p_reference?: string
          p_source?: string
          p_user_id: string
        }
        Returns: string
      }
      has_active_membership: { Args: { uid?: string }; Returns: boolean }
      has_desktop_consent: {
        Args: {
          p_provider: Database["public"]["Enums"]["api_provider"]
          p_tool_id: string
          uid?: string
        }
        Returns: boolean
      }
      has_key_release_consent: {
        Args: {
          p_provider: Database["public"]["Enums"]["api_provider"]
          p_tool_id: string
          uid?: string
        }
        Returns: boolean
      }
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
      prices_needing_review: {
        Args: never
        Returns: {
          model: string
          provider: Database["public"]["Enums"]["api_provider"]
          review_after: string
          source_note: string
        }[]
      }
      process_creem_event: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_subscription_id: string
          p_user_id: string
        }
        Returns: string
      }
      process_paddle_event: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_subscription_id: string
          p_user_id: string
        }
        Returns: string
      }
      rate_limit_take: {
        Args: { p_bucket: string; p_limit: number; p_window: string }
        Returns: boolean
      }
      redeem_access_code: { Args: { p_code: string }; Returns: Json }
      tool_access: {
        Args: { p_tool_id: string; uid?: string }
        Returns: Database["public"]["Enums"]["tool_access_mode"]
      }
      tool_access_resolve: {
        Args: { p_tool_id: string; uid?: string }
        Returns: Database["public"]["Enums"]["tool_access_mode"]
      }
      tool_public_stats: {
        Args: { p_tool_id: string }
        Returns: {
          avg_ms: number
          run_count: number
        }[]
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
      code_kind: "membership" | "tool_access"
      credit_entry_kind:
        | "topup"
        | "debit"
        | "refund"
        | "expiry"
        | "admin_adjustment"
      credit_hold_status: "open" | "settled" | "released" | "expired"
      grant_source: "global" | "plan" | "manual" | "code"
      key_status: "unverified" | "valid" | "invalid"
      membership_status: "trialing" | "active" | "expired" | "revoked"
      run_status: "queued" | "running" | "success" | "error" | "timeout"
      tool_access_mode: "none" | "byok" | "credit"
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
      code_kind: ["membership", "tool_access"],
      credit_entry_kind: [
        "topup",
        "debit",
        "refund",
        "expiry",
        "admin_adjustment",
      ],
      credit_hold_status: ["open", "settled", "released", "expired"],
      grant_source: ["global", "plan", "manual", "code"],
      key_status: ["unverified", "valid", "invalid"],
      membership_status: ["trialing", "active", "expired", "revoked"],
      run_status: ["queued", "running", "success", "error", "timeout"],
      tool_access_mode: ["none", "byok", "credit"],
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
