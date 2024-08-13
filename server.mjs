import Koa from 'koa'
import Router from '@koa/router'
import send from 'koa-send'
import xlsx from 'node-xlsx'

import createKnex from 'knex'
import knexConfig from './knexfile.mjs'

const knex = createKnex(knexConfig.development)

const app = new Koa()
const router = new Router()

const toGoogleChartDate = (date) =>
  `Date(${date.getFullYear()}, ${date.getMonth()}, ${date.getDate()}, ${date.getHours()}, ${date.getMinutes()}, ${date.getSeconds()}, ${date.getMilliseconds()})`

function filenameDate(date) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const day = date.getDate().toString().padStart(2, '0') // Ensures two-digit day
  const month = months[date.getMonth()] // Gets the month name
  const year = date.getFullYear()

  return `${month} ${day} ${year}`
}

router.get('/', (ctx) => {
  console.log('Serving index.html')
  return send(ctx, './index.html')
})

const getTelegramsAndColumnsForQuery = async (ctx) => {
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

  const granularity = Number(ctx.request.query.granularity) || 0.01
  const nthRow = Math.round(1 / granularity)

  const columns = JSON.parse(ctx.request.query.columns)

  const [extremes] = await knex('telegrams').select(
    knex.raw('MIN(timestamp)'),
    knex.raw('MAX(timestamp)'),
  )
  const minTimestamp = extremes['MIN(timestamp)']
  const maxTimestamp = extremes['MAX(timestamp)']

  const periodDuration =
    Math.min(maxTimestamp, period[1].getTime()) -
    Math.max(minTimestamp, period[0].getTime())
  const recordsEstimation = periodDuration / 7 / nthRow

  if (recordsEstimation > 10 ** 6) {
    throw new Error('Too many rows')
  }

  const intervalSeconds = 7 * nthRow

  const telegrams = await knex('telegrams')
    .select('timestamp', ...columns)
    .whereBetween('timestamp', [period[0].getTime(), period[1].getTime()])
    .andWhere(
      knex.raw('(timestamp - ?) % ? = 0', [
        period[0].getTime(),
        intervalSeconds * 1000, // Convert to milliseconds
      ]),
    )
    .orderBy('timestamp')

  return { telegrams, columns, from: period[0], to: period[1] }
}

router.get('/data.json', async (ctx) => {
  console.log('Serving data.json')
  const { telegrams, columns } = await getTelegramsAndColumnsForQuery(ctx)

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

router.get('/data.xlsx', async (ctx) => {
  console.log('Serving data.xlsx')
  const { telegrams, from, to } = await getTelegramsAndColumnsForQuery(ctx)

  const data = [
    Object.keys(telegrams[0]),
    ...telegrams.map((telegram) =>
      Object.values({
        ...telegram,
        timestamp: new Date(telegram.timestamp),
      }),
    ),
  ]
  var buffer = xlsx.build([{ name: 'slimmemeter', data }])
  const filename = `slimmemeter ${filenameDate(from)}-${filenameDate(to)}.xlsx`

  ctx.type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ctx.set('Content-Disposition', `attachment; filename="${filename}"`)
  ctx.body = buffer
})

app.use(router.routes()).use(router.allowedMethods())

const port = process.env.PORT ?? 3000
app.listen(port)

console.log('Slimme meter server started, listening on port', port)
