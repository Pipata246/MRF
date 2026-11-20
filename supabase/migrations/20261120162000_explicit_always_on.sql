-- Explicit is always shown; lock the column to true for all users.
update public.user_settings
set show_explicit = true
where show_explicit is distinct from true;
