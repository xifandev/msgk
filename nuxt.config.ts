import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@element-plus/nuxt'],
  nitro: {
    externals: {
      traceInclude: [require.resolve('@alicloud/dysmsapi20170525'), require.resolve('@alicloud/openapi-client')]
    }
  },
  css: ['~/assets/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: '码上公开管理系统',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }]
    }
  },
  runtimeConfig: {
    dbHost: '',
    dbPort: 3306,
    dbName: '',
    dbUser: '',
    dbPassword: '',
    authSecret: '',
    aliyunAccessKeyId: '',
    aliyunAccessKeySecret: '',
    smsSignName: '',
    smsTemplateCode: '',
    smsMock: '',
    ossBucket: '',
    ossRegion: '',
    siteBaseUrl: ''
  }
})
