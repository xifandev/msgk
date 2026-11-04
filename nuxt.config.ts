import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@element-plus/nuxt'],
  nitro: {
    errorHandler: '~~/server/error-handler',
    externals: {
      traceInclude: [require.resolve('@alicloud/dysmsapi20170525'), require.resolve('@alicloud/openapi-client')]
    },
    experimental: { tasks: true },
    scheduledTasks: {
      '5 0 1 * *': ['bills:auto-create']
    }
  },
  css: ['~/assets/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: '沂水宗教码上公开',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }]
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
    wxaAppId: '',
    wxaAppSecret: ''
  }
})
