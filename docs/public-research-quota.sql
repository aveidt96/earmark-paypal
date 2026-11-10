-- Apply as the owner of a dedicated non-financial database. Provision a
-- separate login for the function; replace earmark_research_app if needed.
CREATE SCHEMA earmark_research;

CREATE TABLE earmark_research.daily_quota (
  day date PRIMARY KEY,
  used integer NOT NULL CHECK (used BETWEEN 1 AND 24),
  visitors jsonb NOT NULL CHECK (jsonb_typeof(visitors) = 'object')
);

GRANT USAGE ON SCHEMA earmark_research TO earmark_research_app;
GRANT SELECT, INSERT, UPDATE ON earmark_research.daily_quota TO earmark_research_app;
