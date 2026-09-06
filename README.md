# 人生系统装配厂 / Life Auction Classroom

正式课堂版：**永久网址 + 教师创建课堂码 + 学生输入课堂码进入 + 实时拍卖 + 历史统计**。

## Production

- 学生端：https://life-auction-app.onrender.com/
- 教师中心：https://life-auction-app.onrender.com/teacher.html
- GitHub：https://github.com/gaojianpan/life-auction-classroom
- Runtime：Node.js + Express + Socket.IO
- Database：Render PostgreSQL（Singapore）

## 已验证的端到端功能

生产环境自动 smoke test 已验证：

- `/healthz`
- 学生首页
- 教师中心
- Socket.IO 连接
- 创建课堂与 6 位课堂码
- 两名学生加入课堂
- 出价
- 成交与余额/物品转移
- 交换市场挂牌与购买
- 课堂讨论阶段
- 课堂归档到 PostgreSQL
- 测试课堂自动删除，不污染历史统计

Smoke test 默认关闭，仅在部署验证时通过 `RUN_SMOKE_TEST=1` 临时开启。

## 数据库说明

当前使用 Render Free PostgreSQL。Free PostgreSQL 仅用于上线验证，会在创建约 30 天后到期。正式长期使用建议升级到 Render 最小长期付费 Postgres 计划 `0.1c-256mb`（旧名 `basic_256mb`）或更高。

## 环境变量

生产环境至少需要：

```text
NODE_ENV=production
DATABASE_URL=<Render Internal Database URL>
ADMIN_PIN=<管理员口令>
RUN_SMOKE_TEST=0
```

不要把 `DATABASE_URL`、`ADMIN_PIN` 或数据库密码提交到 GitHub。

## 本地开发

项目原始正式版包含 Docker Compose 配置时，可使用 PostgreSQL 本地运行；生产版本由 Render 构建并执行：

```bash
node assemble.js
npm install
npm start
```
