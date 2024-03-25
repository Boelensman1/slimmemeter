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

  const telegrams = await knex('telegrams')
    .select('timestamp', ...columns)
    .from(
      knex('telegrams')
        .select(
          knex.raw('ROW_NUMBER() OVER (ORDER BY timestamp) as rownum'),
          'timestamp',
          ...columns,
        )
        .orderBy('timestamp')
        .where('timestamp', '>=', period[0].getTime())
        .andWhere('timestamp', '<=', period[1].getTime()),
    )
    .where(knex.raw('rownum % ?', [nthRow]), '=', 0)
    .orderBy('timestamp')

  return { telegrams, columns, from: period[0], to: period[1] }
}

router.get('/data.json', async (ctx) => {
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
