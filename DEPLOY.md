# MSGK 部署说明

运行形态：Nuxt 4 / Nitro + MySQL 8 + Nginx + PM2，GitHub Actions 构建并通过 rsync 增量同步。

## 固定约定

- 部署目录：`/www/wwwroot/msgk`
- PM2 进程：`msgk`，单实例 fork
- 端口：`3005`
- Node.js：22
- 域名示例：`api.msgk.getweb.cn`
- GitHub Actions Secret：`SSH_PRIVATE_KEY`

## 首次准备

1. 创建 MySQL 8 数据库并导入 `database/schema.sql`。如需保留旧数据，先备份新旧两个库，将旧库以 `msgk_legacy` 放在同一实例，再按注释演练并执行 `database/migrate-legacy.sql`；该脚本只适合全新业务库，不能重复执行。
2. 种子管理员手机号为 `13800000000`，首次部署后应立即改为实际可用的系统管理员手机号；不要删除该保护账号。
3. 在宝塔创建站点和 SSL，反向代理到 `http://127.0.0.1:3005`。反向代理必须保留原始域名头：`proxy_set_header Host $host;`（可选 `X-Forwarded-Host $host`）。服务端同源校验按 Host 比对，不依赖 `X-Forwarded-Proto`。
3. 在服务器 `/www/wwwroot/msgk/.env` 填写真实配置；模板为 `.env.example`。
4. OSS Bucket 设置公共读；图片由 Nuxt 服务端校验后上传，无需配置浏览器 PUT CORS。
5. 确保阿里云 RAM 用户只有 MSGK 所需的短信和 OSS 权限。

## 发布

代码检查并推送后，使用明确版本 tag：

```bash
git tag MSGK-v1.0.0
git push origin MSGK-v1.0.0
```

工作流依次执行类型检查、生产构建、rsync 同步和 PM2 重启。只有明确要求部署时才执行发布。

## 检查

```bash
pm2 ls
pm2 logs msgk --lines 30
curl -I http://127.0.0.1:3005/login
```

数据库或第三方配置为空时，启动日志会打印脱敏配置摘要。真实 `.env`、数据库导出和密钥不得提交到公开仓库。
