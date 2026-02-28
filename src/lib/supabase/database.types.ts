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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      celebrities: {
        Row: {
          created_at: string
          hero_asset_id: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          primary_archetype: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          hero_asset_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          primary_archetype?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          hero_asset_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          primary_archetype?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "celebrities_hero_asset_id_fkey"
            columns: ["hero_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      celebrity_look_embeddings: {
        Row: {
          celebrity_look_id: string
          created_at: string
          embedding: string
          embedding_model: string
          id: string
        }
        Insert: {
          celebrity_look_id: string
          created_at?: string
          embedding: string
          embedding_model?: string
          id?: string
        }
        Update: {
          celebrity_look_id?: string
          created_at?: string
          embedding?: string
          embedding_model?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "celebrity_look_embeddings_celebrity_look_id_fkey"
            columns: ["celebrity_look_id"]
            isOneToOne: true
            referencedRelation: "admin_look_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebrity_look_embeddings_celebrity_look_id_fkey"
            columns: ["celebrity_look_id"]
            isOneToOne: true
            referencedRelation: "celebrity_looks"
            referencedColumns: ["id"]
          },
        ]
      }
      celebrity_looks: {
        Row: {
          canonical_text: string | null
          celebrity_id: string
          created_at: string
          display_asset_id: string | null
          id: string
          image_url: string | null
          ingest_error: string | null
          ingest_status: Database["public"]["Enums"]["ingest_status"]
          ingested_at: string | null
          is_active: boolean
          source_asset_id: string | null
          style_profile: Json
          updated_at: string
        }
        Insert: {
          canonical_text?: string | null
          celebrity_id: string
          created_at?: string
          display_asset_id?: string | null
          id?: string
          image_url?: string | null
          ingest_error?: string | null
          ingest_status?: Database["public"]["Enums"]["ingest_status"]
          ingested_at?: string | null
          is_active?: boolean
          source_asset_id?: string | null
          style_profile?: Json
          updated_at?: string
        }
        Update: {
          canonical_text?: string | null
          celebrity_id?: string
          created_at?: string
          display_asset_id?: string | null
          id?: string
          image_url?: string | null
          ingest_error?: string | null
          ingest_status?: Database["public"]["Enums"]["ingest_status"]
          ingested_at?: string | null
          is_active?: boolean
          source_asset_id?: string | null
          style_profile?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "celebrity_looks_celebrity_id_fkey"
            columns: ["celebrity_id"]
            isOneToOne: false
            referencedRelation: "admin_celebrity_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebrity_looks_celebrity_id_fkey"
            columns: ["celebrity_id"]
            isOneToOne: false
            referencedRelation: "celebrities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebrity_looks_display_asset_id_fkey"
            columns: ["display_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebrity_looks_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          bucket: string
          bytes: number | null
          created_at: string
          created_by: string | null
          height: number | null
          id: string
          license_note: string | null
          mime_type: string | null
          notes: string | null
          object_path: string
          sha256: string | null
          source_kind: string | null
          source_url: string | null
          title: string | null
          visibility: Database["public"]["Enums"]["asset_visibility"]
          width: number | null
        }
        Insert: {
          bucket: string
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          license_note?: string | null
          mime_type?: string | null
          notes?: string | null
          object_path: string
          sha256?: string | null
          source_kind?: string | null
          source_url?: string | null
          title?: string | null
          visibility: Database["public"]["Enums"]["asset_visibility"]
          width?: number | null
        }
        Update: {
          bucket?: string
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          license_note?: string | null
          mime_type?: string | null
          notes?: string | null
          object_path?: string
          sha256?: string | null
          source_kind?: string | null
          source_url?: string | null
          title?: string | null
          visibility?: Database["public"]["Enums"]["asset_visibility"]
          width?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          aesthetic_archetype: string | null
          avoid_brands: string[] | null
          budget_tier: string | null
          celebrity_look_map: Json | null
          created_at: string | null
          display_name: string | null
          favorite_celebrities: string[] | null
          fit_preference: string | null
          id: string
          inseam: number | null
          is_admin: boolean
          jean_style_preferences: string[] | null
          lifestyle_context: Json | null
          rise_preference: string | null
          stretch_preference: string | null
          taste_clamp_max: number
          taste_clamp_min: number
          taste_decay: number
          taste_keywords: string[] | null
          taste_last_updated_at: string | null
          taste_vector: Json | null
          taste_version: number | null
          updated_at: string | null
          vibe_default: string | null
          waist: number | null
          wash_preference: string[] | null
        }
        Insert: {
          aesthetic_archetype?: string | null
          avoid_brands?: string[] | null
          budget_tier?: string | null
          celebrity_look_map?: Json | null
          created_at?: string | null
          display_name?: string | null
          favorite_celebrities?: string[] | null
          fit_preference?: string | null
          id: string
          inseam?: number | null
          is_admin?: boolean
          jean_style_preferences?: string[] | null
          lifestyle_context?: Json | null
          rise_preference?: string | null
          stretch_preference?: string | null
          taste_clamp_max?: number
          taste_clamp_min?: number
          taste_decay?: number
          taste_keywords?: string[] | null
          taste_last_updated_at?: string | null
          taste_vector?: Json | null
          taste_version?: number | null
          updated_at?: string | null
          vibe_default?: string | null
          waist?: number | null
          wash_preference?: string[] | null
        }
        Update: {
          aesthetic_archetype?: string | null
          avoid_brands?: string[] | null
          budget_tier?: string | null
          celebrity_look_map?: Json | null
          created_at?: string | null
          display_name?: string | null
          favorite_celebrities?: string[] | null
          fit_preference?: string | null
          id?: string
          inseam?: number | null
          is_admin?: boolean
          jean_style_preferences?: string[] | null
          lifestyle_context?: Json | null
          rise_preference?: string | null
          stretch_preference?: string | null
          taste_clamp_max?: number
          taste_clamp_min?: number
          taste_decay?: number
          taste_keywords?: string[] | null
          taste_last_updated_at?: string | null
          taste_vector?: Json | null
          taste_version?: number | null
          updated_at?: string | null
          vibe_default?: string | null
          waist?: number | null
          wash_preference?: string[] | null
        }
        Relationships: []
      }
      recommendation_feedback: {
        Row: {
          action: string
          created_at: string
          id: string
          notes: string | null
          reason: string | null
          rec_index: number
          run_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          notes?: string | null
          reason?: string | null
          rec_index: number
          run_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          notes?: string | null
          reason?: string | null
          rec_index?: number
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_feedback_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "recommendation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_runs: {
        Row: {
          ai_used: boolean
          created_at: string
          id: string
          input: Json
          latency_ms: number | null
          model: string | null
          profile_snapshot: Json
          recommendations: Json
          user_id: string
        }
        Insert: {
          ai_used?: boolean
          created_at?: string
          id?: string
          input?: Json
          latency_ms?: number | null
          model?: string | null
          profile_snapshot?: Json
          recommendations?: Json
          user_id: string
        }
        Update: {
          ai_used?: boolean
          created_at?: string
          id?: string
          input?: Json
          latency_ms?: number | null
          model?: string | null
          profile_snapshot?: Json
          recommendations?: Json
          user_id?: string
        }
        Relationships: []
      }
      style_vibes: {
        Row: {
          attributes: Json
          audience: string
          core_jean_styles: string[]
          created_at: string | null
          description: string | null
          id: string
          label: string
          updated_at: string | null
          why: Json
        }
        Insert: {
          attributes?: Json
          audience: string
          core_jean_styles?: string[]
          created_at?: string | null
          description?: string | null
          id: string
          label: string
          updated_at?: string | null
          why?: Json
        }
        Update: {
          attributes?: Json
          audience?: string
          core_jean_styles?: string[]
          created_at?: string | null
          description?: string | null
          id?: string
          label?: string
          updated_at?: string | null
          why?: Json
        }
        Relationships: []
      }
      taste_events: {
        Row: {
          action: string
          created_at: string
          delta: Json
          id: number
          item_features: Json
          rec_index: number | null
          run_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          delta?: Json
          id?: number
          item_features?: Json
          rec_index?: number | null
          run_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          delta?: Json
          id?: number
          item_features?: Json
          rec_index?: number | null
          run_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      taste_vector_snapshots: {
        Row: {
          created_at: string
          id: number
          taste_vector: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          taste_vector: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          taste_vector?: Json
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_celebrity_summary: {
        Row: {
          created_at: string | null
          id: string | null
          is_active: boolean | null
          last_look_updated_at: string | null
          looks_count: number | null
          name: string | null
          primary_archetype: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      admin_look_summary: {
        Row: {
          canonical_text: string | null
          celebrity_id: string | null
          celebrity_name: string | null
          created_at: string | null
          display_asset_id: string | null
          display_bucket: string | null
          display_object_path: string | null
          display_visibility:
            | Database["public"]["Enums"]["asset_visibility"]
            | null
          id: string | null
          image_url: string | null
          ingest_error: string | null
          ingest_status: Database["public"]["Enums"]["ingest_status"] | null
          ingested_at: string | null
          is_active: boolean | null
          source_asset_id: string | null
          source_bucket: string | null
          source_object_path: string | null
          source_visibility:
            | Database["public"]["Enums"]["asset_visibility"]
            | null
          style_profile: Json | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "celebrity_looks_celebrity_id_fkey"
            columns: ["celebrity_id"]
            isOneToOne: false
            referencedRelation: "admin_celebrity_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebrity_looks_celebrity_id_fkey"
            columns: ["celebrity_id"]
            isOneToOne: false
            referencedRelation: "celebrities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebrity_looks_display_asset_id_fkey"
            columns: ["display_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "celebrity_looks_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_style_profile_dashboard: { Args: never; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      taste_vector_apply: {
        Args: {
          clamp_max: number
          clamp_min: number
          current: Json
          decay: number
          delta: Json
          zero_epsilon?: number
        }
        Returns: Json
      }
    }
    Enums: {
      asset_visibility: "public" | "private"
      ingest_status: "queued" | "processing" | "complete" | "failed"
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
      asset_visibility: ["public", "private"],
      ingest_status: ["queued", "processing", "complete", "failed"],
    },
  },
} as const
