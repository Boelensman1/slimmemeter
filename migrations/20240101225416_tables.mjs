/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
  await knex.schema.createTable('telegrams', (table) => {
    table.integer('timestamp').primary()
    table.float('electricityDeliveredTariff1')
    table.float('electricityDeliveredTariff2')
    table.float('electricityDeliveredByClientTariff1')
    table.float('electricityDeliveredByClientTariff2')
    table.float('actualElectricityPowerDelivered')
    table.float('actualElectricityPowerReceived')
    table.smallint('instantaneousVoltageL1')
    table.smallint('instantaneousVoltageL2')
    table.smallint('instantaneousVoltageL3')
    table.float('last5MinuteValueConnectedValue')
    table.timestamp('createdAt').defaultTo(knex.fn.now())
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
  await knex.schema.dropTable('telegrams')
}
