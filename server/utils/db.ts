import mysql from 'mysql2/promise'

let pool: mysql.Pool | null = null

export function getDb() {
  if (!pool) {
    const config = useRuntimeConfig()
    const missing = [
      ['NITRO_DB_HOST', config.dbHost],
      ['NITRO_DB_NAME', config.dbName],
      ['NITRO_DB_USER', config.dbUser]
    ].filter(([, value]) => !value).map(([key]) => key)
    if (missing.length) {
      throw createError({ statusCode: 500, message: `数据库配置缺失：${missing.join('、')}` })
    }
    pool = mysql.createPool({
      host: config.dbHost,
      port: Number(config.dbPort),
      user: config.dbUser,
      password: config.dbPassword,
      database: config.dbName,
      waitForConnections: true,
      connectionLimit: 5,
      charset: 'utf8mb4',
      decimalNumbers: true,
      dateStrings: true
    })
  }
  return pool
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getDb().query(sql, params)
  return rows as T[]
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function execute(sql: string, params: unknown[] = []): Promise<mysql.ResultSetHeader> {
  const [result] = await getDb().execute(sql, params as any[])
  return result as mysql.ResultSetHeader
}

export async function withTransaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getDb().getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
