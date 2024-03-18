import Koa from 'koa'
import Router from '@koa/router'
import send from 'koa-send'

import createKnex from 'knex'
import knexConfig from './knexfile.mjs'

const knex = createKnex(knexConfig.development)

const app = new Koa()
const router = new Router()

const toGoogleChartDate = (date) =>
  `Date(${date.getFullYear()}, ${date.getMonth()}, ${date.getDate()}, ${date.getHours()}, ${date.getMinutes()}, ${date.getSeconds()}, ${date.getMilliseconds()})`

router.get('/', (ctx) => {
  return send(ctx, './index.html')
})

const cols = [
  'electricityDeliveredTariff1',
  'electricityDeliveredTariff2',
  'electricityDeliveredByClientTariff1',
  'electricityDeliveredByClientTariff2',
  'actualElectricityPowerDelivered',
  'actualElectricityPowerReceived',
  'instantaneousVoltageL1',
  'instantaneousVoltageL2',
  'instantaneousVoltageL3',
  'last5MinuteValueConnectedValue',
]

router.get('/data.json', async (ctx) => {
  // get period
  const now = new Date()
  const oneDayBefore = new Date()
  oneDayBefore.setDate(now.getDate() - 1)
  let period = [oneDayBefore, now] // default period
  if (ctx.request.query.period) {
    period = JSON.parse(ctx.request.query.period).map((d) => new Date(d))
  }
  if (!ctx.request.query.columns) {
    throw new Error('Columns is required')
  }

  const columns = JSON.parse(ctx.request.query.columns)

  const telegrams = await knex('telegrams')
    .select('timestamp', ...columns)
    .orderBy('timestamp')
    .where('timestamp', '>=', period[0].getTime())
    .andWhere('timestamp', '<=', period[1].getTime())

  ctx.body = {
    cols: [
      { label: 'Time', type: 'date' },
      ...columns.map((column) => ({
        label: column,
        type: 'number',
      })),
    ],
    rows: telegrams.map((data) => ({
      c: [
        { v: toGoogleChartDate(new Date(data.timestamp)) },
        ...columns.map((column) => ({ v: data[column] })),
      ],
    })),
  }
})

app.use(router.routes()).use(router.allowedMethods())

app.listen(process.env.PORT ?? 3000)
