import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'

// import fs from 'node:fs'
import createKnex from 'knex'
import knexConfig from './knexfile.mjs'

const knex = createKnex(knexConfig.development)

const headerMatcher = 'ESMR5.0'
const sampleDensity = 0.15

const parseNumericValue = (line) => {
  const parts = line.split('*')

  const value = parseFloat(parts[0].split('(')[1])
  if (parts.length > 1) {
    return {
      value,
      unit: parts[1].slice(0, -1),
    }
  }
  return {
    value,
  }
}

const parseStringValue = (line) => {
  return line.match(/\((.*?)\)/)[1]
}

const parseDateTime = (line) => {
  const match = line.match(
    /\((\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})[A-Z]\)/,
  )
  if (match) {
    const [_, year, month, day, hours, minutes, seconds] = match.map(Number)
    // Assuming the year 2000 as the base for two-digit years.
    const fullYear = 2000 + year
    // JavaScript months are 0-indexed, so subtract 1 from the month.
    const dateObject = new Date(
      fullYear,
      month - 1,
      day,
      hours,
      minutes,
      seconds,
    )

    // The DST indicator is not used atm, will have to check what happens when the timezone changes

    return dateObject
  }
  throw new Error(`Invalid datetime format for line: "${line}"`)
}

const parsePowerFailureEventLog = (line) => {
  const matches = line
    .match(/\((.*?)\)/g)
    .map((match) => match.replace(/\(|\)/g, ''))
  const durationWithUnit = matches[3].split('*')
  return {
    count: parseInt(matches[0], 10),
    obisCode: matches[1],
    timestamp: parseDateTime(`(${matches[2]})`),
    duration: {
      value: parseFloat(durationWithUnit[0]),
      unit: durationWithUnit[1],
    },
  }
}

const parseLast5MinuteValue = (line) => {
  const parts = line
    .match(/\((.*?)\)/g)
    .map((part) => part.replace(/\(|\)/g, ''))
  // Assuming the structure is always: timestamp, value (with unit)
  const valueWithUnit = parts[1].split('*')
  return {
    timestamp: parseDateTime(`(${parts[0]})`),
    value: parseFloat(valueWithUnit[0]),
    unit: valueWithUnit[1],
  }
}

const telegramKeyMap = {
  '1-3:0.2.8': ['versionInformation', parseStringValue],
  '0-0:1.0.0': ['timeStamp', parseDateTime],
  '0-0:96.1.1': ['equipmentIdentifier', parseStringValue],
  '1-0:1.8.1': ['electricityDeliveredTariff1', parseNumericValue],
  '1-0:1.8.2': ['electricityDeliveredTariff2', parseNumericValue],
  '1-0:2.8.1': ['electricityDeliveredByClientTariff1', parseNumericValue],
  '1-0:2.8.2': ['electricityDeliveredByClientTariff2', parseNumericValue],
  '0-0:96.14.0': ['tariffIndicator', parseNumericValue],
  '1-0:1.7.0': ['actualElectricityPowerDelivered', parseNumericValue],
  '1-0:2.7.0': ['actualElectricityPowerReceived', parseNumericValue],
  '0-0:96.7.21': ['numberOfPowerFailures', parseNumericValue],
  '0-0:96.7.9': ['numberOfLongPowerFailures', parseNumericValue],
  '1-0:99.97.0': ['powerFailureEventLog', parsePowerFailureEventLog],
  '0-0:96.7.19': ['formatOfLogEntries', parseStringValue],
  '1-0:32.32.0': ['numberOfVoltageSagsL1', parseNumericValue],
  '1-0:52.32.0': ['numberOfVoltageSagsL2', parseNumericValue],
  '1-0:72.32.0': ['numberOfVoltageSagsL3', parseNumericValue],
  '1-0:32.36.0': ['numberOfVoltageSwellsL1', parseNumericValue],
  '1-0:52.36.0': ['numberOfVoltageSwellsL2', parseNumericValue],
  '1-0:72.36.0': ['numberOfVoltageSwellsL3', parseNumericValue],
  '0-0:96.13.0': ['textMessage', parseStringValue],
  '1-0:32.7.0': ['instantaneousVoltageL1', parseNumericValue],
  '1-0:52.7.0': ['instantaneousVoltageL2', parseNumericValue],
  '1-0:72.7.0': ['instantaneousVoltageL3', parseNumericValue],
  '1-0:31.7.0': ['instantaneousCurrentL1', parseNumericValue],
  '1-0:51.7.0': ['instantaneousCurrentL2', parseNumericValue],
  '1-0:71.7.0': ['instantaneousCurrentL3', parseNumericValue],
  '1-0:21.7.0': ['instantaneousActivePowerL1Positive', parseNumericValue],
  '1-0:41.7.0': ['instantaneousActivePowerL2Positive', parseNumericValue],
  '1-0:61.7.0': ['instantaneousActivePowerL3Positive', parseNumericValue],
  '1-0:22.7.0': ['instantaneousActivePowerL1Negative', parseNumericValue],
  '1-0:42.7.0': ['instantaneousActivePowerL2Negative', parseNumericValue],
  '1-0:62.7.0': ['instantaneousActivePowerL3Negative', parseNumericValue],
  '0-1:24.1.0': ['deviceType', parseNumericValue],
  '0-1:96.1.0': ['equipmentIdentifierMbus', parseStringValue],
  '0-1:24.2.1': ['last5MinuteValueConnected', parseLast5MinuteValue],
}

const parseTelegram = (telegram) => {
  const parsedTelegram = {}
  telegram.forEach((line, i) => {
    if (i === 0) {
      parsedTelegram.header = line
      return
    }
    if (line.startsWith('!')) {
      parsedTelegram.endIndicator = line
      return
    }

    if (!line.includes('(')) {
      throw new Error(`Line ${i} has unexpected format: "${line}"`)
    }
    const key = line.split('(')[0]
    if (!telegramKeyMap[key]) {
      throw new Error(`Line ${i} has unexpected key: "${key}"`)
    }

    const [label, valueParser] = telegramKeyMap[key]
    parsedTelegram[label] = valueParser(line)
  })
  return parsedTelegram
}

const pushToDb = async (telegram) => {
  await knex('telegrams').insert({
    electricityDeliveredTariff1: telegram.electricityDeliveredTariff1.value,
    electricityDeliveredTariff2: telegram.electricityDeliveredTariff2.value,
    electricityDeliveredByClientTariff1:
      telegram.electricityDeliveredByClientTariff1.value,
    electricityDeliveredByClientTariff2:
      telegram.electricityDeliveredByClientTariff2.value,
    actualElectricityPowerDelivered:
      telegram.actualElectricityPowerDelivered.value,
    actualElectricityPowerReceived:
      telegram.actualElectricityPowerReceived.value,
    instantaneousVoltageL1: telegram.instantaneousVoltageL1.value,
    instantaneousVoltageL2: telegram.instantaneousVoltageL2.value,
    instantaneousVoltageL3: telegram.instantaneousVoltageL3.value,
    last5MinuteValueConnectedValue: telegram.last5MinuteValueConnected.value,
    timestamp: new Date(telegram.timeStamp),
  })
}

let sampleCounter = 0
let lastTelegram = null
const onTelegram = async (telegram) => {
  try {
    lastTelegram = parseTelegram(telegram)

    sampleCounter += sampleDensity
    if (sampleCounter >= 1) {
      sampleCounter = 0
      console.log(new Date().toLocaleString(), 'Pushed telegram to db')
      await pushToDb(lastTelegram)
    }
  } catch (err) {
    console.error(err)
  }
}

let buildingTelegram = []
const onData = (data) => {
  // check if we're in a telegram
  if (buildingTelegram.length > 0) {
    buildingTelegram.push(data)

    if (data.startsWith('!')) {
      // end of telegram
      onTelegram(buildingTelegram)
      buildingTelegram = []
    }
  } else if (data.includes(headerMatcher)) {
    buildingTelegram = [data]
  }
}

/*
const testData = fs.readFileSync('./testdata.txt').toString()
testData.split('\n').forEach(onData)
*/

const port = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 115200 })

const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }))
parser.on('data', onData)

console.log('Slimmemeter reader started')
