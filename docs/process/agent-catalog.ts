export type AgentName =
  | 'PM'
  | 'Frontend'
  | 'Backend'
  | 'Architect'
  | 'Database'
  | 'Test'
  | 'Security'
  | 'Deployment'
  | 'UI'

export type Issue = {
  owner: AgentName
  title: string
  scope: string
  outputs: string[]
}

export const AGENTS: Record<AgentName, Issue> = {
  PM: {
    owner: 'PM',
    title: 'PM Agent',
    scope: '需求边界、验收口径、优先级排序',
    outputs: ['Issue', '验收标准', '上线与回退要求'],
  },
  Frontend: {
    owner: 'Frontend',
    title: 'Frontend Agent',
    scope: '界面一致性、交互体验、性能与稳定性',
    outputs: ['组件抽象', '列表/刷新/返回体验', '渲染性能优化', '回归路径'],
  },
  Backend: {
    owner: 'Backend',
    title: 'Backend Agent',
    scope: 'API 与服务链路、异常处理、幂等',
    outputs: ['接口契约', '幂等策略', '事务与隔离', '错误码标准'],
  },
  Architect: {
    owner: 'Architect',
    title: 'Architect Agent',
    scope: '系统边界与演进能力',
    outputs: ['模块边界', '数据流图', '技术债清单'],
  },
  Database: {
    owner: 'Database',
    title: 'Database Agent',
    scope: 'Schema、索引、数据生命周期',
    outputs: ['字段清理', '索引优化', '一致性检查'],
  },
  Test: {
    owner: 'Test',
    title: 'Test Agent',
    scope: '极端场景测试、稳定性与回归',
    outputs: ['P0/P1/P2 清单', '冒烟与压测摘要', '问题优先级'],
  },
  Security: {
    owner: 'Security',
    title: 'Security Agent',
    scope: '鉴权、上传、支付、Webhook 安全',
    outputs: ['威胁模型', '签名与鉴权策略', '脱敏与日志策略'],
  },
  Deployment: {
    owner: 'Deployment',
    title: 'Deployment Agent',
    scope: '环境、发布、监控、回滚',
    outputs: ['环境变量清单', '回滚预案', '发布后告警联动'],
  },
  UI: {
    owner: 'UI',
    title: 'UI/UE Agent',
    scope: '字体、间距、层级、视觉一致性',
    outputs: ['组件视觉规范', '交互节奏', '页面级体验评估'],
  },
}

export const AGENT_WORKFLOW = [
  'PM -> Architect -> FE/BE -> DB -> Security -> Test -> Deployment',
  '问题只进不退：完成项不重复进入新修订循环',
  '未通过 P0 题目不得推进下一轮',
]
