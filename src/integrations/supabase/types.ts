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
      analyses: {
        Row: {
          ai_analysis: Json | null
          calc: Json | null
          city_name: string
          created_at: string
          down_payment: number | null
          estimated_resale_price: number | null
          furnishing_cost: number | null
          holding_months: number | null
          id: string
          loan_rate: number | null
          loan_years: number | null
          postal_code: string | null
          property_type: string | null
          purchase_price: number
          renovation_cost: number | null
          rooms_possible: number | null
          surface_sqm: number
          tmi: number | null
          user_id: string
          user_profile: string | null
        }
        Insert: {
          ai_analysis?: Json | null
          calc?: Json | null
          city_name: string
          created_at?: string
          down_payment?: number | null
          estimated_resale_price?: number | null
          furnishing_cost?: number | null
          holding_months?: number | null
          id?: string
          loan_rate?: number | null
          loan_years?: number | null
          postal_code?: string | null
          property_type?: string | null
          purchase_price: number
          renovation_cost?: number | null
          rooms_possible?: number | null
          surface_sqm: number
          tmi?: number | null
          user_id: string
          user_profile?: string | null
        }
        Update: {
          ai_analysis?: Json | null
          calc?: Json | null
          city_name?: string
          created_at?: string
          down_payment?: number | null
          estimated_resale_price?: number | null
          furnishing_cost?: number | null
          holding_months?: number | null
          id?: string
          loan_rate?: number | null
          loan_years?: number | null
          postal_code?: string | null
          property_type?: string | null
          purchase_price?: number
          renovation_cost?: number | null
          rooms_possible?: number | null
          surface_sqm?: number
          tmi?: number | null
          user_id?: string
          user_profile?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analyses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          properties: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          properties?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          properties?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      city_data: {
        Row: {
          adr_studio: number | null
          adr_t2: number | null
          adr_t3: number | null
          change_usage_required: boolean | null
          city_name: string
          coliving_demand: string | null
          compensation_required: boolean | null
          id: string
          market_liquidity: string | null
          mid_term_demand: string | null
          occupancy_rate: number | null
          postal_prefix: string | null
          price_sqm_avg: number | null
          price_trend: number | null
          primary_residence_cap: number | null
          quota_zones: boolean | null
          regulation_level: string | null
          regulation_notes: string | null
          regulation_updated_at: string | null
          rent_room_coliving: number | null
          rent_sqm_furnished: number | null
          rent_sqm_unfurnished: number | null
          seasonality: string | null
          updated_at: string
        }
        Insert: {
          adr_studio?: number | null
          adr_t2?: number | null
          adr_t3?: number | null
          change_usage_required?: boolean | null
          city_name: string
          coliving_demand?: string | null
          compensation_required?: boolean | null
          id?: string
          market_liquidity?: string | null
          mid_term_demand?: string | null
          occupancy_rate?: number | null
          postal_prefix?: string | null
          price_sqm_avg?: number | null
          price_trend?: number | null
          primary_residence_cap?: number | null
          quota_zones?: boolean | null
          regulation_level?: string | null
          regulation_notes?: string | null
          regulation_updated_at?: string | null
          rent_room_coliving?: number | null
          rent_sqm_furnished?: number | null
          rent_sqm_unfurnished?: number | null
          seasonality?: string | null
          updated_at?: string
        }
        Update: {
          adr_studio?: number | null
          adr_t2?: number | null
          adr_t3?: number | null
          change_usage_required?: boolean | null
          city_name?: string
          coliving_demand?: string | null
          compensation_required?: boolean | null
          id?: string
          market_liquidity?: string | null
          mid_term_demand?: string | null
          occupancy_rate?: number | null
          postal_prefix?: string | null
          price_sqm_avg?: number | null
          price_trend?: number | null
          primary_residence_cap?: number | null
          quota_zones?: boolean | null
          regulation_level?: string | null
          regulation_notes?: string | null
          regulation_updated_at?: string | null
          rent_room_coliving?: number | null
          rent_sqm_furnished?: number | null
          rent_sqm_unfurnished?: number | null
          seasonality?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      city_requests: {
        Row: {
          city_name: string
          created_at: string
          id: string
          user_id: string | null
        }
        Insert: {
          city_name: string
          created_at?: string
          id?: string
          user_id?: string | null
        }
        Update: {
          city_name?: string
          created_at?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "city_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_snapshots: {
        Row: {
          commune_name: string
          department_code: string | null
          fetched_at: string
          insee_code: string
          postal_code: string
          price_sqm_avg: number | null
          raw: Json | null
          region_code: string | null
          regulation_source: string | null
          regulation_zone: string | null
          rent_cap_furnished: number | null
          rent_cap_unfurnished: number | null
          rent_controlled: boolean
          rent_sqm_furnished: number | null
          rent_sqm_unfurnished: number | null
          updated_at: string
        }
        Insert: {
          commune_name: string
          department_code?: string | null
          fetched_at?: string
          insee_code: string
          postal_code: string
          price_sqm_avg?: number | null
          raw?: Json | null
          region_code?: string | null
          regulation_source?: string | null
          regulation_zone?: string | null
          rent_cap_furnished?: number | null
          rent_cap_unfurnished?: number | null
          rent_controlled?: boolean
          rent_sqm_furnished?: number | null
          rent_sqm_unfurnished?: number | null
          updated_at?: string
        }
        Update: {
          commune_name?: string
          department_code?: string | null
          fetched_at?: string
          insee_code?: string
          postal_code?: string
          price_sqm_avg?: number | null
          raw?: Json | null
          region_code?: string | null
          regulation_source?: string | null
          regulation_zone?: string | null
          rent_cap_furnished?: number | null
          rent_cap_unfurnished?: number | null
          rent_controlled?: boolean
          rent_sqm_furnished?: number | null
          rent_sqm_unfurnished?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          analyses_used_this_month: number
          created_at: string
          default_profile: string | null
          default_tmi: number | null
          email: string
          full_name: string | null
          id: string
          plan: string
          quota_reset_at: string
        }
        Insert: {
          analyses_used_this_month?: number
          created_at?: string
          default_profile?: string | null
          default_tmi?: number | null
          email: string
          full_name?: string | null
          id: string
          plan?: string
          quota_reset_at?: string
        }
        Update: {
          analyses_used_this_month?: number
          created_at?: string
          default_profile?: string | null
          default_tmi?: number | null
          email?: string
          full_name?: string | null
          id?: string
          plan?: string
          quota_reset_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id?: string
          paddle_subscription_id?: string
          price_id?: string
          product_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_analysis_quota: {
        Args: { p_limit: number }
        Returns: {
          plan: string
          remaining: number
          reset_at: string
          used: number
        }[]
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
