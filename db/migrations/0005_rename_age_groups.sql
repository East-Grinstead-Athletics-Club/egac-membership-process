-- ============================================================
-- EGAC Platform - Rename age group codes and labels
-- Migration: 0005_rename_age_groups.sql
--
-- U11 Academy → U12 Academy (school years 5–6)
-- U13         → U14         (school years 7–8)
-- U15 and older → U16 and older (school years 9–10+)
-- U17         → U18         (school years 11–12)
-- ============================================================

UPDATE age_groups
SET code = 'u12', label = 'U12 Academy', updated_at = datetime('now')
WHERE id = 'ag_u11';

UPDATE age_groups
SET code = 'u14', label = 'U14', updated_at = datetime('now')
WHERE id = 'ag_u13';

UPDATE age_groups
SET code = 'u16', label = 'U16 and older', updated_at = datetime('now')
WHERE id = 'ag_u15';

UPDATE age_groups
SET code = 'u18', label = 'U18', updated_at = datetime('now')
WHERE id = 'ag_u17';
