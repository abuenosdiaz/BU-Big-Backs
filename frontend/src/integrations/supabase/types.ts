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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      dish_comments: {
        Row: {
          body: string
          created_at: string
          device_id: string
          dish_id: string
          id: string
          tried: boolean
        }
        Insert: {
          body: string
          created_at?: string
          device_id: string
          dish_id: string
          id?: string
          tried?: boolean
        }
        Update: {
          body?: string
          created_at?: string
          device_id?: string
          dish_id?: string
          id?: string
          tried?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "dish_comments_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_loves: {
        Row: {
          created_at: string
          device_id: string
          dish_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          dish_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          dish_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dish_loves_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      dishes: {
        Row: {
          allergens: string[]
          calories: number
          campus: string
          description: string
          hall: string
          id: string
          ingredients: string[]
          meal: string
          name: string
          nutrition: Json
          sort: number
          station: string
          tags: string[]
        }
        Insert: {
          allergens?: string[]
          calories: number
          campus: string
          description?: string
          hall: string
          id: string
          ingredients?: string[]
          meal?: string
          name: string
          nutrition?: Json
          sort?: number
          station: string
          tags?: string[]
        }
        Update: {
          allergens?: string[]
          calories?: number
          campus?: string
          description?: string
          hall?: string
          id?: string
          ingredients?: string[]
          meal?: string
          name?: string
          nutrition?: Json
          sort?: number
          station?: string
          tags?: string[]
        }
        Relationships: []
      }
      forum_posts: {
        Row: {
          body: string
          created_at: string
          device_id: string
          hall: string
          id: string
          title: string
          topic: string
        }
        Insert: {
          body: string
          created_at?: string
          device_id: string
          hall: string
          id?: string
          title: string
          topic?: string
        }
        Update: {
          body?: string
          created_at?: string
          device_id?: string
          hall?: string
          id?: string
          title?: string
          topic?: string
        }
        Relationships: []
      }
      item_requests: {
        Row: {
          created_at: string
          device_id: string
          hall: string
          id: string
          item: string
          kind: string
          reason: string | null
          status: string
        }
        Insert: {
          created_at?: string
          device_id: string
          hall?: string
          id?: string
          item: string
          kind?: string
          reason?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          hall?: string
          id?: string
          item?: string
          kind?: string
          reason?: string | null
          status?: string
        }
        Relationships: []
      }
      meal_ratings: {
        Row: {
          again: string | null
          created_at: string
          device_id: string
          dish_id: string
          id: string
          note: string | null
          overall: number
          portion: string | null
          taste: string | null
          temperature: string | null
          wait: string | null
        }
        Insert: {
          again?: string | null
          created_at?: string
          device_id: string
          dish_id: string
          id?: string
          note?: string | null
          overall: number
          portion?: string | null
          taste?: string | null
          temperature?: string | null
          wait?: string | null
        }
        Update: {
          again?: string | null
          created_at?: string
          device_id?: string
          dish_id?: string
          id?: string
          note?: string | null
          overall?: number
          portion?: string | null
          taste?: string | null
          temperature?: string | null
          wait?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_ratings_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      request_votes: {
        Row: {
          device_id: string
          request_id: string
        }
        Insert: {
          device_id: string
          request_id: string
        }
        Update: {
          device_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_votes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "item_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_my_content: { Args: { p_device: string }; Returns: undefined }
      get_dishes: {
        Args: { p_device: string }
        Returns: {
          allergens: string[]
          calories: number
          campus: string
          description: string
          hall: string
          id: string
          ingredients: string[]
          loved: boolean
          loves: number
          name: string
          sort: number
          station: string
          tags: string[]
        }[]
      }
      get_menu: {
        Args: { p_device: string }
        Returns: {
          allergens: string[]
          calories: number
          campus: string
          comments: number
          description: string
          hall: string
          id: string
          ingredients: string[]
          loved: boolean
          loves: number
          meal: string
          name: string
          nutrition: Json
          sort: number
          station: string
          tags: string[]
        }[]
      }
      get_requests: {
        Args: { p_device: string }
        Returns: {
          created_at: string
          hall: string
          id: string
          item: string
          kind: string
          status: string
          voted: boolean
          votes: number
        }[]
      }
      toggle_love: {
        Args: { p_device: string; p_dish: string }
        Returns: boolean
      }
      toggle_request_vote: {
        Args: { p_device: string; p_request: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
