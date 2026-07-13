export const ISSUE_TEMPLATE = `
## 目标
- [ ] 发生问题：
- [ ] 影响范围：
- [ ] 预期行为：
- [ ] 验收标准：

## 影响链路
- [ ] 前端页面
- [ ] 后端接口
- [ ] 数据库
- [ ] 第三方集成

## 风险与回退
- 风险：
- 回退路径：
- 数据迁移：

## 验证
- npm run lint
- npm run typecheck
- npm run test
- npm run build
`

export const TEST_TEMPLATE = `
# 极端测试清单（前端/后端）
- 快速点击：连续点击同一按钮 10~30 秒
- 快速滑动：上下滑动、切换 tab、返回重入
- 空态/错误态：网络慢、超时、断网
- 并发提交：点赞/评论/发布重入
- 重试场景：webhook、支付回调、图片上传重试
- 返回恢复：列表进入详情后返回，是否保持位置
`

export const RELEASE_TEMPLATE = `
# 上线核对
- PR 编号：
- Issue：
- 代码覆盖模块：
- 关键链路 smoke：
- 日志与告警：
- 回滚指令：
- 上线结论（P0/P1）：
`
