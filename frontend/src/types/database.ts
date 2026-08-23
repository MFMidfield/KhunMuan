export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      addons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["addon_group"]
          max_qty: number
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["addon_group"]
          max_qty?: number
          name: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["addon_group"]
          max_qty?: number
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          invited_by: string | null
          is_active: boolean
          role: Database["public"]["Enums"]["admin_role"]
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_name: string
          email: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      code_lookup_attempts: {
        Row: {
          code: string
          created_at: string
          hit: boolean
          id: number
          ip_hash: string
        }
        Insert: {
          code: string
          created_at?: string
          hit: boolean
          id?: never
          ip_hash: string
        }
        Update: {
          code?: string
          created_at?: string
          hit?: boolean
          id?: never
          ip_hash?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          created_at: string
          fee: number
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee: number
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee?: number
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      filling_stock_daily: {
        Row: {
          created_at: string
          filling_id: string
          qty_remaining: number
          qty_total: number
          service_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          filling_id: string
          qty_remaining: number
          qty_total: number
          service_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          filling_id?: string
          qty_remaining?: number
          qty_total?: number
          service_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "filling_stock_daily_filling_id_fkey"
            columns: ["filling_id"]
            isOneToOne: false
            referencedRelation: "fillings"
            referencedColumns: ["id"]
          },
        ]
      }
      fillings: {
        Row: {
          created_at: string
          default_daily_qty: number | null
          description: string | null
          id: string
          image_path: string
          is_active: boolean
          max_per_set: number | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_daily_qty?: number | null
          description?: string | null
          id?: string
          image_path: string
          is_active?: boolean
          max_per_set?: number | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_daily_qty?: number | null
          description?: string | null
          id?: string
          image_path?: string
          is_active?: boolean
          max_per_set?: number | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      notification_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: number
          kind: string
          last_error: string | null
          order_id: string | null
          payload: Json
          sent_at: string | null
          state: Database["public"]["Enums"]["outbox_state"]
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: never
          kind: string
          last_error?: string | null
          order_id?: string | null
          payload: Json
          sent_at?: string | null
          state?: Database["public"]["Enums"]["outbox_state"]
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: never
          kind?: string
          last_error?: string | null
          order_id?: string | null
          payload?: Json
          sent_at?: string | null
          state?: Database["public"]["Enums"]["outbox_state"]
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_code_blocklist: {
        Row: {
          created_at: string
          id: string
          match_type: string
          note: string | null
          pattern: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_type: string
          note?: string | null
          pattern: string
        }
        Update: {
          created_at?: string
          id?: string
          match_type?: string
          note?: string | null
          pattern?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          actor_admin_id: string | null
          actor_label: string
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          order_id: string
          payload: Json | null
          to_status: Database["public"]["Enums"]["order_status"] | null
          type: string
        }
        Insert: {
          actor_admin_id?: string | null
          actor_label: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          order_id: string
          payload?: Json | null
          to_status?: Database["public"]["Enums"]["order_status"] | null
          type: string
        }
        Update: {
          actor_admin_id?: string | null
          actor_label?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: never
          order_id?: string
          payload?: Json | null
          to_status?: Database["public"]["Enums"]["order_status"] | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_actor_admin_id_fkey"
            columns: ["actor_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_addons: {
        Row: {
          addon_id: string
          addon_name: string
          order_item_id: string
          qty: number
          unit_price: number
        }
        Insert: {
          addon_id: string
          addon_name: string
          order_item_id: string
          qty: number
          unit_price: number
        }
        Update: {
          addon_id?: string
          addon_name?: string
          order_item_id?: string
          qty?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_addons_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_fillings: {
        Row: {
          filling_id: string
          filling_name: string
          order_item_id: string
          qty: number
        }
        Insert: {
          filling_id: string
          filling_name: string
          order_item_id: string
          qty: number
        }
        Update: {
          filling_id?: string
          filling_name?: string
          order_item_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_fillings_filling_id_fkey"
            columns: ["filling_id"]
            isOneToOne: false
            referencedRelation: "fillings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_fillings_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          note: string | null
          order_id: string
          piece_quota: number
          quantity: number
          set_id: string | null
          set_name: string
          sort_order: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          note?: string | null
          order_id: string
          piece_quota: number
          quantity?: number
          set_id?: string | null
          set_name: string
          sort_order?: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          note?: string | null
          order_id?: string
          piece_quota?: number
          quantity?: number
          set_id?: string | null
          set_name?: string
          sort_order?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      order_reject_reasons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          cancelled_reason: string | null
          claimed_at: string | null
          claimed_by: string | null
          client_request_id: string | null
          client_token: string
          code: string
          code_epoch: number
          code_seq: number
          created_at: string
          created_by_admin: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_room: string | null
          delivery_fee: number
          delivery_location: string | null
          delivery_zone_id: string | null
          fulfillment: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          note: string | null
          pickup_point_id: string | null
          pickup_slot_id: string | null
          reject_reason_id: string | null
          service_date: string
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          version: number
        }
        Insert: {
          cancelled_reason?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          client_request_id?: string | null
          client_token?: string
          code: string
          code_epoch?: number
          code_seq: number
          created_at?: string
          created_by_admin?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_room?: string | null
          delivery_fee?: number
          delivery_location?: string | null
          delivery_zone_id?: string | null
          fulfillment: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          note?: string | null
          pickup_point_id?: string | null
          pickup_slot_id?: string | null
          reject_reason_id?: string | null
          service_date?: string
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at?: string
          version?: number
        }
        Update: {
          cancelled_reason?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          client_request_id?: string | null
          client_token?: string
          code?: string
          code_epoch?: number
          code_seq?: number
          created_at?: string
          created_by_admin?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_room?: string | null
          delivery_fee?: number
          delivery_location?: string | null
          delivery_zone_id?: string | null
          fulfillment?: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          note?: string | null
          pickup_point_id?: string | null
          pickup_slot_id?: string | null
          reject_reason_id?: string | null
          service_date?: string
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_admin_fkey"
            columns: ["created_by_admin"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pickup_point_id_fkey"
            columns: ["pickup_point_id"]
            isOneToOne: false
            referencedRelation: "pickup_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pickup_slot_id_fkey"
            columns: ["pickup_slot_id"]
            isOneToOne: false
            referencedRelation: "pickup_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reject_reason_id_fkey"
            columns: ["reject_reason_id"]
            isOneToOne: false
            referencedRelation: "order_reject_reasons"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          order_id: string
          slip_path: string | null
          slip_uploaded_at: string | null
          state: Database["public"]["Enums"]["payment_state"]
          updated_at: string
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          method: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          order_id: string
          slip_path?: string | null
          slip_uploaded_at?: string | null
          state?: Database["public"]["Enums"]["payment_state"]
          updated_at?: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          order_id?: string
          slip_path?: string | null
          slip_uploaded_at?: string | null
          state?: Database["public"]["Enums"]["payment_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_points: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      pickup_slots: {
        Row: {
          capacity: number | null
          created_at: string
          cutoff_minutes: number | null
          id: string
          is_active: boolean
          label: string
          starts_at_local: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          cutoff_minutes?: number | null
          id?: string
          is_active?: boolean
          label: string
          starts_at_local: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          cutoff_minutes?: number | null
          id?: string
          is_active?: boolean
          label?: string
          starts_at_local?: string
          updated_at?: string
        }
        Relationships: []
      }
      sets: {
        Row: {
          created_at: string
          daily_limit: number | null
          description: string | null
          id: string
          image_path: string | null
          is_active: boolean
          name: string
          piece_quota: number
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number | null
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          name: string
          piece_quota: number
          price: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_limit?: number | null
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          name?: string
          piece_quota?: number
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      shop_settings: {
        Row: {
          closed_message: string | null
          code_epoch: number
          created_at: string
          delivery_enabled: boolean
          id: number
          is_open: boolean
          line_notify_enabled: boolean
          max_boxes_per_order: number | null
          min_order_total: number | null
          order_code_alphabet: string
          order_code_length: number
          promptpay_qr_path: string | null
          require_code_on_handover: boolean
          slip_retention_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          closed_message?: string | null
          code_epoch?: number
          created_at?: string
          delivery_enabled?: boolean
          id: number
          is_open?: boolean
          line_notify_enabled?: boolean
          max_boxes_per_order?: number | null
          min_order_total?: number | null
          order_code_alphabet?: string
          order_code_length?: number
          promptpay_qr_path?: string | null
          require_code_on_handover?: boolean
          slip_retention_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          closed_message?: string | null
          code_epoch?: number
          created_at?: string
          delivery_enabled?: boolean
          id?: number
          is_open?: boolean
          line_notify_enabled?: boolean
          max_boxes_per_order?: number | null
          min_order_total?: number | null
          order_code_alphabet?: string
          order_code_length?: number
          promptpay_qr_path?: string | null
          require_code_on_handover?: boolean
          slip_retention_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_order: {
        Args: {
          p_code?: string
          p_expected_version: number
          p_note?: string
          p_order_id: string
          p_override_payment?: boolean
          p_reason_id?: string
          p_to_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: Json
      }
      attach_slip: {
        Args: { p_client_token: string; p_code: string; p_path: string }
        Returns: Json
      }
      blocked_lookup_ips: {
        Args: never
        Returns: {
          attempts: number
          codes_tried: string[]
          first_seen: string
          ip_hash: string
          last_seen: string
          misses: number
        }[]
      }
      cancel_order: {
        Args: { p_client_token: string; p_code: string }
        Returns: Json
      }
      claim_order: { Args: { p_order_id: string }; Returns: Json }
      expired_slips: {
        Args: never
        Returns: {
          order_id: string
          slip_path: string
        }[]
      }
      forget_slip: { Args: { p_order_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      lookup_order: {
        Args: { p_client_token?: string; p_code: string }
        Returns: Json
      }
      lookup_order_tracked: {
        Args: { p_client_token: string; p_code: string; p_ip_hash: string }
        Returns: Json
      }
      outbox_settle: {
        Args: { p_error?: string; p_id: number; p_ok: boolean }
        Returns: undefined
      }
      outbox_take: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          id: number
          kind: string
          last_error: string | null
          order_id: string | null
          payload: Json
          sent_at: string | null
          state: Database["public"]["Enums"]["outbox_state"]
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      place_order: { Args: { p_payload: Json }; Returns: Json }
      release_order: { Args: { p_order_id: string }; Returns: Json }
      report_fillings: {
        Args: { p_from: string; p_to: string }
        Returns: {
          filling_name: string
          orders: number
          pieces: number
        }[]
      }
      report_sales: {
        Args: { p_from: string; p_to: string }
        Returns: {
          cash: number
          completed: number
          lost: number
          revenue: number
          service_date: string
          transfer: number
        }[]
      }
      report_stage_timing: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_minutes: number
          median_minutes: number
          samples: number
          to_status: Database["public"]["Enums"]["order_status"]
        }[]
      }
      run_daily_rollover: { Args: never; Returns: Json }
      set_payment: {
        Args: {
          p_note?: string
          p_order_id: string
          p_state: Database["public"]["Enums"]["payment_state"]
        }
        Returns: Json
      }
      set_stock: {
        Args: { p_filling_id: string; p_qty_total: number }
        Returns: Json
      }
      shop_today: { Args: never; Returns: string }
      toggle_shop: {
        Args: { p_is_open: boolean; p_message?: string }
        Returns: Json
      }
      unblock_ip: { Args: { p_ip_hash: string }; Returns: Json }
    }
    Enums: {
      addon_group: "sauce" | "utensil" | "packaging"
      admin_role: "superadmin" | "admin"
      fulfillment_type: "pickup" | "delivery"
      order_source: "web" | "admin"
      order_status:
        | "pending_confirmation"
        | "accepted"
        | "cooking"
        | "ready"
        | "handed_over"
        | "cancelled"
        | "rejected"
      outbox_state: "pending" | "sent" | "failed"
      payment_method: "cash" | "transfer"
      payment_state: "unpaid" | "slip_uploaded" | "paid" | "refunded"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      addon_group: ["sauce", "utensil", "packaging"],
      admin_role: ["superadmin", "admin"],
      fulfillment_type: ["pickup", "delivery"],
      order_source: ["web", "admin"],
      order_status: [
        "pending_confirmation",
        "accepted",
        "cooking",
        "ready",
        "handed_over",
        "cancelled",
        "rejected",
      ],
      outbox_state: ["pending", "sent", "failed"],
      payment_method: ["cash", "transfer"],
      payment_state: ["unpaid", "slip_uploaded", "paid", "refunded"],
    },
  },
} as const

