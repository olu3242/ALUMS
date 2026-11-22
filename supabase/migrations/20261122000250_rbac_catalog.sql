-- RBAC catalog (configuration, not tenant data). Mirrored in lib/rbac/catalog.ts; tests/catalog-sync.test.ts guards drift.
insert into public.permissions (key, description) values
  ('community.view_admin',  'Open the admin control center for a scope'),
  ('community.manage',      'Edit community details and settings'),
  ('community.create',      'Create and verify class communities'),
  ('institution.manage',    'Create and verify institutions'),
  ('member.view',           'View the member roster and membership status'),
  ('member.invite',         'Invite classmates by email'),
  ('member.suspend',        'Suspend or reinstate members'),
  ('membership.review',     'View the membership verification queue'),
  ('membership.approve',    'Approve or reject membership requests'),
  ('role.assign',           'Assign and revoke lower-ranked roles'),
  ('approval.decide',       'Independently approve critical changes'),
  ('business.review',       'Review, approve or suspend business listings'),
  ('event.create',          'Create events'),
  ('event.manage',          'Manage events, attendance and reminders'),
  ('announcement.publish',  'Publish community announcements'),
  ('gallery.manage',        'Create albums and moderate media'),
  ('moderation.resolve',    'Resolve moderation reports'),
  ('audit.view',            'View audit logs'),
  ('finance.manage',        'Manage welfare and contributions (post-MVP)'),
  ('security.manage',       'Manage security policy'),
  ('platform.settings',     'Change platform-wide settings');

insert into public.roles (key, name, description, scope_type, rank, requires_approval, is_financial, assignable) values
  ('super_admin',         'Super Admin',         'Full platform control. Bootstrap-only.',                     'platform',    100, true,  false, false),
  ('platform_admin',      'Platform Admin',      'Operates the platform across all institutions.',             'platform',     90, true,  false, true),
  ('institution_admin',   'Institution Admin',   'Administers every class community of one institution.',      'institution',  70, true,  false, true),
  ('class_admin',         'Class Admin',         'Leads one class community.',                                 'community',    50, true,  false, true),
  ('class_secretary',     'Class Secretary',     'Handles membership review, events and announcements.',       'community',    40, false, false, true),
  ('class_treasurer',     'Class Treasurer',     'Handles welfare and contributions. Financial duty.',         'community',    40, true,  true,  true),
  ('community_moderator', 'Community Moderator', 'Moderates reports and media.',                               'community',    30, false, false, true),
  ('verified_member',     'Verified Member',     'Granted by verified membership; not assigned directly.',     'community',    10, false, false, false);

insert into public.role_permissions (role_key, permission_key)
select 'super_admin', key from public.permissions
union all
select 'platform_admin', key from public.permissions where key <> 'platform.settings'
union all
select 'institution_admin', unnest(array['community.view_admin','community.manage','community.create','member.view','member.invite',
  'member.suspend','membership.review','membership.approve','role.assign','approval.decide','business.review','event.create',
  'event.manage','announcement.publish','gallery.manage','moderation.resolve','audit.view'])
union all
select 'class_admin', unnest(array['community.view_admin','community.manage','member.view','member.invite','member.suspend',
  'membership.review','membership.approve','role.assign','approval.decide','business.review','event.create','event.manage',
  'announcement.publish','gallery.manage','moderation.resolve','audit.view'])
union all
select 'class_secretary', unnest(array['community.view_admin','member.view','member.invite','membership.review','event.create',
  'event.manage','announcement.publish','gallery.manage'])
union all
select 'class_treasurer', unnest(array['community.view_admin','member.view','finance.manage'])
union all
select 'community_moderator', unnest(array['community.view_admin','member.view','moderation.resolve','gallery.manage']);

insert into public.role_conflicts (role_a, role_b, reason) values
  ('class_admin', 'class_treasurer', 'Financial duties are separated from community administration (BR-7).');

-- Independent approval (BR-7) is enforced structurally (approval_requests check constraint) and is not a setting.
insert into public.platform_settings (key, value) values ('security.require_mfa_for_privileged', 'true'::jsonb);

insert into public.business_categories (slug, name) values
  ('accounting-finance', 'Accounting & Finance'), ('legal', 'Legal'), ('technology', 'Technology'),
  ('consulting', 'Consulting'), ('healthcare', 'Healthcare'), ('education', 'Education'),
  ('real-estate', 'Real Estate'), ('retail', 'Retail & E-commerce'), ('food-hospitality', 'Food & Hospitality'),
  ('manufacturing', 'Manufacturing'), ('media-creative', 'Media & Creative'), ('agriculture', 'Agriculture'),
  ('logistics', 'Logistics & Transport'), ('energy', 'Energy'), ('nonprofit', 'Non-profit'), ('other', 'Other');
