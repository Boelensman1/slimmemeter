/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.alterTable('telegrams', async (table) => {
    table.dropColumn('createdAt')
  })

  await knex.schema.raw(`
      CREATE OR REPLACE FUNCTION immutable_date_trunc(interval_type text, ts timestamp with time zone)
      RETURNS timestamp with time zone
      AS $$
      BEGIN
          RETURN CASE
              WHEN interval_type = 'minute' THEN
                  date_trunc('minute', ts)
              WHEN interval_type = 'hour' THEN
                  date_trunc('hour', ts)
              WHEN interval_type = 'day' THEN
                  date_trunc('day', ts)
              WHEN interval_type = 'week' THEN
                  date_trunc('week', ts)
              WHEN interval_type = 'month' THEN
                  date_trunc('month', ts)
              WHEN interval_type = 'year' THEN
                  date_trunc('year', ts)
              ELSE
                  NULL
          END;
      END;
      $$
      LANGUAGE plpgsql IMMUTABLE;
    `)

  await knex.schema.raw(`
        CREATE INDEX idx_telegrams_minute_timestamp 
        ON telegrams (immutable_date_trunc('minute', "timestamp"), "timestamp" DESC);`)
  await knex.schema.raw(`
        CREATE INDEX idx_telegrams_hour_timestamp 
        ON telegrams (immutable_date_trunc('hour', "timestamp"), "timestamp" DESC);`)
  await knex.schema.raw(`
        CREATE INDEX idx_telegrams_day_timestamp 
        ON telegrams (immutable_date_trunc('day', "timestamp"), "timestamp" DESC);`)
  await knex.schema.raw(`
        CREATE INDEX idx_telegrams_week_timestamp 
        ON telegrams (immutable_date_trunc('week', "timestamp"), "timestamp" DESC);`)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.alterTable('telegrams', async (table) => {
    table.timestamp('createdAt').defaultTo(knex.fn.now())
  })

  await knex.schema.raw('DROP INDEX IF EXISTS idx_telegrams_minute_timestamp')
  await knex.schema.raw('DROP INDEX IF EXISTS idx_telegrams_hour_timestamp')
  await knex.schema.raw('DROP INDEX IF EXISTS idx_telegrams_day_timestamp')
  await knex.schema.raw('DROP INDEX IF EXISTS idx_telegrams_week_timestamp')
  await knex.schema.raw(
    'DROP FUNCTION IF EXISTS immutable_date_trunc(text, timestamp with time zone)',
  )
}
