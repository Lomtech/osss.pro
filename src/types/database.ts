export type Belt = 'white' | 'blue' | 'purple' | 'brown' | 'black'
export type ClassType = 'gi' | 'no-gi' | 'open mat' | 'kids' | 'competition'
export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'cancelled' | 'trial'
// 2026-05 single-tier model: 'standard' is the new canonical paid tier name.
// Legacy values (starter/grow/pro) kept for backward compatibility with
// existing DB rows; new subscriptions write 'standard'. 'free' marks the
// post-cancellation state (no active sub).
export type GymPlan = 'free' | 'standard' | 'starter' | 'grow' | 'pro'
export type LeadStatus =
  | 'new' | 'contacted' | 'qualified'
  | 'trial_scheduled' | 'trial_done' | 'trial_no_show'
  | 'second_trial_scheduled'
  | 'converted' | 'lost'
export type LeadSource = 'walk-in' | 'referral' | 'instagram' | 'website' | 'other' | 'signup_link' | 'public_page' | 'gym_qr'
export type BookingStatus = 'confirmed' | 'waitlist' | 'cancelled'
export type LeadBookingStatus = 'booked' | 'checked_in' | 'cancelled'
export type SalesLeadStatus = 'new' | 'researching' | 'contacted' | 'callback' | 'qualified' | 'demo_scheduled' | 'demo_done' | 'negotiating' | 'won' | 'lost' | 'not_a_fit' | 'do_not_contact'
export type SalesActivityKind = 'call' | 'email' | 'sms' | 'whatsapp' | 'meeting' | 'demo' | 'note' | 'status_change' | 'followup_scheduled' | 'place_imported'
export type SalesActivityOutcome = 'answered' | 'no_answer' | 'voicemail' | 'interested' | 'not_interested' | 'call_back' | 'wrong_number' | 'sent' | 'replied' | 'bounced' | 'positive' | 'neutral' | 'negative'
export type MembershipSource = 'direct' | 'wellpass' | 'hansefit' | 'egym' | 'urban_sports'
export type MembershipPlanKind = 'subscription' | 'punch_card'
export type ContractStatus = 'active' | 'paused' | 'cancelled_pending' | 'cancelled' | 'ended'
export type PauseReason = 'injury' | 'travel' | 'financial' | 'other'
export type ContractRole = 'owner' | 'member' | 'admin'
export type TerminationKind = 'regular' | 'special_right'
export type TerminationStatus = 'requested' | 'accepted' | 'rejected' | 'withdrawn'
export type TerminationReasonCategory = 'moved' | 'injury' | 'financial' | 'dissatisfaction' | 'medical' | 'contract_breach' | 'other'
export type CommunicationMethod = 'email' | 'portal' | 'manual'

export interface SalesLead {
  id: string
  google_place_id: string | null
  name: string
  formatted_address: string | null
  phone: string | null
  international_phone: string | null
  email: string | null
  website: string | null
  instagram_url: string | null
  facebook_url: string | null
  google_maps_url: string | null
  latitude: number | null
  longitude: number | null
  rating: number | null
  user_ratings_total: number | null
  business_status: string | null
  primary_type: string | null
  types: string[] | null
  city: string | null
  country_code: string | null
  status: SalesLeadStatus
  priority: number
  notes: string | null
  sports: string[]
  is_martial_arts: boolean
  next_followup_at: string | null
  last_contacted_at: string | null
  contact_count: number
  next_action: string | null
  next_action_at: string | null
  last_action_kind: string | null
  lost_reason: string | null
  converted_gym_id: string | null
  converted_at: string | null
  assigned_to: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SalesActivity {
  id: string
  lead_id: string
  user_id: string | null
  kind: SalesActivityKind
  outcome: SalesActivityOutcome | null
  subject: string | null
  body: string | null
  duration_seconds: number | null
  occurred_at: string
  created_at: string
}


type Rel = { foreignKeyName: string; columns: string[]; isOneToOne?: boolean; referencedRelation: string; referencedColumns: string[] }

export interface Database {
  __InternalSupabase: { PostgrestVersion: '12' }
  public: {
    Tables: {
      gyms: {
        Row: {
          id: string
          owner_id: string
          name: string
          address: string | null
          phone: string | null
          email: string | null
          logo_url: string | null
          monthly_fee_cents: number | null
          created_at: string
          // Onboarding lifecycle (verified present in live DB 2026-06-02: timestamptz, nullable)
          onboarding_completed_at: string | null
          slug: string | null
          // Stripe Connect
          stripe_account_id: string | null
          stripe_charges_enabled: boolean | null
          // Osss platform subscription
          osss_stripe_customer_id: string | null
          osss_stripe_subscription_id: string | null
          // Plan & limits
          plan: GymPlan | null
          plan_member_limit: number | null
          // Invoice settings
          invoice_prefix: string | null
          invoice_counter: number | null
          tax_number: string | null
          ustid: string | null
          is_kleinunternehmer: boolean | null
          // bank_iban (Klartext) wurde gedroppt — siehe migrations/0010_drop_legacy_bank_iban.sql.
          // Lese-/Schreibpfad geht ausschließlich über bank_iban_enc.
          bank_iban_enc: string | null
          bank_bic: string | null
          bank_name: string | null
          legal_name: string | null
          legal_address: string | null
          legal_email: string | null
          // Belt system config
          belt_system: string | null
          belt_system_enabled: boolean | null
          class_types: string[] | null
          // Public page
          tagline: string | null
          about: string | null
          about_blocks: unknown[] | null
          hero_image_url: string | null
          hero_image_position: number | null
          gallery_urls: string[] | null
          video_url: string | null
          video_urls: string[] | null
          sport_type: string | null
          founded_year: number | null
          opening_hours: Record<string, unknown> | null
          impressum_text: string | null
          // Social
          whatsapp_number: string | null
          whatsapp_group_url: string | null
          instagram_url: string | null
          facebook_url: string | null
          website_url: string | null
          // Notifications
          callmebot_api_key: string | null
          // Signup
          signup_token: string | null
          signup_enabled: boolean | null
          contract_template: string | null
          wellpass_agreement_template: string | null
          trial_rules_template: string | null
          // Belt (extended)
          stripes_enabled: boolean | null
          // Public page (extended)
          hero_title: string | null
          hero_subtitle: string | null
          accent_color: string | null
          // DATEV
          datev_beraternummer: string | null
          datev_mandantennummer: string | null
          datev_sachkontenlänge: number | null
          datev_debitor_account: string
          dunning_interest_basisrate_pct: number
          dunning_interest_surcharge_pct: number
          // GPS check-in
          latitude: number | null
          longitude: number | null
          gps_radius_meters: number | null
          // Payment
          payment_method_types: string[] | null
          // Plan
          plan_expires_at: string | null
          // Dunning / Inkasso config
          dunning_late_fee_cents: number
          dunning_days_to_level_2: number
          dunning_days_to_level_3: number
          // Auto-Inkasso-Übergabe (Migration 0019) — opt-in pro Gym
          dunning_auto_inkasso_enabled: boolean
          dunning_days_to_inkasso: number
          // Paywise-Inkasso (Migration 0018) — Company/User des Gyms bei Paywise
          paywise_company_id: string | null
          paywise_user_id: string | null
          paywise_status: string | null
          paywise_consent_at: string | null
          // Paywise-Webhook pro Gym (Migration 0020)
          paywise_webhook_id: string | null
          paywise_webhook_secret: string | null
        }
        Insert: {
          owner_id: string
          name: string
          address?: string | null
          phone?: string | null
          email?: string | null
          logo_url?: string | null
          monthly_fee_cents?: number | null
          slug?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean | null
          osss_stripe_customer_id?: string | null
          osss_stripe_subscription_id?: string | null
          plan?: GymPlan | null
          plan_member_limit?: number | null
          invoice_prefix?: string | null
          invoice_counter?: number | null
          tax_number?: string | null
          ustid?: string | null
          is_kleinunternehmer?: boolean | null
          bank_iban_enc?: string | null
          bank_bic?: string | null
          bank_name?: string | null
          legal_name?: string | null
          legal_address?: string | null
          legal_email?: string | null
          belt_system?: string | null
          belt_system_enabled?: boolean | null
          class_types?: string[] | null
          tagline?: string | null
          about?: string | null
          about_blocks?: unknown[] | null
          hero_image_url?: string | null
          hero_image_position?: number | null
          gallery_urls?: string[] | null
          video_url?: string | null
          video_urls?: string[] | null
          sport_type?: string | null
          founded_year?: number | null
          opening_hours?: Record<string, unknown> | null
          impressum_text?: string | null
          whatsapp_number?: string | null
          whatsapp_group_url?: string | null
          instagram_url?: string | null
          facebook_url?: string | null
          website_url?: string | null
          callmebot_api_key?: string | null
          signup_token?: string | null
          signup_enabled?: boolean | null
          contract_template?: string | null
          wellpass_agreement_template?: string | null
          trial_rules_template?: string | null
          stripes_enabled?: boolean | null
          hero_title?: string | null
          hero_subtitle?: string | null
          accent_color?: string | null
          datev_beraternummer?: string | null
          datev_mandantennummer?: string | null
          datev_sachkontenlänge?: number | null
          datev_debitor_account?: string
          dunning_interest_basisrate_pct?: number
          dunning_interest_surcharge_pct?: number
          latitude?: number | null
          longitude?: number | null
          gps_radius_meters?: number | null
          payment_method_types?: string[] | null
          plan_expires_at?: string | null
          dunning_late_fee_cents?: number
          dunning_days_to_level_2?: number
          dunning_days_to_level_3?: number
        }
        Update: {
          name?: string
          address?: string | null
          phone?: string | null
          email?: string | null
          logo_url?: string | null
          monthly_fee_cents?: number | null
          slug?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean | null
          osss_stripe_customer_id?: string | null
          osss_stripe_subscription_id?: string | null
          plan?: GymPlan | null
          plan_member_limit?: number | null
          invoice_prefix?: string | null
          invoice_counter?: number | null
          tax_number?: string | null
          ustid?: string | null
          is_kleinunternehmer?: boolean | null
          bank_iban_enc?: string | null
          bank_bic?: string | null
          bank_name?: string | null
          legal_name?: string | null
          legal_address?: string | null
          legal_email?: string | null
          belt_system?: string | null
          belt_system_enabled?: boolean | null
          class_types?: string[] | null
          tagline?: string | null
          about?: string | null
          about_blocks?: unknown[] | null
          hero_image_url?: string | null
          hero_image_position?: number | null
          gallery_urls?: string[] | null
          video_url?: string | null
          video_urls?: string[] | null
          sport_type?: string | null
          founded_year?: number | null
          opening_hours?: Record<string, unknown> | null
          impressum_text?: string | null
          whatsapp_number?: string | null
          whatsapp_group_url?: string | null
          instagram_url?: string | null
          facebook_url?: string | null
          website_url?: string | null
          callmebot_api_key?: string | null
          signup_token?: string | null
          signup_enabled?: boolean | null
          contract_template?: string | null
          wellpass_agreement_template?: string | null
          trial_rules_template?: string | null
          stripes_enabled?: boolean | null
          hero_title?: string | null
          hero_subtitle?: string | null
          accent_color?: string | null
          datev_beraternummer?: string | null
          datev_mandantennummer?: string | null
          datev_sachkontenlänge?: number | null
          datev_debitor_account?: string
          dunning_interest_basisrate_pct?: number
          dunning_interest_surcharge_pct?: number
          latitude?: number | null
          longitude?: number | null
          gps_radius_meters?: number | null
          payment_method_types?: string[] | null
          plan_expires_at?: string | null
          dunning_late_fee_cents?: number
          dunning_days_to_level_2?: number
          dunning_days_to_level_3?: number
        }
        Relationships: Rel[]
      }
      members: {
        Row: {
          id: string
          gym_id: string
          first_name: string
          last_name: string
          email: string | null
          phone: string | null
          date_of_birth: string | null
          join_date: string
          belt: Belt
          stripes: number
          is_active: boolean
          notes: string | null
          portal_token: string | null
          contract_end_date: string | null
          monthly_fee_override_cents: number | null
          created_at: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: SubscriptionStatus
          plan_id: string | null
          requested_plan_id: string | null
          onboarding_status: string | null
          cancellation_requested_at: string | null
          cancellation_note: string | null
          parent_member_id: string | null
          address: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          signature_data: string | null
          consent_ip: string | null
          consent_user_agent: string | null
          consent_text: string | null
          contract_signed_at: string | null
          gdpr_consent_at: string | null
          marketing_email_consent: boolean
          marketing_consent_at: string | null
          marketing_unsubscribe_token: string | null
          dunning_level: number
          dunning_amount_cents: number | null
          dunning_started_at: string | null
          dunning_last_action_at: string | null
          dunning_notes: string | null
          membership_source: string | null
          plan_reminder_sent_at: string | null
          punch_units_remaining: number | null
          punch_units_total: number | null
          punch_card_purchased_at: string | null
          portal_token_hash: string | null
          portal_token_expires_at: string | null
          portal_token_rotated_at: string | null
          parent_first_name: string | null
          parent_last_name: string | null
          parent_email: string | null
          parent_phone: string | null
          parent_relationship: string | null
          parent_signature_data: string | null
          parent_signed_at: string | null
          parent_consent_ip: string | null
          parent_consent_user_agent: string | null
          parent_consent_text: string | null
          parent_id_document_type: string | null
          sole_custody_declared: boolean
          email_confirmed_at: string | null
          email_confirmation_token: string | null
          email_confirmation_sent_at: string | null
        }
        Insert: {
          gym_id: string
          first_name: string
          last_name: string
          email?: string | null
          phone?: string | null
          date_of_birth?: string | null
          join_date?: string
          belt?: Belt
          stripes?: number
          is_active?: boolean
          notes?: string | null
          portal_token?: string | null
          contract_end_date?: string | null
          monthly_fee_override_cents?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: SubscriptionStatus
          plan_id?: string | null
          requested_plan_id?: string | null
          onboarding_status?: string | null
          cancellation_requested_at?: string | null
          cancellation_note?: string | null
          parent_member_id?: string | null
          address?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          signature_data?: string | null
          consent_ip?: string | null
          consent_user_agent?: string | null
          consent_text?: string | null
          contract_signed_at?: string | null
          gdpr_consent_at?: string | null
          marketing_email_consent?: boolean
          marketing_consent_at?: string | null
          dunning_level?: number
          dunning_amount_cents?: number | null
          membership_source?: string | null
          plan_reminder_sent_at?: string | null
          punch_units_remaining?: number | null
          punch_units_total?: number | null
          punch_card_purchased_at?: string | null
          portal_token_hash?: string | null
          portal_token_expires_at?: string | null
          portal_token_rotated_at?: string | null
          parent_first_name?: string | null
          parent_last_name?: string | null
          parent_email?: string | null
          parent_phone?: string | null
          parent_relationship?: string | null
          parent_signature_data?: string | null
          parent_signed_at?: string | null
          parent_consent_ip?: string | null
          parent_consent_user_agent?: string | null
          parent_consent_text?: string | null
          parent_id_document_type?: string | null
          sole_custody_declared?: boolean
          email_confirmed_at?: string | null
          email_confirmation_token?: string | null
          email_confirmation_sent_at?: string | null
        }
        Update: {
          first_name?: string
          last_name?: string
          email?: string | null
          phone?: string | null
          date_of_birth?: string | null
          join_date?: string
          belt?: Belt
          stripes?: number
          is_active?: boolean
          notes?: string | null
          portal_token?: string | null
          contract_end_date?: string | null
          monthly_fee_override_cents?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: SubscriptionStatus
          plan_id?: string | null
          requested_plan_id?: string | null
          onboarding_status?: string | null
          cancellation_requested_at?: string | null
          cancellation_note?: string | null
          parent_member_id?: string | null
          address?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          signature_data?: string | null
          consent_ip?: string | null
          consent_user_agent?: string | null
          consent_text?: string | null
          contract_signed_at?: string | null
          gdpr_consent_at?: string | null
          marketing_email_consent?: boolean
          marketing_consent_at?: string | null
          dunning_level?: number
          dunning_amount_cents?: number | null
          dunning_started_at?: string | null
          dunning_last_action_at?: string | null
          dunning_notes?: string | null
          membership_source?: string | null
          plan_reminder_sent_at?: string | null
          punch_units_remaining?: number | null
          punch_units_total?: number | null
          punch_card_purchased_at?: string | null
          portal_token_hash?: string | null
          portal_token_expires_at?: string | null
          portal_token_rotated_at?: string | null
          parent_first_name?: string | null
          parent_last_name?: string | null
          parent_email?: string | null
          parent_phone?: string | null
          parent_relationship?: string | null
          parent_signature_data?: string | null
          parent_signed_at?: string | null
          parent_consent_ip?: string | null
          parent_consent_user_agent?: string | null
          parent_consent_text?: string | null
          parent_id_document_type?: string | null
          sole_custody_declared?: boolean
          email_confirmed_at?: string | null
          email_confirmation_token?: string | null
          email_confirmation_sent_at?: string | null
        }
        Relationships: Rel[]
      }
      dunning_handoffs: {
        Row: { id: string; gym_id: string; member_id: string; provider: string; status: string; amount_cents: number; reference_id: string | null; pdf_storage_path: string | null; notes: string | null; initiated_at: string; initiated_by: string | null; exported_at: string | null; sent_at: string | null; accepted_at: string | null; closed_at: string | null; last_status_change_at: string; provider_response: unknown | null }
        Insert: { gym_id: string; member_id: string; provider: string; status?: string; amount_cents: number; reference_id?: string | null; pdf_storage_path?: string | null; notes?: string | null; initiated_by?: string | null }
        Update: { provider?: string; status?: string; amount_cents?: number; reference_id?: string | null; pdf_storage_path?: string | null; notes?: string | null; exported_at?: string | null; sent_at?: string | null; accepted_at?: string | null; closed_at?: string | null; last_status_change_at?: string; provider_response?: unknown | null }
        Relationships: Rel[]
      }
      dunning_actions: {
        Row: { id: string; member_id: string; gym_id: string; action_type: string; amount_cents: number | null; notes: string | null; performed_by: string | null; performed_at: string }
        Insert: { member_id: string; gym_id: string; action_type: string; amount_cents?: number | null; notes?: string | null; performed_by?: string | null }
        Update: never
        Relationships: Rel[]
      }
      payments_extra_meta: { Row: { kind: string; description: string | null; due_date: string | null; issued_at: string | null }; Insert: { kind?: string; description?: string | null; due_date?: string | null; issued_at?: string | null }; Update: { kind?: string; description?: string | null; due_date?: string | null; issued_at?: string | null }; Relationships: Rel[] }
      payments: {
        Row: {
          id: string
          gym_id: string
          member_id: string | null
          amount_cents: number
          status: string
          paid_at: string | null
          created_at: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_invoice_id: string | null
          checkout_url: string | null
          invoice_number: string | null
          member_name: string | null
          kind: string
          description: string | null
          due_date: string | null
          issued_at: string | null
          credits_payment_id: string | null
          tax_rate_pct: number
        }
        Insert: {
          gym_id: string
          member_id?: string | null
          amount_cents: number
          status?: string
          paid_at?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_invoice_id?: string | null
          checkout_url?: string | null
          invoice_number?: string | null
          member_name?: string | null
          kind?: string
          description?: string | null
          due_date?: string | null
          issued_at?: string | null
          credits_payment_id?: string | null
          tax_rate_pct?: number
        }
        Update: {
          status?: string
          paid_at?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_invoice_id?: string | null
          checkout_url?: string | null
          invoice_number?: string | null
          member_name?: string | null
        }
        Relationships: Rel[]
      }
      cron_runs: {
        Row: { id: string; job_name: string; executed_at: string; created_at: string }
        Insert: { job_name: string; executed_at: string; id?: string; created_at?: string }
        Update: Record<string, never>
        Relationships: Rel[]
      }
      notification_queue: {
        Row: {
          id: string
          kind: string
          channel: string
          payload: Record<string, unknown>
          status: string
          scheduled_for: string
          attempts: number
          max_attempts: number
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          sent_at: string | null
          created_at: string
        }
        Insert: {
          kind: string
          payload: Record<string, unknown>
          channel?: string
          status?: string
          scheduled_for?: string
          attempts?: number
          max_attempts?: number
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          sent_at?: string | null
        }
        Update: {
          status?: string
          attempts?: number
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          sent_at?: string | null
          scheduled_for?: string
        }
        Relationships: Rel[]
      }
      sales_leads: {
        Row: { id: string; google_place_id: string | null; name: string; formatted_address: string | null; phone: string | null; international_phone: string | null; email: string | null; website: string | null; instagram_url: string | null; facebook_url: string | null; google_maps_url: string | null; latitude: number | null; longitude: number | null; rating: number | null; user_ratings_total: number | null; business_status: string | null; primary_type: string | null; types: string[] | null; city: string | null; country_code: string | null; status: string; priority: number; notes: string | null; sports: string[]; is_martial_arts: boolean; next_followup_at: string | null; last_contacted_at: string | null; followup_reminded_at: string | null; contact_count: number; next_action: string | null; next_action_at: string | null; last_action_kind: string | null; lost_reason: string | null; converted_gym_id: string | null; converted_at: string | null; assigned_to: string | null; created_by: string | null; created_at: string; updated_at: string }
        Insert: { name: string; google_place_id?: string | null; formatted_address?: string | null; phone?: string | null; international_phone?: string | null; email?: string | null; website?: string | null; instagram_url?: string | null; facebook_url?: string | null; google_maps_url?: string | null; latitude?: number | null; longitude?: number | null; rating?: number | null; user_ratings_total?: number | null; business_status?: string | null; primary_type?: string | null; types?: string[] | null; city?: string | null; country_code?: string | null; status?: string; priority?: number; notes?: string | null; sports?: string[]; is_martial_arts?: boolean; next_followup_at?: string | null; last_contacted_at?: string | null; next_action?: string | null; next_action_at?: string | null; last_action_kind?: string | null; lost_reason?: string | null; assigned_to?: string | null; created_by?: string | null }
        Update: { name?: string; phone?: string | null; email?: string | null; website?: string | null; instagram_url?: string | null; facebook_url?: string | null; city?: string | null; status?: string; priority?: number; notes?: string | null; sports?: string[]; is_martial_arts?: boolean; next_followup_at?: string | null; last_contacted_at?: string | null; contact_count?: number; next_action?: string | null; next_action_at?: string | null; last_action_kind?: string | null; lost_reason?: string | null; converted_gym_id?: string | null; converted_at?: string | null; assigned_to?: string | null; formatted_address?: string | null; international_phone?: string | null; google_maps_url?: string | null; latitude?: number | null; longitude?: number | null; rating?: number | null; user_ratings_total?: number | null; business_status?: string | null; primary_type?: string | null; types?: string[] | null }
        Relationships: Rel[]
      }
      sales_activities: {
        Row: { id: string; lead_id: string; user_id: string | null; kind: string; outcome: string | null; subject: string | null; body: string | null; duration_seconds: number | null; occurred_at: string; created_at: string }
        Insert: { lead_id: string; kind: string; user_id?: string | null; outcome?: string | null; subject?: string | null; body?: string | null; duration_seconds?: number | null; occurred_at?: string }
        Update: { outcome?: string | null; subject?: string | null; body?: string | null; duration_seconds?: number | null; occurred_at?: string }
        Relationships: Rel[]
      }
      sales_search_history: {
        Row: { id: string; query: string; bias_lat: number | null; bias_lng: number | null; bias_radius: number | null; result_count: number; inserted_count: number; updated_count: number; pages_called: number; ran_by: string | null; ran_at: string }
        Insert: { query: string; bias_lat?: number | null; bias_lng?: number | null; bias_radius?: number | null; result_count?: number; inserted_count?: number; updated_count?: number; pages_called?: number; ran_by?: string | null }
        Update: { result_count?: number; inserted_count?: number; updated_count?: number; pages_called?: number; ran_at?: string }
        Relationships: Rel[]
      }
      avv_acceptances: {
        Row: { id: string; gym_id: string; user_id: string; signed_name: string; signed_role: string | null; signed_email: string; avv_version: string; accepted_at: string; ip_address: string | null; user_agent: string | null; withdrawn_at: string | null; withdrawn_reason: string | null; created_at: string }
        Insert: { gym_id: string; user_id: string; signed_name: string; signed_email: string; avv_version: string; signed_role?: string | null; ip_address?: string | null; user_agent?: string | null }
        Update: { withdrawn_at?: string | null; withdrawn_reason?: string | null }
        Relationships: Rel[]
      }
      page_views: {
        Row: { id: string; path: string; referrer_domain: string | null; country: string | null; device_type: string | null; browser: string | null; visitor_hash: string | null; session_hash: string | null; created_at: string; is_bot: boolean; event_type: string; event_target: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; referrer_source: string | null }
        Insert: { path: string; referrer_domain?: string | null; country?: string | null; device_type?: string | null; browser?: string | null; visitor_hash?: string | null; session_hash?: string | null; is_bot?: boolean; event_type?: string; event_target?: string | null; utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; referrer_source?: string | null }
        Update: never
        Relationships: Rel[]
      }
      page_views_daily: {
        Row: { date: string; path: string; event_type: string; country: string | null; device_type: string | null; browser: string | null; referrer_source: string | null; unique_visitors: number; total_views: number }
        Insert: { date: string; path: string; event_type?: string; country?: string | null; device_type?: string | null; browser?: string | null; referrer_source?: string | null; unique_visitors?: number; total_views?: number }
        Update: { unique_visitors?: number; total_views?: number }
        Relationships: Rel[]
      }
      gym_bulk_mails: {
        Row: { id: string; gym_id: string; sent_by: string | null; subject: string; body_preview: string | null; audience: string; filter_status: string | null; recipients_count: number; sent_count: number; failed_count: number; created_at: string; kind: string | null; cover_url: string | null }
        Insert: { gym_id: string; subject: string; audience: string; sent_by?: string | null; body_preview?: string | null; filter_status?: string | null; recipients_count?: number; sent_count?: number; failed_count?: number; kind?: string | null; cover_url?: string | null }
        Update: { sent_count?: number; failed_count?: number; kind?: string | null; cover_url?: string | null }
        Relationships: Rel[]
      }
      newsletter_subscribers: {
        Row: { id: string; email: string; status: string; confirm_token: string; unsubscribe_token: string; source: string | null; ip_address: string | null; user_agent: string | null; subscribed_at: string; confirmed_at: string | null; unsubscribed_at: string | null; unsubscribe_reason: string | null; created_at: string }
        Insert: { email: string; confirm_token: string; status?: string; unsubscribe_token?: string; source?: string | null; ip_address?: string | null; user_agent?: string | null }
        Update: { email?: string; status?: string; confirm_token?: string; source?: string | null; ip_address?: string | null; user_agent?: string | null; subscribed_at?: string; confirmed_at?: string | null; unsubscribed_at?: string | null; unsubscribe_reason?: string | null }
        Relationships: Rel[]
      }
      belt_promotions: {
        Row: { id: string; member_id: string; gym_id: string; previous_belt: Belt; previous_stripes: number; new_belt: Belt; new_stripes: number; promoted_at: string; notes: string | null }
        Insert: { member_id: string; gym_id: string; previous_belt: Belt; previous_stripes: number; new_belt: Belt; new_stripes: number; notes?: string | null }
        Update: { notes?: string | null }
        Relationships: Rel[]
      }
      attendance: {
        Row: { id: string; member_id: string; gym_id: string; checked_in_at: string; class_type: ClassType; checked_out_at: string | null; class_id: string | null; via_wellpass: boolean | null; membership_source_at_checkin: string | null }
        Insert: { member_id: string; gym_id: string; class_type?: ClassType; checked_in_at?: string; checked_out_at?: string | null; class_id?: string | null; via_wellpass?: boolean | null; membership_source_at_checkin?: string | null }
        Update: { class_type?: ClassType; checked_out_at?: string | null; class_id?: string | null; via_wellpass?: boolean | null; membership_source_at_checkin?: string | null }
        Relationships: Rel[]
      }
      classes: {
        Row: { id: string; gym_id: string; title: string; class_type: ClassType; description: string | null; instructor: string | null; starts_at: string; ends_at: string; max_capacity: number | null; is_cancelled: boolean; recurrence_type: string; recurrence_until: string | null; recurrence_parent_id: string | null; created_at: string }
        Insert: { gym_id: string; title: string; class_type: ClassType; description?: string | null; instructor?: string | null; starts_at: string; ends_at: string; max_capacity?: number | null; is_cancelled?: boolean; recurrence_type?: string; recurrence_until?: string | null; recurrence_parent_id?: string | null }
        Update: { title?: string; class_type?: ClassType; description?: string | null; instructor?: string | null; starts_at?: string; ends_at?: string; max_capacity?: number | null; is_cancelled?: boolean; recurrence_type?: string; recurrence_until?: string | null; recurrence_parent_id?: string | null }
        Relationships: Rel[]
      }
      class_bookings: {
        Row: { id: string; class_id: string; member_id: string; gym_id: string; status: BookingStatus; created_at: string }
        Insert: { class_id: string; member_id: string; gym_id: string; status?: BookingStatus }
        Update: { status?: BookingStatus }
        Relationships: Rel[]
      }
      membership_plans: {
        Row: { id: string; gym_id: string; name: string; description: string | null; price_cents: number; billing_interval: string; contract_months: number; sort_order: number; is_active: boolean; stripe_price_id: string | null; stripe_product_id: string | null; created_at: string; kind: MembershipPlanKind; punch_units: number | null; auto_renew: boolean }
        Insert: { gym_id: string; name: string; description?: string | null; price_cents: number; billing_interval?: string; contract_months?: number; sort_order?: number; is_active?: boolean; stripe_price_id?: string | null; stripe_product_id?: string | null; kind?: MembershipPlanKind; punch_units?: number | null; auto_renew?: boolean }
        Update: { name?: string; description?: string | null; price_cents?: number; billing_interval?: string; contract_months?: number; sort_order?: number; is_active?: boolean; stripe_price_id?: string | null; stripe_product_id?: string | null; kind?: MembershipPlanKind; punch_units?: number | null; auto_renew?: boolean }
        Relationships: Rel[]
      }
      punch_card_purchases: {
        Row: { id: string; gym_id: string; member_id: string; plan_id: string | null; units_purchased: number; amount_cents: number; stripe_payment_intent_id: string | null; note: string | null; paid_at: string; created_at: string }
        Insert: { gym_id: string; member_id: string; plan_id?: string | null; units_purchased: number; amount_cents: number; stripe_payment_intent_id?: string | null; note?: string | null; paid_at?: string }
        Update: { units_purchased?: number; amount_cents?: number; stripe_payment_intent_id?: string | null; note?: string | null; paid_at?: string }
        Relationships: Rel[]
      }
      member_contracts: {
        Row: { id: string; gym_id: string; member_id: string; plan_id: string | null; start_date: string; initial_term_months: number; original_end_date: string | null; effective_end_date: string | null; status: ContractStatus; is_first_term: boolean; monthly_fee_cents: number | null; billing_interval: string | null; notice_period_days: number; notice_period_days_after_first_term: number; contract_signed_at: string | null; contract_template_version: string | null; notes: string | null; created_at: string; updated_at: string }
        Insert: { gym_id: string; member_id: string; plan_id?: string | null; start_date: string; initial_term_months?: number; original_end_date?: string | null; effective_end_date?: string | null; status?: ContractStatus; is_first_term?: boolean; monthly_fee_cents?: number | null; billing_interval?: string | null; notice_period_days?: number; notice_period_days_after_first_term?: number; contract_signed_at?: string | null; contract_template_version?: string | null; notes?: string | null }
        Update: { plan_id?: string | null; initial_term_months?: number; original_end_date?: string | null; effective_end_date?: string | null; status?: ContractStatus; is_first_term?: boolean; monthly_fee_cents?: number | null; billing_interval?: string | null; notice_period_days?: number; notice_period_days_after_first_term?: number; contract_signed_at?: string | null; contract_template_version?: string | null; notes?: string | null }
        Relationships: Rel[]
      }
      contract_pauses: {
        Row: { id: string; gym_id: string; contract_id: string; member_id: string; paused_from: string; paused_until: string | null; reason: PauseReason; reason_note: string | null; extends_contract: boolean; days_added_to_contract: number | null; created_by_user_id: string | null; created_by_role: ContractRole; closed_at: string | null; closed_by_user_id: string | null; created_at: string }
        Insert: { gym_id: string; contract_id: string; member_id: string; paused_from: string; paused_until?: string | null; reason: PauseReason; reason_note?: string | null; extends_contract?: boolean; created_by_user_id?: string | null; created_by_role: ContractRole }
        Update: { paused_until?: string | null; reason_note?: string | null; days_added_to_contract?: number | null; closed_at?: string | null; closed_by_user_id?: string | null }
        Relationships: Rel[]
      }
      contract_terminations: {
        Row: { id: string; gym_id: string; contract_id: string; member_id: string; requested_by_role: 'member'|'owner'; requested_by_user_id: string | null; termination_kind: TerminationKind; reason_category: TerminationReasonCategory | null; reason_text: string; effective_date: string; status: TerminationStatus; accepted_by_user_id: string | null; accepted_at: string | null; rejected_reason: string | null; communicated_at: string | null; communication_method: CommunicationMethod | null; created_at: string }
        Insert: { gym_id: string; contract_id: string; member_id: string; requested_by_role: 'member'|'owner'; requested_by_user_id?: string | null; termination_kind: TerminationKind; reason_category?: TerminationReasonCategory | null; reason_text: string; effective_date: string; status?: TerminationStatus }
        Update: { status?: TerminationStatus; accepted_by_user_id?: string | null; accepted_at?: string | null; rejected_reason?: string | null; communicated_at?: string | null; communication_method?: CommunicationMethod | null }
        Relationships: Rel[]
      }
      plan_price_changes: {
        Row: { id: string; gym_id: string; plan_id: string; old_price_cents: number; new_price_cents: number; pct_change: number | null; announced_at: string; effective_date: string; objection_deadline: string; notification_sent_at: string | null; notification_count: number; applied_at: string | null; stripe_price_id_new: string | null; apply_error: string | null; apply_attempts: number; created_at: string }
        Insert: { gym_id: string; plan_id: string; old_price_cents: number; new_price_cents: number; effective_date: string; objection_deadline: string }
        Update: { notification_sent_at?: string | null; notification_count?: number; applied_at?: string | null; stripe_price_id_new?: string | null; apply_error?: string | null; apply_attempts?: number }
        Relationships: Rel[]
      }
      leads: {
        Row: { id: string; gym_id: string; first_name: string; last_name: string; email: string | null; phone: string | null; status: LeadStatus; source: LeadSource; notes: string | null; trial_date: string | null; referred_by: string | null; lead_token: string | null; created_at: string; contacted_at: string | null; converted_at: string | null; marketing_email_consent: boolean; marketing_consent_at: string | null; marketing_unsubscribe_token: string | null; trial_consent_at: string | null; trial_consent_ip: string | null; trial_consent_ua: string | null; trial_consent_text: string | null; next_action: string | null; next_action_at: string | null; last_contacted_at: string | null; contact_count: number; lost_reason: string | null; followup_reminded_at: string | null; last_action_kind: string | null }
        Insert: { gym_id: string; first_name: string; last_name: string; email?: string | null; phone?: string | null; status?: LeadStatus; source?: LeadSource; notes?: string | null; trial_date?: string | null; referred_by?: string | null; lead_token?: string | null; marketing_email_consent?: boolean; marketing_consent_at?: string | null; trial_consent_at?: string | null; trial_consent_ip?: string | null; trial_consent_ua?: string | null; trial_consent_text?: string | null; next_action?: string | null; next_action_at?: string | null; last_contacted_at?: string | null; contact_count?: number; lost_reason?: string | null; followup_reminded_at?: string | null; last_action_kind?: string | null }
        Update: { first_name?: string; last_name?: string; email?: string | null; phone?: string | null; status?: LeadStatus; source?: LeadSource; notes?: string | null; trial_date?: string | null; referred_by?: string | null; contacted_at?: string | null; converted_at?: string | null; marketing_email_consent?: boolean; marketing_consent_at?: string | null; trial_consent_at?: string | null; trial_consent_ip?: string | null; trial_consent_ua?: string | null; trial_consent_text?: string | null; next_action?: string | null; next_action_at?: string | null; last_contacted_at?: string | null; contact_count?: number; lost_reason?: string | null; followup_reminded_at?: string | null; last_action_kind?: string | null }
        Relationships: Rel[]
      }
      lead_bookings: {
        Row: { id: string; lead_id: string; class_id: string; gym_id: string | null; status: LeadBookingStatus; booked_at: string; checked_in_at: string | null }
        Insert: { lead_id: string; class_id: string; gym_id?: string | null; status?: LeadBookingStatus }
        Update: { status?: LeadBookingStatus; checked_in_at?: string | null }
        Relationships: Rel[]
      }
      posts: {
        Row: { id: string; gym_id: string; title: string; cover_url: string | null; blocks: unknown[]; published_at: string | null; created_at: string; updated_at: string }
        Insert: { gym_id: string; title: string; cover_url?: string | null; blocks?: unknown[]; published_at?: string | null }
        Update: { title?: string; cover_url?: string | null; blocks?: unknown[]; published_at?: string | null }
        Relationships: Rel[]
      }
      gym_announcements: {
        Row: { id: string; gym_id: string; title: string; body: string | null; is_pinned: boolean; expires_at: string | null; created_at: string }
        Insert: { gym_id: string; title: string; body?: string | null; is_pinned?: boolean; expires_at?: string | null }
        Update: { title?: string; body?: string | null; is_pinned?: boolean; expires_at?: string | null }
        Relationships: Rel[]
      }
      gym_staff: {
        Row: { id: string; gym_id: string; name: string; email: string; role: string; accepted_at: string | null; invite_token: string; user_id: string | null; created_at: string }
        Insert: { gym_id: string; name: string; email: string; role?: string; invite_token: string; user_id?: string | null }
        Update: { name?: string; email?: string; role?: string; accepted_at?: string | null; user_id?: string | null }
        Relationships: [{ foreignKeyName: 'gym_staff_gym_id_fkey'; columns: ['gym_id']; isOneToOne: false; referencedRelation: 'gyms'; referencedColumns: ['id'] }]
      }
      stripe_events: {
        Row: { id: string; event_id: string; type: string | null; created_at: string; processed_at: string | null; last_error: string | null; retry_count: number }
        Insert: { event_id: string; type?: string | null; id?: string; created_at?: string; processed_at?: string | null; last_error?: string | null; retry_count?: number }
        Update: { event_id?: string; type?: string | null; id?: string; created_at?: string; processed_at?: string | null; last_error?: string | null; retry_count?: number }
        Relationships: Rel[]
      }
      training_logs: {
        Row: { id: string; gym_id: string; member_id: string; note: string | null; class_type: string | null; logged_at: string }
        Insert: { gym_id: string; member_id: string; note?: string | null; class_type?: string | null; logged_at?: string }
        Update: { note?: string | null; class_type?: string | null }
        Relationships: Rel[]
      }
    }
    Views: {
      members_trainer_view: {
        Row: { id: string; gym_id: string; first_name: string; last_name: string; belt: Belt; stripes: number | null; is_active: boolean; join_date: string | null; date_of_birth: string | null; parent_first_name: string | null; parent_phone: string | null; notes: string | null; punch_units_remaining: number | null; punch_units_total: number | null }
        Relationships: Rel[]
      }
      members_with_age: {
        Row: { id: string; gym_id: string; first_name: string; last_name: string; date_of_birth: string | null; age_years: number | null; is_minor: boolean; has_parent_signature: boolean }
        Relationships: Rel[]
      }
    } & Record<string, never>
    Functions: {
      save_stripe_account: { Args: { p_gym_id: string; p_stripe_account_id: string }; Returns: void }
      increment_invoice_counter: { Args: { p_gym_id: string }; Returns: number }
      get_classes_for_gym: { Args: { p_gym_id: string; p_from: string }; Returns: unknown[] }
      book_class_by_token: { Args: { p_token: string; p_class_id: string }; Returns: unknown }
      cancel_booking_by_token: { Args: { p_token: string; p_class_id: string }; Returns: unknown }
      delete_gym_cascade: { Args: { p_gym_id: string; p_user_id: string }; Returns: void }
      delete_member_cascade: { Args: { p_member_id: string; p_gym_id: string }; Returns: void }
      consume_punch_unit: { Args: { p_member_id: string; p_gym_id: string }; Returns: number | null }
      start_contract_pause: { Args: { p_contract_id: string; p_paused_from: string; p_reason: PauseReason; p_role: ContractRole; p_reason_note?: string | null; p_extends_contract?: boolean; p_user_id?: string | null }; Returns: string }
      close_contract_pause: { Args: { p_pause_id: string; p_paused_until: string; p_user_id?: string | null }; Returns: number }
      request_contract_termination: { Args: { p_contract_id: string; p_requested_by_role: 'member'|'owner'; p_termination_kind: TerminationKind; p_reason_text: string; p_effective_date: string; p_reason_category?: TerminationReasonCategory | null; p_user_id?: string | null }; Returns: string }
      accept_contract_termination: { Args: { p_termination_id: string; p_user_id?: string | null; p_communication_method?: CommunicationMethod }; Returns: null }
      reject_contract_termination: { Args: { p_termination_id: string; p_rejected_reason: string; p_user_id?: string | null }; Returns: null }
      withdraw_contract_termination: { Args: { p_termination_id: string; p_user_id?: string | null }; Returns: null }
    }
  }
}
