import DysmsapiModule, { SendSmsRequest } from '@alicloud/dysmsapi20170525'
import { Config } from '@alicloud/openapi-client'

const Dysmsapi = ((DysmsapiModule as unknown as { default?: unknown }).default ?? DysmsapiModule) as new (config: Config) => {
  sendSms: (request: SendSmsRequest) => Promise<{ body: { code?: string, message?: string } }>
}
let client: InstanceType<typeof Dysmsapi> | null = null

export async function sendSmsCode(phone: string, code: string) {
  const config = useRuntimeConfig()
  if (String(config.smsMock) === '1') {
    console.log(`[sms:mock] phone=${phone.slice(0, 3)}****${phone.slice(-4)}`)
    return
  }
  if (!config.aliyunAccessKeyId || !config.aliyunAccessKeySecret || !config.smsSignName || !config.smsTemplateCode) {
    throw createError({ statusCode: 500, message: '短信服务配置不完整' })
  }
  if (!client) {
    const connection = new Config({ accessKeyId: config.aliyunAccessKeyId, accessKeySecret: config.aliyunAccessKeySecret })
    connection.endpoint = 'dysmsapi.aliyuncs.com'
    client = new Dysmsapi(connection)
  }
  const response = await client.sendSms(new SendSmsRequest({
    phoneNumbers: phone,
    signName: config.smsSignName,
    templateCode: config.smsTemplateCode,
    templateParam: JSON.stringify({ code })
  }))
  if (response.body.code !== 'OK') {
    throw createError({ statusCode: 502, message: `短信发送失败：${response.body.message ?? '未知错误'}` })
  }
}
