export default {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: './data.sqlite3',
    },
    useNullAsDefault: true,
    migrations: {
      // important!
      loadExtensions: ['.mjs'],
    },
  },
}
