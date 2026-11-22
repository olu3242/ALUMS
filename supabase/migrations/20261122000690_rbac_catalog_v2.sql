-- RBAC catalog v2: institution branding/network and dues visibility. Mirrored in lib/rbac/catalog.ts.
insert into public.permissions (key, description) values
  ('institution.brand',   'Manage institution logo, colours and public page'),
  ('institution.network', 'Publish institution news and opportunities, and manage linkages'),
  ('finance.view',        'View dues plans, payment status and totals');

-- Grants (one row per line: parsed by tests/catalog-sync.test.ts).
insert into public.role_permissions (role_key, permission_key) values
  ('super_admin', 'institution.brand'),
  ('super_admin', 'institution.network'),
  ('super_admin', 'finance.view'),
  ('platform_admin', 'institution.brand'),
  ('platform_admin', 'institution.network'),
  ('platform_admin', 'finance.view'),
  ('institution_admin', 'institution.brand'),
  ('institution_admin', 'institution.network'),
  ('institution_admin', 'finance.view'),
  ('class_admin', 'finance.view'),
  ('class_treasurer', 'finance.view');
