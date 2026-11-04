export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const mask = (value: unknown) => value ? `${String(value).slice(0, 3)}***` : '(空)'
  console.log(`[config] db=${config.dbHost || '(空)'}:${config.dbPort}/${config.dbName || '(空)'} user=${mask(config.dbUser)} oss=${config.ossBucket || '(空)'} smsMock=${String(config.smsMock) === '1' ? 'on' : 'off'}`)
  if (!config.dbHost || !config.dbName || !config.dbUser) {
    console.error('[config] 数据库配置不完整，请检查 NITRO_DB_* 环境变量')
  }
})
