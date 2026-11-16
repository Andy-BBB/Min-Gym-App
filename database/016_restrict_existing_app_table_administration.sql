-- Migration candidate 016: administrative privileges on 12 EXISTING app tables.
-- Apply only after separate approval, after baseline and migration 015.
-- Does not change data, policies, functions, ownership, or default ACLs.
-- service_role and all existing column ACLs must remain unchanged.

BEGIN;

SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration_016$
DECLARE
    app_tables CONSTANT text[] := ARRAY[
        'categories', 'exercise_library', 'exercise_strength_goals',
        'workout_plans', 'plan_exercises', 'plan_sets',
        'workout_sessions', 'session_exercises', 'session_sets',
        'workspace_training_settings', 'workspaces', 'workspace_members'
    ];
    administrative_privileges CONSTANT text[] :=
        ARRAY['TRUNCATE', 'MAINTAIN', 'REFERENCES', 'TRIGGER'];
    table_name text;
    role_name text;
    privilege_name text;
    relation_id oid;
    role_id oid;
    column_info record;
    phase integer;
    state jsonb;
    state_before jsonb;
BEGIN
    -- Deliberately reject unreviewed server versions and execution roles.
    IF current_setting('server_version_num')::integer / 10000 <> 17
       OR current_user <> 'postgres' THEN
        RAISE EXCEPTION '016 requires PostgreSQL 17 and current_user postgres';
    END IF;

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        role_id := to_regrole(role_name)::oid;
        IF role_id IS NULL THEN
            RAISE EXCEPTION 'Required role is missing: %', role_name;
        END IF;
        IF role_name <> 'service_role' AND EXISTS (
            SELECT 1 FROM pg_roles
            WHERE oid = role_id AND (rolsuper OR rolbypassrls)
        ) THEN
            RAISE EXCEPTION 'Unexpected elevated client role: %', role_name;
        END IF;
    END LOOP;

    FOREACH table_name IN ARRAY app_tables LOOP
        relation_id := to_regclass(format('public.%I', table_name))::oid;
        IF relation_id IS NULL THEN
            RAISE EXCEPTION 'Required app table is missing: public.%', table_name;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_class
            WHERE oid = relation_id AND relkind = 'r'
              AND relowner = 'postgres'::regrole AND relrowsecurity
        ) THEN
            RAISE EXCEPTION 'Unexpected type, owner or RLS: public.%', table_name;
        END IF;
    END LOOP;

    -- Presence check for the reviewed 015 policy set; not a file hash check.
    IF (
        SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('workspaces', 'workspace_members')
          AND policyname = ANY(ARRAY[
              '015 allow own profile update',
              '015 restrict own profile update',
              '015 deny direct membership insert',
              '015 deny direct membership delete',
              '015 allow owner workspace update',
              '015 restrict owner workspace update',
              '015 allow owner workspace delete',
              '015 restrict owner workspace delete',
              '015 deny direct workspace insert'
          ])
    ) <> 9 THEN
        RAISE EXCEPTION 'Expected migration 015 policies are missing';
    END IF;

    -- Collect the same invariant matrix before and after the REVOKE.
    -- OID/OID/smallint overloads avoid ambiguous privilege inquiries.
    FOR phase IN 1..2 LOOP
        state := '{}'::jsonb;

        -- Read-only fingerprint: no default privilege entries may change.
        state := state || jsonb_build_object('default_acl', (
            SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid)
            FROM pg_default_acl d
        ));

        FOREACH table_name IN ARRAY app_tables LOOP
            relation_id := to_regclass(format('public.%I', table_name))::oid;

            FOR column_info IN
                SELECT attnum, attname, attacl FROM pg_attribute
                WHERE attrelid = relation_id AND attnum > 0 AND NOT attisdropped
                ORDER BY attnum
            LOOP
                -- Preserve every explicit column grant, including 015's grants.
                state := state || jsonb_build_object(
                    format('%s/column_acl/%s', table_name, column_info.attnum),
                    column_info.attacl::text
                );
            END LOOP;

            FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
                role_id := to_regrole(role_name)::oid;

                FOREACH privilege_name IN ARRAY ARRAY[
                    'SELECT', 'INSERT', 'UPDATE', 'DELETE',
                    'TRUNCATE', 'MAINTAIN', 'REFERENCES', 'TRIGGER'
                ] LOOP
                    IF role_name = 'service_role' OR privilege_name IN (
                        'SELECT', 'INSERT', 'UPDATE', 'DELETE'
                    ) THEN
                        state := state || jsonb_build_object(
                            format('%s/%s/table/%s', table_name, role_name, privilege_name),
                            jsonb_build_array(
                                has_table_privilege(role_id, relation_id, privilege_name),
                                has_table_privilege(role_id, relation_id,
                                    privilege_name || ' WITH GRANT OPTION')
                            )
                        );
                    END IF;
                END LOOP;

                FOR column_info IN
                    SELECT attnum, attname FROM pg_attribute
                    WHERE attrelid = relation_id AND attnum > 0 AND NOT attisdropped
                    ORDER BY attnum
                LOOP
                    FOREACH privilege_name IN ARRAY ARRAY[
                        'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
                    ] LOOP
                        IF privilege_name <> 'REFERENCES' OR role_name = 'service_role' THEN
                            state := state || jsonb_build_object(
                                format('%s/%s/column/%s/%s', table_name,
                                    role_name, column_info.attnum, privilege_name),
                                jsonb_build_array(
                                    has_column_privilege(role_id, relation_id,
                                        column_info.attnum, privilege_name),
                                    has_column_privilege(role_id, relation_id,
                                        column_info.attnum,
                                        privilege_name || ' WITH GRANT OPTION')
                                )
                            );
                        ELSIF phase = 2 AND has_column_privilege(
                            role_id, relation_id, column_info.attnum, 'REFERENCES'
                        ) THEN
                            -- Do not silently remove unexpected column grants.
                            RAISE EXCEPTION 'Column REFERENCES remains: % / %.%',
                                role_name, table_name, column_info.attname;
                        END IF;
                    END LOOP;
                END LOOP;

                IF phase = 2 AND role_name <> 'service_role' THEN
                    FOREACH privilege_name IN ARRAY administrative_privileges LOOP
                        IF has_table_privilege(role_id, relation_id, privilege_name) THEN
                            RAISE EXCEPTION 'Effective privilege remains: % / % / %',
                                table_name, role_name, privilege_name;
                        END IF;
                    END LOOP;
                    IF pg_has_role(role_id, 'pg_maintain'::regrole::oid, 'USAGE') THEN
                        RAISE EXCEPTION 'Client inherits pg_maintain: %', role_name;
                    END IF;
                END IF;
            END LOOP;

            IF phase = 2 AND EXISTS (
                SELECT 1 FROM pg_class c
                CROSS JOIN LATERAL aclexplode(
                    coalesce(c.relacl, acldefault('r', c.relowner))
                ) a
                WHERE c.oid = relation_id AND a.grantee = 0
                  AND a.privilege_type = ANY(administrative_privileges)
            ) THEN
                RAISE EXCEPTION 'PUBLIC administrative privilege remains: %', table_name;
            END IF;
        END LOOP;

        IF phase = 1 THEN
            state_before := state;
            FOREACH table_name IN ARRAY app_tables LOOP
                -- Only these four table privileges and these three grantees.
                -- No CASCADE: dependent grants require a separate review.
                EXECUTE format(
                    'REVOKE TRUNCATE, MAINTAIN, REFERENCES, TRIGGER '
                    'ON TABLE public.%I FROM PUBLIC, anon, authenticated RESTRICT',
                    table_name
                );
            END LOOP;
        ELSIF state IS DISTINCT FROM state_before THEN
            RAISE EXCEPTION
                'DML, column ACL, service_role or default ACL invariant changed';
        END IF;
    END LOOP;
END;
$migration_016$;

COMMIT;
