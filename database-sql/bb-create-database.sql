\echo 'Delete and recreate babbling_bubbles db?'
\prompt 'Return for yes or control-C to cancel > ' foo

DROP DATABASE babbling_bubbles;
CREATE DATABASE babbling_bubbles;
\connect babbling_bubbles

\i bb-schema.sql

\echo 'Delete and recreate babbling_bubbles_test db?'
\prompt 'Return for yes or control-C to cancel > ' foo

DROP DATABASE babbling_bubbles_test;
CREATE DATABASE babbling_bubbles_test;
\connect babbling_bubbles_test

\i bb-schema.sql
