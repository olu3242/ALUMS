-- Founding community (PRD/BRD). Institution is intentionally NULL until confirmed — never invent it.
insert into public.class_communities (slug, name, department_name, graduation_year, description, status, is_founding, verified_at)
values ('accounting-class-of-2007', 'Accounting — Class of 2007', 'Accounting', 2007,
        'The founding community on ALUMS. The institution will be shown once it is verified.', 'active', true, now())
on conflict (slug) do nothing;
