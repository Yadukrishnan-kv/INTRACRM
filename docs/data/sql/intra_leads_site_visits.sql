-- =============================================================================
-- INTRA LEADS — site visit module: GPS, photos, notes, customer feedback
-- Apply after intra_leads_follow_up_engine.sql
-- Idempotent. Extends site_visits; photos live in files + site_visit_photos.
-- =============================================================================

BEGIN;

ALTER TABLE site_visits
    ADD COLUMN IF NOT EXISTS scheduled_lat numeric(9, 6),
    ADD COLUMN IF NOT EXISTS scheduled_lng numeric(9, 6),
    ADD COLUMN IF NOT EXISTS check_in_lat numeric(9, 6),
    ADD COLUMN IF NOT EXISTS check_in_lng numeric(9, 6),
    ADD COLUMN IF NOT EXISTS check_in_accuracy_m numeric(8, 2),
    ADD COLUMN IF NOT EXISTS check_out_lat numeric(9, 6),
    ADD COLUMN IF NOT EXISTS check_out_lng numeric(9, 6),
    ADD COLUMN IF NOT EXISTS check_out_accuracy_m numeric(8, 2),
    ADD COLUMN IF NOT EXISTS customer_feedback text,
    ADD COLUMN IF NOT EXISTS customer_rating smallint,
    ADD COLUMN IF NOT EXISTS feedback_captured_at timestamptz;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_site_visits_rating'
    ) THEN
        ALTER TABLE site_visits
            ADD CONSTRAINT chk_site_visits_rating CHECK (
                customer_rating IS NULL OR customer_rating BETWEEN 1 AND 5
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_site_visits_check_in_lat'
    ) THEN
        ALTER TABLE site_visits
            ADD CONSTRAINT chk_site_visits_check_in_lat CHECK (
                check_in_lat IS NULL OR check_in_lat BETWEEN -90 AND 90
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_site_visits_check_in_lng'
    ) THEN
        ALTER TABLE site_visits
            ADD CONSTRAINT chk_site_visits_check_in_lng CHECK (
                check_in_lng IS NULL OR check_in_lng BETWEEN -180 AND 180
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_site_visits_check_out_lat'
    ) THEN
        ALTER TABLE site_visits
            ADD CONSTRAINT chk_site_visits_check_out_lat CHECK (
                check_out_lat IS NULL OR check_out_lat BETWEEN -90 AND 90
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_site_visits_check_out_lng'
    ) THEN
        ALTER TABLE site_visits
            ADD CONSTRAINT chk_site_visits_check_out_lng CHECK (
                check_out_lng IS NULL OR check_out_lng BETWEEN -180 AND 180
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_site_visits_scheduled_lat'
    ) THEN
        ALTER TABLE site_visits
            ADD CONSTRAINT chk_site_visits_scheduled_lat CHECK (
                scheduled_lat IS NULL OR scheduled_lat BETWEEN -90 AND 90
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_site_visits_scheduled_lng'
    ) THEN
        ALTER TABLE site_visits
            ADD CONSTRAINT chk_site_visits_scheduled_lng CHECK (
                scheduled_lng IS NULL OR scheduled_lng BETWEEN -180 AND 180
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_site_visits_check_in_pair'
    ) THEN
        ALTER TABLE site_visits
            ADD CONSTRAINT chk_site_visits_check_in_pair CHECK (
                (check_in_lat IS NULL) = (check_in_lng IS NULL)
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_site_visits_check_out_pair'
    ) THEN
        ALTER TABLE site_visits
            ADD CONSTRAINT chk_site_visits_check_out_pair CHECK (
                (check_out_lat IS NULL) = (check_out_lng IS NULL)
            );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.sync_site_visit_geo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.check_in_lat IS NOT NULL AND NEW.check_in_lng IS NOT NULL THEN
        NEW.check_in_geo := point(NEW.check_in_lng, NEW.check_in_lat);
    END IF;
    IF NEW.check_out_lat IS NOT NULL AND NEW.check_out_lng IS NOT NULL THEN
        NEW.check_out_geo := point(NEW.check_out_lng, NEW.check_out_lat);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_visits_geo ON site_visits;
CREATE TRIGGER trg_site_visits_geo
    BEFORE INSERT OR UPDATE OF check_in_lat, check_in_lng, check_out_lat, check_out_lng
    ON site_visits
    FOR EACH ROW
    EXECUTE FUNCTION app.sync_site_visit_geo();

CREATE TABLE IF NOT EXISTS site_visit_photos (
    id                  uuid PRIMARY KEY DEFAULT app.uuid_v7(),
    tenant_id           uuid NOT NULL,
    site_visit_id       uuid NOT NULL,
    file_id             uuid NOT NULL,
    caption             text,
    captured_at         timestamptz NOT NULL DEFAULT now(),
    captured_lat        numeric(9, 6),
    captured_lng        numeric(9, 6),
    captured_accuracy_m numeric(8, 2),
    sort_order          smallint NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    deleted_at          timestamptz,
    deleted_by          uuid,
    version             integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_site_visit_photos_lat CHECK (
        captured_lat IS NULL OR captured_lat BETWEEN -90 AND 90
    ),
    CONSTRAINT chk_site_visit_photos_lng CHECK (
        captured_lng IS NULL OR captured_lng BETWEEN -180 AND 180
    ),
    CONSTRAINT chk_site_visit_photos_pair CHECK (
        (captured_lat IS NULL) = (captured_lng IS NULL)
    ),
    CONSTRAINT chk_site_visit_photos_version CHECK (version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_visit_photos_file
    ON site_visit_photos (file_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_site_visit_photos_visit
    ON site_visit_photos (tenant_id, site_visit_id, sort_order, created_at)
    WHERE deleted_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_site_visit_photos_tenant'
    ) THEN
        ALTER TABLE site_visit_photos
            ADD CONSTRAINT fk_site_visit_photos_tenant
            FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_site_visit_photos_visit'
    ) THEN
        ALTER TABLE site_visit_photos
            ADD CONSTRAINT fk_site_visit_photos_visit
            FOREIGN KEY (site_visit_id) REFERENCES site_visits (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_site_visit_photos_file'
    ) THEN
        ALTER TABLE site_visit_photos
            ADD CONSTRAINT fk_site_visit_photos_file
            FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_site_visit_photos_created_by'
    ) THEN
        ALTER TABLE site_visit_photos
            ADD CONSTRAINT fk_site_visit_photos_created_by
            FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_site_visit_photos_updated_by'
    ) THEN
        ALTER TABLE site_visit_photos
            ADD CONSTRAINT fk_site_visit_photos_updated_by
            FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_site_visit_photos_deleted_by'
    ) THEN
        ALTER TABLE site_visit_photos
            ADD CONSTRAINT fk_site_visit_photos_deleted_by
            FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.enforce_same_tenant_from_site_visit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_tenant uuid;
BEGIN
    SELECT v.tenant_id
    INTO parent_tenant
    FROM site_visits v
    WHERE v.id = NEW.site_visit_id;

    IF parent_tenant IS NULL THEN
        RAISE EXCEPTION 'site visit % not found', NEW.site_visit_id
            USING ERRCODE = '23503';
    END IF;

    IF parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'tenant_id % does not match site visit % tenant %',
            NEW.tenant_id, NEW.site_visit_id, parent_tenant
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_visit_photos_tenant ON site_visit_photos;
CREATE TRIGGER trg_site_visit_photos_tenant
    BEFORE INSERT OR UPDATE OF tenant_id, site_visit_id
    ON site_visit_photos
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_same_tenant_from_site_visit();

COMMENT ON TABLE site_visit_photos IS
    'Field photos for a site visit. Bytes live in files; GPS is captured at shutter time.';
COMMENT ON COLUMN site_visits.customer_feedback IS
    'Free-text customer feedback captured on site.';
COMMENT ON COLUMN site_visits.customer_rating IS
    'Optional 1-5 customer rating captured on site.';

COMMIT;
