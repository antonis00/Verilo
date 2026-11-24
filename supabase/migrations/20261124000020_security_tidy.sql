-- Security tidy-up (Nov 2026 review).
-- Readers never truncate tables (PostgREST can't send TRUNCATE, but the grant shouldn't exist).
revoke truncate on all tables in schema public from anon, authenticated;

-- GraphQL isn't used: without it, anonymous visitors can't list the schema at /graphql/v1.
drop extension if exists pg_graphql;
