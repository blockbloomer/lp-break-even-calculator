import { useId, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { calculateLPBreakEven } from './lib/calculator.ts';
import type { CalculationSuccess, CalculatorInput, ExitScenario } from './lib/calculator.ts';
import { amount, duration, durationParts, money, price } from './lib/format.ts';

type FormValues = Record<'capital' | 'aprPercent' | 'currentPrice' | 'lowerPrice' | 'upperPrice' | 'tokenPercent' | 'gasIn' | 'gasOut' | 'feeInPercent' | 'wearInPercent' | 'feeOutPercent' | 'wearOutPercent' | 'feeHaircutPercent', string>;
type FieldKey = keyof FormValues;
const EXAMPLE: FormValues = {
  capital: '5000', aprPercent: '5000', currentPrice: '100', lowerPrice: '98', upperPrice: '102', tokenPercent: '50',
  gasIn: '2', gasOut: '2', feeInPercent: '0.3', wearInPercent: '0.1', feeOutPercent: '0.3', wearOutPercent: '0.1', feeHaircutPercent: '0.3997',
};
const parse = (raw: string) => raw.trim() === '' ? NaN : Number(raw);
const percentage = (p: number, current: number) => `${p >= current ? '+' : '−'}${amount(Math.abs(p / current - 1) * 100, 2)}%`;
const subscribeToCompact = (callback: () => void) => {
  const query = window.matchMedia('(max-width: 480px)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};
const isCompactViewport = () => window.matchMedia('(max-width: 480px)').matches;

function Icon({ name, className = '' }: { name: 'mark' | 'arrow' | 'reset' | 'chevron' | 'info' | 'external'; className?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    mark: <><path d="M4 4v16h16" /><path d="m7 16 5-5 3 3 6-9" /></>,
    arrow: <><path d="M5 12h14m-5-5 5 5-5 5" /></>,
    reset: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
    external: <><path d="M14 4h6v6m0-6-10 10" /><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>,
  };
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Field({ label, value, onChange, suffix, error, hint, hiddenLabel = false, disabled = false, compact = false }: {
  label: string; value: string; onChange: (value: string) => void; suffix: string; error?: string; hint?: string;
  hiddenLabel?: boolean; disabled?: boolean; compact?: boolean;
}) {
  const id = useId();
  return <div className={`field ${compact ? 'field-compact' : ''}`}>
    <label htmlFor={id} className={hiddenLabel ? 'sr-only' : 'field-label'}>{label}</label>
    <div className={`input-shell ${error ? 'has-error' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <input id={id} type="number" inputMode="decimal" min="0" step="any" value={value} disabled={disabled}
        onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${id}-help` : undefined} />
      <span className="input-suffix" aria-hidden="true">{suffix}</span>
    </div>
    {(error || hint) && <span id={`${id}-help`} className={error ? 'field-error' : 'field-hint'}>{error || hint}</span>}
  </div>;
}

function TimeValue({ hours, small = false }: { hours: number | null; small?: boolean }) {
  if (hours === null) return <span className={small ? '' : 'unavailable-value'}>当前参数下无法回本</span>;
  return <span className={`time-value ${small ? 'time-small' : ''}`}>
    {durationParts(hours).map(part => <span className="time-part" key={part.unit}><strong>{part.value}</strong><span>{part.unit}</span></span>)}
  </span>;
}

function FeeChart({ result }: { result: CalculationSuccess }) {
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const compact = useSyncExternalStore(subscribeToCompact, isCompactViewport);
  const chartWidth = compact ? 350 : 646;
  const { requiredFees, netHourlyFee, breakEvenHours } = result;
  const titleId = useId();
  const descriptionId = useId();
  const baseMax = breakEvenHours && breakEvenHours > 0 ? breakEvenHours * 1.55 : 6;
  const magnitude = 10 ** Math.floor(Math.log10(baseMax));
  const maxHours = Math.ceil(baseMax / magnitude) * magnitude;
  const xUnit = maxHours >= 8760 ? '年' : maxHours >= 72 ? '天' : maxHours < 1 / 60 ? '秒' : maxHours < 1 ? '分钟' : '小时';
  const xScale = xUnit === '年' ? 1 / 8760 : xUnit === '天' ? 1 / 24 : xUnit === '分钟' ? 60 : xUnit === '秒' ? 3600 : 1;
  const maxValue = Math.max(requiredFees * 1.3, netHourlyFee * maxHours * 1.12, 0.01);
  const left = compact ? 43 : 66, right = chartWidth - (compact ? 16 : 34), top = 24, bottom = 205;
  const x = (hours: number) => left + hours / maxHours * (right - left);
  const y = (value: number) => bottom - value / maxValue * (bottom - top);
  const selectedHour = hoverRatio === null ? breakEvenHours : hoverRatio * maxHours;
  const selectedRevenue = selectedHour === null ? null : selectedHour * netHourlyFee;
  const lineEnd = y(netHourlyFee * maxHours);

  return <section className="chart-section" aria-label="手续费累计与回本时间">
    <div className="section-heading chart-heading"><h3>手续费如何覆盖成本</h3><div className="chart-legend"><span><i className="legend-line" />净手续费</span><span><i className="legend-line cost-line" />待覆盖金额</span></div></div>
    <svg className="fee-chart" viewBox={`0 0 ${chartWidth} 246`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}
      onPointerMove={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        const svgX = (event.clientX - rect.left) / rect.width * chartWidth;
        setHoverRatio(Math.max(0, Math.min(1, (svgX - left) / (right - left))));
      }} onPointerLeave={() => setHoverRatio(null)}>
      <title id={titleId}>累计净手续费与待覆盖成本的交点</title>
      <desc id={descriptionId}>每有效做市一小时收取净手续费 {money(netHourlyFee)}，需覆盖 {money(requiredFees)}，{breakEvenHours === null ? '当前参数下无法回本' : `约 ${duration(breakEvenHours)} 覆盖成本`}。随后按下沿价格退出。</desc>
      {[0, 1, 2, 3].map(index => {
        const value = maxValue * index / 3;
        return <g key={index}><line x1={left} x2={right} y1={y(value)} y2={y(value)} className="chart-grid" /><text x={left - 12} y={y(value) + 4} textAnchor="end" className="chart-label">{value >= 10000 ? `${amount(value / 1000, 1)}k` : amount(value, value < 1 ? 4 : 0)}</text></g>;
      })}
      <text x={left - 12} y="12" textAnchor="end" className="chart-label">USD</text>
      {[0, 1, 2, 3, 4].map(index => <text key={index} x={x(maxHours * index / 4)} y={bottom + 23} textAnchor="middle" className="chart-label">{amount(maxHours * index / 4 * xScale, 2)}</text>)}
      <path d={`M${left},${bottom} L${right},${lineEnd} L${right},${bottom} Z`} className="chart-area" />
      <line x1={left} x2={right} y1={y(requiredFees)} y2={y(requiredFees)} className="chart-target" />
      <line x1={left} x2={right} y1={bottom} y2={lineEnd} className="chart-revenue" />
      {selectedHour !== null && selectedRevenue !== null && <g>
        <line x1={x(selectedHour)} x2={x(selectedHour)} y1={y(selectedRevenue)} y2={bottom} className="chart-guide" />
        <circle cx={x(selectedHour)} cy={y(selectedRevenue)} r="6" className="chart-point" />
        {hoverRatio === null && <g transform={`translate(${Math.min(right - 109, Math.max(left, x(selectedHour) - 55))},${Math.max(3, y(selectedRevenue) - 35)})`}>
          <rect width="110" height="26" rx="5" className="chart-callout" />
          <text x="55" y="17" textAnchor="middle" className="chart-callout-text">回本点 {amount(selectedHour * xScale, 2)} {xUnit}</text>
        </g>}
      </g>}
      <text x={right} y="244" textAnchor="end" className="chart-label">有效做市时间 / {xUnit}</text>
    </svg>
    <div className="chart-caption">{hoverRatio !== null && selectedRevenue !== null && selectedHour !== null
      ? <><span>{duration(selectedHour)}</span><span>累计 <b>{money(selectedRevenue)}</b></span><span>{selectedRevenue >= requiredFees ? '超过待覆盖金额' : '还需'} <b>{money(Math.abs(requiredFees - selectedRevenue))}</b></span></>
      : <><span className="caption-dot" /><span>只累计区间内手续费；达到该金额后，按下沿价格退出。</span></>}</div>
  </section>;
}

function Ledger({ result }: { result: CalculationSuccess }) {
  const s = result.scenarios.lower;
  return <section className="ledger-section">
    <div className="section-heading"><h3>这笔账，要覆盖什么</h3><span className="muted">下沿退出</span></div>
    <dl className="ledger">
      <div><dt><span className="ledger-dot price-dot" />LP 本金损失<span className="ledger-detail">价格跌到 {price(s.price)}，含持仓比例变化</span></dt><dd>{money(s.capitalLoss)}</dd></div>
      <div><dt><span className="ledger-dot" />开仓换币损耗<span className="ledger-detail">兑换费 {money(result.entrySwapFee)} · 成交磨损 {money(result.entryExecutionWear)}</span></dt><dd>{money(result.entrySwapLoss)}</dd></div>
      <div><dt><span className="ledger-dot" />退出换币损耗<span className="ledger-detail">兑换费 {money(s.exitSwapFee)} · 成交磨损 {money(s.exitExecutionWear)}</span></dt><dd>{money(s.exitSwapLoss)}</dd></div>
      <div><dt><span className="ledger-dot gas-dot" />进出场 Gas</dt><dd>{money(result.totalGas)}</dd></div>
      <div className="ledger-total"><dt>共需手续费覆盖</dt><dd>{money(result.requiredFees)}</dd></div>
    </dl>
    <div className="funds-note"><span>总资金需求（含退出 gas 预留）</span><strong>{money(result.totalFundsRequired)}</strong><p>净入池本金 + 开仓换币损耗 + 双程 gas 预留</p></div>
  </section>;
}

function ScenarioTable({ result }: { result: CalculationSuccess }) {
  const rows: [string, ExitScenario, boolean][] = [['下沿退出', result.scenarios.lower, true], ['原价退出', result.scenarios.current, false], ['上沿退出', result.scenarios.upper, false]];
  return <section className="scenario-section">
    <div className="section-heading"><h3>换个退出价格看看</h3><span className="muted">全部换回稳定币</span></div>
    <div className="scenario-scroll"><table className="scenario-table"><thead><tr><th>退出情景</th><th>撤回净值</th><th>需补手续费</th><th>回本时间</th></tr></thead><tbody>
      {rows.map(([label, scenario, highlight]) => <tr key={label} className={highlight ? 'scenario-highlight' : ''}>
        <th scope="row">{label}<span>{price(scenario.price)}</span></th>
        <td>{money(scenario.exitNetValue)}</td><td>{money(scenario.requiredFees)}</td><td>{duration(scenario.breakEvenHours)}</td>
      </tr>)}
    </tbody></table></div>
    <p className="table-note">撤回净值已扣卖币损耗；需补手续费还包含开仓损耗与双程 gas。金额均未计已赚手续费。</p>
  </section>;
}

export default function App() {
  const [form, setForm] = useState<FormValues>({ ...EXAMPLE });
  const [mode, setMode] = useState<'bounds' | 'ratio'>('bounds');
  const [automaticHaircut, setAutomaticHaircut] = useState(true);
  const [isExample, setIsExample] = useState(true);
  const lastValidPrice = useRef(parse(EXAMPLE.currentPrice));

  const input: CalculatorInput = {
    capital: parse(form.capital), aprPercent: parse(form.aprPercent), currentPrice: parse(form.currentPrice),
    range: mode === 'bounds'
      ? { mode, lowerPrice: parse(form.lowerPrice), upperPrice: parse(form.upperPrice) }
      : { mode, lowerPrice: parse(form.lowerPrice), tokenPercent: parse(form.tokenPercent) },
    gasIn: parse(form.gasIn), gasOut: parse(form.gasOut), feeInPercent: parse(form.feeInPercent), wearInPercent: parse(form.wearInPercent),
    feeOutPercent: parse(form.feeOutPercent), wearOutPercent: parse(form.wearOutPercent), feeHaircutPercent: automaticHaircut ? null : parse(form.feeHaircutPercent),
  };
  const calculation = calculateLPBreakEven(input);
  const result = calculation.ok ? calculation : null;
  const errors = calculation.ok ? {} : calculation.errors;
  const update = (key: FieldKey, value: string) => {
    setIsExample(false);
    const newPrice = parse(value);
    const previousPrice = lastValidPrice.current;
    const priceChanged = key === 'currentPrice' && newPrice > 0 && Number.isFinite(newPrice);
    if (priceChanged) lastValidPrice.current = newPrice;
    setForm(previous => {
      const next = { ...previous, [key]: value };
      if (priceChanged) {
        for (const bound of ['lowerPrice', 'upperPrice'] as const) {
          const boundValue = parse(previous[bound]);
          if (Number.isFinite(boundValue)) next[bound] = String(boundValue / previousPrice * newPrice);
        }
      }
      return next;
    });
  };
  const field = (key: FieldKey, label: string, suffix: string, options: { hint?: string; hiddenLabel?: boolean; compact?: boolean; disabled?: boolean; value?: string } = {}) =>
    <Field label={label} value={options.value ?? form[key]} onChange={value => update(key, value)} suffix={suffix} error={errors[key]} {...options} />;
  const reset = () => { setForm({ ...EXAMPLE }); setMode('bounds'); setAutomaticHaircut(true); setIsExample(true); lastValidPrice.current = parse(EXAMPLE.currentPrice); };
  const setWidth = (percent: number) => {
    const current = parse(form.currentPrice);
    if (!(current > 0 && Number.isFinite(current))) return;
    setMode('bounds'); setIsExample(false);
    setForm(previous => ({ ...previous, lowerPrice: String(current * (1 - percent / 100)), upperPrice: String(current * (1 + percent / 100)) }));
  };
  const switchMode = (next: 'bounds' | 'ratio') => {
    if (next === mode) return;
    if (result) setForm(previous => ({ ...previous, tokenPercent: String(result.tokenWeight * 100), upperPrice: String(result.upperPrice) }));
    setMode(next); setIsExample(false);
  };
  const current = parse(form.currentPrice);
  const rangePosition = result ? (current - result.lowerPrice) / (result.upperPrice - result.lowerPrice) * 100 : 50;

  return <div className="app-shell">
    <header className="site-header">
      <a href="#" className="brand" aria-label="LP 包赚计算器首页"><span className="brand-mark"><Icon name="mark" /></span><span>LP<span className="brand-divider">/</span>包赚计算器</span></a>
      <div className="header-context"><span className="status-dot" />本地测算<span className="header-separator">/</span>无需连接钱包</div>
    </header>

    <main>
      <div className="page-heading"><div><h1>这笔 LP，多久回本？</h1><p>把年化、区间和磨损填进去，让手续费把这笔账算清楚。</p></div><a className="text-link" href="#method">计算口径 <Icon name="arrow" /></a></div>

      <div className="mobile-summary" role="status"><span>预计有效做市时间</span><strong>{result ? duration(result.breakEvenHours) : '请补全参数'}</strong></div>

      <div className="calculator-layout">
        <form className="input-panel" onSubmit={event => event.preventDefault()} noValidate>
          <div className="panel-heading"><h2>设置这笔 LP</h2><button className="reset-button" type="button" onClick={reset}><Icon name="reset" />恢复示例</button></div>
          <div className={`example-note ${isExample ? '' : 'custom-note'}`}><span className="note-dot" />{isExample ? '当前为示例参数，可直接修改' : '自定义参数 · 修改后即时重算'}</div>

          <section className="form-section first-section" aria-labelledby="investment-title">
            <h3 id="investment-title">投入与收益</h3>
            <div className="field-grid">
              {field('capital', '净入池本金', 'USD', { hint: '不含 gas 和开仓换币成本' })}
              {field('aprPercent', '手续费年化 APR', '%', { hint: '该仓位的预估单利年化' })}
            </div>
            <div className="current-price-row">{field('currentPrice', '当前币价', 'USD')}<p className="side-hint">波动币 / 稳定币<br />改现价时保留区间幅度</p></div>
          </section>

          <section className="form-section range-section" aria-labelledby="range-title">
            <div className="section-heading"><h3 id="range-title">价格区间与配比</h3><span className="muted">自动联动</span></div>
            <div className="segmented-control" role="group" aria-label="区间设置方式">
              <button type="button" aria-pressed={mode === 'bounds'} onClick={() => switchMode('bounds')}>按价格区间</button>
              <button type="button" aria-pressed={mode === 'ratio'} onClick={() => switchMode('ratio')}>按目标配比</button>
            </div>
            <div className="field-grid range-inputs">
              {field('lowerPrice', '价格下限', 'USD')}
              {mode === 'bounds' ? field('upperPrice', '价格上限', 'USD') : field('tokenPercent', '波动币目标占比', '%')}
            </div>
            <div className="quick-row"><span>{mode === 'bounds' ? '快捷区间' : '快捷配比'}</span>
              {mode === 'bounds' ? [1, 2, 5].map(value => <button type="button" key={value} onClick={() => setWidth(value)}>±{value}%</button>)
                : [30, 50, 70].map(value => <button type="button" key={value} onClick={() => update('tokenPercent', String(value))}>{value}:{100 - value}</button>)}
            </div>
            {result && <div className="allocation-preview">
              <div className="range-scale"><span>{percentage(result.lowerPrice, current)}</span><span>现价</span><span>{percentage(result.upperPrice, current)}</span></div>
              <div className="range-track"><span className="range-cap left" /><span className="range-cap right" /><span className="current-marker" style={{ left: `${rangePosition}%` }} /></div>
              <div className="range-prices"><span>{price(result.lowerPrice)}</span><span>{price(result.upperPrice)}</span></div>
              <div className="allocation-heading"><span>实际入池配比</span><span>按美元价值</span></div>
              <div className="allocation-track" role="img" aria-label={`波动币 ${amount(result.tokenWeight * 100)}%，稳定币 ${amount((1 - result.tokenWeight) * 100)}%`}><span style={{ transform: `scaleX(${result.tokenWeight})` }} /></div>
              <div className="allocation-labels"><span><i className="token-dot" />波动币 <b>{amount(result.tokenWeight * 100)}%</b></span><span><i className="stable-dot" />稳定币 <b>{amount((1 - result.tokenWeight) * 100)}%</b></span></div>
              <div className="allocation-values"><span>{money(result.initialTokenAmount * current)}</span><span>{money(result.initialStableAmount)}</span></div>
            </div>}
            <p className="section-note">配比随区间确定；缩窄区间不会自动提高 APR。</p>
          </section>

          <section className="form-section cost-section" aria-labelledby="cost-title">
            <div className="section-heading"><h3 id="cost-title">进出场成本</h3><span className="muted">按实际换币金额</span></div>
            <div className="cost-grid"><span /><span className="cost-column-label">进场</span><span className="cost-column-label">退出</span>
              <div className="cost-row-label">Gas<span>全流程合计</span></div>
              {field('gasIn', '进场总 gas', 'USD', { hiddenLabel: true, compact: true })}{field('gasOut', '退出总 gas', 'USD', { hiddenLabel: true, compact: true })}
              <div className="cost-row-label">兑换费率</div>
              {field('feeInPercent', '进场兑换手续费率', '%', { hiddenLabel: true, compact: true })}{field('feeOutPercent', '退出兑换手续费率', '%', { hiddenLabel: true, compact: true })}
              <div className="cost-row-label">成交磨损<span>滑点及价格冲击</span></div>
              {field('wearInPercent', '进场预估成交磨损率', '%', { hiddenLabel: true, compact: true })}{field('wearOutPercent', '退出预估成交磨损率', '%', { hiddenLabel: true, compact: true })}
            </div>
            <p className="section-note">填写预估实际损失，不是钱包的滑点容忍度。</p>
          </section>

          <details className="advanced-settings"><summary><span>高级设置</span><span className="summary-detail">手续费兑现损耗<Icon name="chevron" /></span></summary><div className="advanced-body">
            <label className="checkbox-label"><input type="checkbox" checked={automaticHaircut} onChange={event => {
              setAutomaticHaircut(event.target.checked); setIsExample(false);
              if (result) setForm(previous => ({ ...previous, feeHaircutPercent: String(result.feeHaircutPercent) }));
            }} />跟随退出兑换费率与成交磨损</label>
            {field('feeHaircutPercent', '手续费兑现损耗率', '%', { disabled: automaticHaircut, value: automaticHaircut && result ? String(Number(result.feeHaircutPercent.toFixed(6))) : form.feeHaircutPercent })}
            <p className="section-note">默认按全部手续费都需要换币保守估算。仅减少手续费净收入，不重复计入本金成本；不模拟手续费币的持有价格变化。</p>
          </div></details>
        </form>

        <div className="results-column">
          {result ? <>
            <section className="result-panel" aria-labelledby="result-title">
              <div className="result-topline"><h2 id="result-title">预计回本时间</h2><span className="scenario-badge">区间内最不利退出</span></div>
              <div className={`result-time ${result.breakEvenHours === null ? 'result-unavailable' : ''}`} role="status" aria-live="polite" aria-atomic="true">
                {result.breakEvenHours !== null && <span className="approx-label">约</span>}<TimeValue hours={result.breakEvenHours} />
              </div>
              <p className="result-explanation">{result.breakEvenHours === null ? '每小时净手续费为 0，无法覆盖当前成本。请检查 APR 或手续费兑现损耗。' : <>累计有效做市后，即使按下沿 <strong>{price(result.lowerPrice)}</strong> 退出，<br className="desktop-break" />预估手续费也能覆盖本金损失与进出场成本。</>}</p>
              <div className="result-metrics"><div><span>每小时净手续费</span><strong>{money(result.netHourlyFee)}<small>/ 小时</small></strong></div><div><span>共需覆盖</span><strong>{money(result.requiredFees)}</strong></div></div>
              <FeeChart result={result} />
              <div className="condition-note"><Icon name="info" /><p>以所填费收和成本实现、退出价格仍在区间内为前提。出区间期间不赚手续费；该时间不代表多久会触边。</p></div>
            </section>
            <div className="detail-panel"><Ledger result={result} /><ScenarioTable result={result} /></div>
          </> : <section className="result-panel invalid-panel" role="status" aria-live="polite">
            <span className="invalid-symbol"><Icon name="info" /></span><h2>补全参数，就能算回本时间</h2><p>请调整左侧标出的项目，结果会自动更新。</p><ul>{Object.entries(errors).map(([key, message]) => <li key={key}>{message}</li>)}</ul>
          </section>}
        </div>
      </div>

      <details className="method-panel" id="method"><summary><span><Icon name="info" />这笔账怎么算</span><span>公式与适用范围<Icon name="chevron" /></span></summary><div className="method-content">
        <div><h3>回本时间 = 待覆盖金额 ÷ 每小时净手续费</h3><p>每小时净手续费 = 净入池本金 × APR ÷ 100 ÷ 8760 ×（1 − 手续费兑现损耗率）。待覆盖金额 = LP 本金损失 + 开仓换币损耗 + 退出换币损耗 + 双程 gas，最低按 0 计。</p><p>本金按 Uniswap V3 集中流动性公式估值，随价格计算两币数量。配比变化造成的损失已包含在仓位价值里，不再扣一遍“无常损失”。</p></div>
        <div><h3>这是条件测算，不是收益预测</h3><p>默认全稳定币进场、退出全部换回稳定币，稳定币按 1 美元估值。APR 为该仓位预估的手续费单利年化，按退出时美元等值估计；不含激励、不复投、不代表未来费收。</p><p>采用理论连续价格区间，不计算 tick 落点。低于下限仍可能继续亏损，超出本页“区间内最不利情况”的边界。</p><a className="text-link" href="https://app.uniswap.org/whitepaper-v3.pdf" target="_blank" rel="noreferrer">查看 Uniswap V3 公式来源<Icon name="external" /></a></div>
      </div></details>
    </main>
    <footer className="site-footer"><span>LP「包赚」计算器</span><span>算清成本，再看年化。</span><span>本地计算 · 不读取钱包</span></footer>
  </div>;
}
