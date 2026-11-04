# 码上公开（MSGK）

基于 Nuxt 4 的场所信息、人员、安全、新闻和财务公开系统，包含后台管理、公开 API 和纯查询微信小程序。

> **项目来源**：本项目重构自旧项目 `/Users/getlong/Code/msgk-old`，使用新的 Node.js 技术框架（Nuxt 4 + Nitro + MySQL 8 原生 SQL）进行了完整的技术栈重构。旧项目仅作迁移参考。

## 本地开发

```bash
npm install
cp .env.example .env
npm run dev
```

生产构建：

```bash
npm run typecheck
npm run build
```

## 目录

- `app/`：Nuxt 后台页面和组件
- `server/`：后台与小程序 API、鉴权、数据库及第三方服务
- `shared/`：前后端共享权限和状态定义
- `database/`：数据库结构与迁移工具
- `miniprogram/`：纯公开查询微信小程序
- `.github/workflows/`：构建与部署工作流

小程序不包含登录、管理员验证和财务写入功能。后台管理员通过手机号短信验证码登录。

小程序 UI 全部使用原生组件与 `miniprogram/components/ms-*` 自研组件，不依赖任何第三方组件库，也不需要在开发者工具里执行「构建 npm」，用开发者工具直接打开 `miniprogram/` 即可运行。
