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

const getTelegramsAndColumnsForQuery = async (ctx, forDownload) => {
  // Get period
  const now = new Date()
  const oneDayBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  let period = [oneDayBefore, now] // default period
  if (ctx.request.query.period) {
    period = JSON.parse(ctx.request.query.period).map((d) => new Date(d))
  }
  if (!ctx.request.query.columns) {
    throw new Error('Columns is required')
  }

  const columns = JSON.parse(ctx.request.query.columns)
  const granularity = ctx.request.query.granularity || 'hour'

  if (!forDownload) {
    // Validate granularity based on period
    const periodDuration = period[1].getTime() - period[0].getTime()
    const hours = periodDuration / (60 * 60 * 1000)
    const days = hours / 24

    if (granularity === 'second' && days > 10) {
      throw new Error(
        'Second granularity is only allowed for periods up to 10 days',
      )
    }
    if (granularity === 'minute' && days > 60) {
      throw new Error(
        'Minute granularity is only allowed for periods up to 60 days',
      )
    }
  }

  let query = knex
    .with(
      'truncated_time_data',
      knex.raw(
        `SELECT
           timestamp,
           immutable_date_trunc(?, "timestamp") AS truncated_time
         FROM telegrams`,
        [granularity],
      ),
    )
    .fromRaw(`"truncated_time_data", "telegrams"`)
    .distinctOn('truncated_time_data.truncated_time')
    .whereRaw('"telegrams"."timestamp" = "truncated_time_data"."timestamp"')
    .whereBetween('truncated_time_data.truncated_time', period)
    .orderBy('truncated_time_data.truncated_time', 'DESC')

  // Add column selection
  if (columns.length > 0) {
    query = query.select('telegrams.timestamp', ...columns)
  }

  const telegrams = await query

  return { telegrams, columns, from: period[0], to: period[1] }
}

router.get('/data.json', async (ctx) => {
  console.log('Serving data.json')
  try {
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
  } catch (err) {
    ctx.status = 400
    ctx.body = err.message
  }
})

router.get('/data.xlsx', async (ctx) => {
  console.log('Serving data.xlsx')
  const { telegrams, from, to } = await getTelegramsAndColumnsForQuery(
    ctx,
    true,
  )

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
