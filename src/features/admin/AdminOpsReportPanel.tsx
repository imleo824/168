import { RefreshCcw } from 'lucide-react';
import type { OpsMetrics, OpsReport } from './adminTypes';
import { metricLabelMap } from './adminMeta';

type AdminOpsReportPanelProps = {
  opsReport: OpsReport | null;
  opsReportError: string;
  isLoadingReport: boolean;
  selectedTrendMetric: keyof OpsMetrics;
  setSelectedTrendMetric: (metric: keyof OpsMetrics) => void;
  refreshReportDashboard: () => void;
};

function formatMetric(metric: keyof OpsMetrics, value: number) {
  return metric === 'rechargeAmount'
    ? value.toFixed(2)
    : Math.round(value).toLocaleString('zh-CN');
}

export function AdminOpsReportPanel({
  opsReport,
  opsReportError,
  isLoadingReport,
  selectedTrendMetric,
  setSelectedTrendMetric,
  refreshReportDashboard,
}: AdminOpsReportPanelProps) {
  return (
    <div className="mb-20 flex flex-col gap-6">
      {opsReportError && (
        <div className="admin-alert admin-alert--danger">
          {opsReportError}
        </div>
      )}
      <div className="admin-section-card order-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="admin-text-title">今日数据</h3>
            <p className="admin-form-note mt-1">发帖用户、引用用户、评论用户、点赞用户、分享用户均为去重真人用户，不统计机器人。</p>
          </div>
          <button
            type="button"
            onClick={refreshReportDashboard}
            className="pressable admin-table-action admin-tone-primary admin-report-action"
            aria-label="刷新报表"
            title="刷新报表"
          >
            <RefreshCcw size={16} />
          </button>
        </div>
        {isLoadingReport ? (
          <div className="admin-state-inline">报表加载中...</div>
        ) : !opsReport ? (
          <div className="admin-state-inline">暂无报表数据</div>
        ) : (
          <div className="admin-report-metric-grid md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
            {metricLabelMap.map((metric) => (
              <div key={`today-${metric.key}`} className="admin-report-metric-card">
                <div className="admin-form-note admin-form-note--emphasis">{metric.label}</div>
                <div className="admin-text-value mt-1">
                  {formatMetric(metric.key, Number(opsReport.today[metric.key] || 0))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-section-card order-2">
        <h3 className="admin-text-title">历史累计</h3>
        {isLoadingReport ? (
          <div className="admin-state-inline">报表加载中...</div>
        ) : !opsReport ? (
          <div className="admin-state-inline">暂无历史数据</div>
        ) : (
          <div className="admin-report-metric-grid md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
            {metricLabelMap.map((metric) => (
              <div key={`history-${metric.key}`} className="admin-report-metric-card admin-report-metric-card--soft">
                <div className="admin-report-metric-label">{metric.label}</div>
                <div className="admin-text-value mt-1">
                  {formatMetric(metric.key, Number(opsReport.historical[metric.key] || 0))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-section-card order-4">
        <h3 className="admin-text-title">近1个月</h3>
        {isLoadingReport ? (
          <div className="admin-state-inline">报表加载中...</div>
        ) : !opsReport || !opsReport.trend?.length ? (
          <div className="admin-state-inline">暂无趋势数据</div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {metricLabelMap.map((metric) => (
                <button
                  type="button"
                  key={`trend-metric-${metric.key}`}
                  onClick={() => setSelectedTrendMetric(metric.key)}
                  className={`admin-report-trend-filter ${
                    selectedTrendMetric === metric.key
                      ? ''
                      : 'admin-tone-neutral admin-tone-neutral-hover'
                  }`}
                  data-active={selectedTrendMetric === metric.key ? 'true' : 'false'}
                >
                  {metric.label}
                </button>
              ))}
            </div>

            {(() => {
              const selectedLabel = metricLabelMap.find((m) => m.key === selectedTrendMetric)?.label || '';
              const values = opsReport.trend.map((row) => Number(row[selectedTrendMetric] || 0));
              const maxValue = Math.max(...values, 1);
              const minValue = Math.min(...values, 0);
              const spread = Math.max(maxValue - minValue, 1);
              const chartWidth = 920;
              const chartHeight = 260;
              const padX = 24;
              const padY = 20;
              const drawWidth = chartWidth - padX * 2;
              const drawHeight = chartHeight - padY * 2;
              const points = values.map((value, index) => {
                const x = padX + (values.length <= 1 ? 0 : (index / (values.length - 1)) * drawWidth);
                const y = padY + (1 - (value - minValue) / spread) * drawHeight;
                return `${x},${y}`;
              }).join(' ');
              const latest = values[values.length - 1] || 0;
              const earliest = values[0] || 0;
              const diff = latest - earliest;
              const startDateText = opsReport.trend[0]?.date || '-';
              const endDateText = opsReport.trend[opsReport.trend.length - 1]?.date || '-';
              return (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3 admin-table-meta admin-table-meta--muted admin-table-meta--strong">
                    <span>指标：{selectedLabel}</span>
                    <span>最新：{formatMetric(selectedTrendMetric, latest)}</span>
                    <span className="admin-report-delta" data-tone={diff >= 0 ? 'positive' : 'negative'}>
                      {diff >= 0 ? '↑' : '↓'} {formatMetric(selectedTrendMetric, Math.abs(diff))}
                    </span>
                  </div>
                  <div className="w-full overflow-x-auto">
                    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="admin-report-chart">
                      <line x1={padX} y1={padY} x2={padX} y2={chartHeight - padY} stroke="var(--ui-line-medium)" strokeWidth="1" />
                      <line x1={padX} y1={chartHeight - padY} x2={chartWidth - padX} y2={chartHeight - padY} stroke="var(--ui-line-medium)" strokeWidth="1" />
                      <polyline
                        fill="none"
                        stroke="var(--ui-text-strong)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={points}
                      />
                      {points.split(' ').map((point, index) => {
                        if (!point || (index !== 0 && index !== values.length - 1 && index % 4 !== 0)) return null;
                        const [x, y] = point.split(',');
                        return (
                          <circle
                            key={`${selectedTrendMetric}-pt-${index}`}
                            cx={x}
                            cy={y}
                            r="2.6"
                            fill="var(--ui-text-strong)"
                          />
                        );
                      })}
                    </svg>
                  </div>
                  <div className="admin-report-chart-meta">
                    <span>{startDateText}</span>
                    <span>{endDateText}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
