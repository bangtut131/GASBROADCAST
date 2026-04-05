-- Migration 019: Auto-Reply Advanced Filters
-- Adds targeting and exclusion columns to autoreply_rules
-- Run in Supabase SQL Editor

-- Target filters (AND logic when both set)
ALTER TABLE public.autoreply_rules
  ADD COLUMN IF NOT EXISTS target_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_group_ids UUID[] DEFAULT '{}';

-- Exclude filters  
ALTER TABLE public.autoreply_rules
  ADD COLUMN IF NOT EXISTS exclude_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclude_phones TEXT[] DEFAULT '{}';
