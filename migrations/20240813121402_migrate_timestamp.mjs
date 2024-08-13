/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.alterTable('telegrams', async (table) => {
    // Add a new column of type timestamp
    table.timestamp('new_timestamp').nullable()
  })

  // Update the new column with converted values
  await knex.raw(`
          UPDATE telegrams 
          SET new_timestamp = to_timestamp("timestamp" / 1000)
        `)

  await knex.schema.alterTable('telegrams', async (table) => {
    // Drop the old timestamp column
    table.dropColumn('timestamp')
  })

  await knex.schema.alterTable('telegrams', async (table) => {
    // Rename the new column to 'timestamp'
    table.renameColumn('new_timestamp', 'timestamp')
  })

  await knex.schema.alterTable('telegrams', async (table) => {
    // Set timestamp to non nullable
    table.timestamp('timestamp').notNullable().alter()

    // Add primary key constraint to the new timestamp column
    table.primary('timestamp')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.alterTable('telegrams', async (table) => {
    // Rename the timestamp column to 'new_timestamp'
    table.renameColumn('timestamp', 'new_timestamp')
  })

  await knex.schema.alterTable('telegrams', async (table) => {
    // Add back the old timestamp column as a bigint (to store Unix timestamp)
    table.bigInteger('timestamp').nullable()
  })

  // Update the old column with converted values
  await knex.raw(`
    UPDATE telegrams 
    SET timestamp = EXTRACT(EPOCH FROM new_timestamp)::bigint
  `)

  await knex.schema.alterTable('telegrams', async (table) => {
    // Drop the new_timestamp column
    table.dropColumn('new_timestamp')
    table.primary('timestamp')
  })
}
