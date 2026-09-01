Workflow（Final)
================

使用 TS 版本文档：
- ``agent.ts``
- ``docs/process/agent-catalog.ts``
- ``docs/process/operation-templates.ts``

执行顺序：
1) PM 拆需求
2) Architect 评估边界
3) FE/BE/DB 并行开发
4) Test 重点回归
5) Deployment 上线与监控

每次变更必须通过：lint + typecheck + test + build。
