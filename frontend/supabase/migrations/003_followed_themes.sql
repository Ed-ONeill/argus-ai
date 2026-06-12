-- ============================================================
-- Migration 003: Add followed_themes to user_preferences
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Safe to run multiple times (idempotent)
-- ============================================================

alter table public.user_preferences
  add column if not exists followed_themes text[] not null default '{}';
