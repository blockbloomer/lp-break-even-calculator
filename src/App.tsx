import { useId, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { calculateLPBreakEven, MAX_APR_PERCENT } from './lib/calculator.ts';
import type { CalculationSuccess, ExitScenario } from './lib/calculator.ts';
import { amount, duration, durationParts, money } from './lib/format.ts';
import { EXAMPLE, parseParameter, toCalculatorInput } from './lib/parameters.ts';
import type { ParameterKey, Parameters } from './lib/parameters.ts';

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

function SliderField({ label, value, onChange, suffix, error, hint, min = 0, max, step, fixedMax = false, disabled = false, compact = false }: {
  label: string; value: string; onChange: (value: string) => void; suffix: string; error?: string; hint?: string;
  min?: number; max: number; step: number; fixedMax?: boolean; disabled?: boolean; compact?: boolean;
}) {
  const id = useId();
  const numeric = parseParameter(value);
  const actualMin = Number.isFinite(numeric) && numeric >= 0 ? Math.min(min, numeric) : min;
  const actualMax = !fixedMax && Number.isFinite(numeric) ? Math.max(max, numeric) : max;
  const selected = Number.isFinite(numeric) ? Math.max(actualMin, Math.min(actualMax, numeric)) : actualMin;
  const [coefficient, exponent = '0'] = value.toLowerCase().split('e');
  const decimalPlaces = Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent));
  const actualStep = Number.isFinite(decimalPlaces) ? Math.min(step, 10 ** -Math.min(decimalPlaces, 12)) : step;
  const fraction = (selected - actualMin) / (actualMax - actualMin);
  return <div className={`slider-field ${compact ? 'slider-compact' : ''} ${disabled ? 'slider-disabled' : ''}`}>
    <div className="slider-heading"><label htmlFor={id}>{label}</label><div className={`slider-value ${error ? 'has-error' : ''}`}>
      <input type="number" inputMode="decimal" min={min} max={fixedMax ? max : undefined} step="any" value={value} disabled={disabled} aria-label={`${label}精确数值`}
        title="点击数字可精确修改" onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${id}-help` : undefined} />
      <span aria-hidden="true">{suffix}</span>
    </div></div>
    <div className="slider-control"><div className="slider-track"><span style={{ transform: `scaleX(${fraction})` }} /></div>
      <input id={id} type="range" min={actualMin} max={actualMax} step={actualStep} value={selected} disabled={disabled}
        onChange={event => onChange(event.target.value)} aria-valuetext={`${value} ${suffix}`} aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${id}-help` : undefined} />
    </div>
    {(error || hint) && <span id={`${id}-help`} className={error ? 'field-error' : 'field-hint'}>{error || hint}</span>}
  </div>;
}

function TimeValue({ hours, small = false }: { hours: number | null; small?: boolean }) {
  if (hours === null) return <span className={small ? '' : 'unavailable-value'}>当前参数下无法覆盖成本</span>;
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

  return <section className="chart-section" aria-label="手续费累计与成本覆盖时间">
    <div className="section-heading chart-heading"><h3>手续费如何覆盖成本</h3><div className="chart-legend"><span><i className="legend-line" />净手续费</span><span><i className="legend-line cost-line" />待覆盖金额</span></div></div>
    <svg className="fee-chart" viewBox={`0 0 ${chartWidth} 246`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}
      onPointerMove={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        const svgX = (event.clientX - rect.left) / rect.width * chartWidth;
        setHoverRatio(Math.max(0, Math.min(1, (svgX - left) / (right - left))));
      }} onPointerLeave={() => setHoverRatio(null)}>
      <title id={titleId}>累计净手续费与待覆盖成本的交点</title>
      <desc id={descriptionId}>每有效做市一小时收取净手续费 {money(netHourlyFee)}，需覆盖 {money(requiredFees)}，{breakEvenHours === null ? '当前参数下无法覆盖成本' : `约 ${duration(breakEvenHours)} 覆盖成本`}。随后按下沿价格退出。</desc>
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
          <text x="55" y="17" textAnchor="middle" className="chart-callout-text">覆盖点 {amount(selectedHour * xScale, 2)} {xUnit}</text>
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
      <div><dt><span className="ledger-dot price-dot" />美元本金损失<span className="ledger-detail">币价下跌 {money(s.marketLoss)} + 无常损失 {money(s.impermanentLoss)}</span></dt><dd>{money(s.capitalLoss)}</dd></div>
      <div><dt><span className="ledger-dot" />进场交易磨损<span className="ledger-detail">买币目标 {money(result.entryBuyValue)}；含磨损支出 {money(result.entrySpend)}</span></dt><dd>{money(result.entrySwapLoss)}</dd></div>
      <div><dt><span className="ledger-dot" />退出交易磨损<span className="ledger-detail">按退出时需要卖出的币计算</span></dt><dd>{money(s.exitSwapLoss)}</dd></div>
      <div><dt><span className="ledger-dot gas-dot" />进出场 Gas</dt><dd>{money(result.totalGas)}</dd></div>
      <div className="ledger-total"><dt>共需手续费覆盖</dt><dd>{money(result.requiredFees)}</dd></div>
    </dl>
    <div className="funds-note"><span>总资金需求（含退出 gas 预留）</span><strong>{money(result.totalFundsRequired)}</strong><p>净入池本金 + 进场交易磨损 + 双程 gas 预留</p></div>
  </section>;
}

function ScenarioTable({ result }: { result: CalculationSuccess }) {
  const rows: [string, ExitScenario, boolean][] = [['下沿退出', result.scenarios.lower, true], ['原价退出', result.scenarios.current, false], ['上沿退出', result.scenarios.upper, false]];
  return <section className="scenario-section">
    <div className="section-heading"><h3>换个退出价格看看</h3><span className="muted">全部换回稳定币</span></div>
    <div className="scenario-scroll"><table className="scenario-table"><thead><tr><th>退出情景</th><th>撤回净值</th><th>需补手续费</th><th>覆盖时间</th></tr></thead><tbody>
      {rows.map(([label, scenario, highlight]) => <tr key={label} className={highlight ? 'scenario-highlight' : ''}>
        <th scope="row">{label}<span>{percentage(scenario.price, result.position.currentPrice)}</span></th>
        <td>{money(scenario.exitNetValue)}</td><td>{money(scenario.requiredFees)}</td><td>{duration(scenario.breakEvenHours)}</td>
      </tr>)}
    </tbody></table></div>
    <p className="table-note">撤回净值已扣卖币损耗；需补手续费还包含开仓损耗与双程 gas。金额均未计已赚手续费。</p>
  </section>;
}

export default function App() {
  const [form, setForm] = useState<Parameters>({ ...EXAMPLE });
  const [automaticHaircut, setAutomaticHaircut] = useState(true);
  const [isExample, setIsExample] = useState(true);
  const calculation = calculateLPBreakEven(toCalculatorInput(form, automaticHaircut));
  const result = calculation.ok ? calculation : null;
  const errors: Record<string, string> = calculation.ok ? {} : { ...calculation.errors };
  if (errors.lowerPrice) {
    delete errors.lowerPrice;
    errors.downsidePercent = '下跌幅度须大于 0%，且小于 100%。';
  }
  if (errors.upperPrice) {
    delete errors.upperPrice;
    errors.upsidePercent = '请设置大于 0% 的上涨幅度。';
  }
  const update = (key: ParameterKey, value: string) => {
    setIsExample(false);
    setForm(previous => ({ ...previous, [key]: value }));
  };
  const slider = (key: ParameterKey, label: string, suffix: string, options: { min?: number; max: number; step: number; fixedMax?: boolean; hint?: string; compact?: boolean; disabled?: boolean; value?: string }) =>
    <SliderField label={label} value={options.value ?? form[key]} onChange={value => update(key, value)} suffix={suffix} error={errors[key]} {...options} />;
  const reset = () => { setForm({ ...EXAMPLE }); setAutomaticHaircut(true); setIsExample(true); };
  const quickWidth = (width: number) => {
    setIsExample(false);
    setForm(previous => ({ ...previous, downsidePercent: String(width), upsidePercent: String(width) }));
  };
  const buyPercent = parseParameter(form.entryBuyPercent);
  const buyValue = parseParameter(form.capital) * buyPercent / 100;

  return <div className="app-shell">
    <header className="site-header">
      <a href="#" className="brand" aria-label="LP 包赚计算器首页"><span className="brand-mark"><Icon name="mark" /></span><span>LP<span className="brand-divider">/</span>包赚计算器</span></a>
      <div className="header-context"><span className="status-dot" />浏览器内测算<span className="header-separator">/</span>无需连接钱包</div>
    </header>
    <main>
      <div className="page-heading"><div><h1>这笔 LP，多久覆盖成本？</h1><p>调好区间和买币比例，用你当前的年化，把成本算清楚。</p></div><a className="text-link" href="#method">计算口径 <Icon name="arrow" /></a></div>
      <div className="mobile-summary" role="status"><span>预计有效做市时间</span><strong>{result ? duration(result.breakEvenHours) : '请调整参数'}</strong></div>
      <div className="calculator-layout">
        <form className="input-panel slider-panel" onSubmit={event => event.preventDefault()} noValidate>
          <div className="panel-heading"><h2>设置这笔 LP</h2><button className="reset-button" type="button" onClick={reset}><Icon name="reset" />恢复示例</button></div>
          <div className={`example-note ${isExample ? '' : 'custom-note'}`}><span className="note-dot" />{isExample ? '示例参数 · 拖动滑块，或点数字精确修改' : '即时计算 · 拖动滑块，或点数字精确修改'}</div>

          <section className="form-section first-section" aria-labelledby="investment-title">
            <h3 id="investment-title">投入与实时年化</h3>
            {slider('capital', '净入池本金', 'USD', { min: 100, max: 20000, step: 100, hint: '不含 gas 和本次换币成本' })}
            <div className="quick-row capital-presets"><span>本金</span>{[1000, 5000, 10000].map(value => <button type="button" aria-pressed={form.capital === String(value)} key={value} onClick={() => update('capital', String(value))}>${amount(value)}</button>)}</div>
            {slider('aprPercent', '当前区间实时 APR', '%', { max: MAX_APR_PERCENT, step: 100, fixedMax: true, hint: '最高 100,000%。直接用当前区间手续费年化，不再调整' })}
            <div className="quick-row"><span>年化</span>{[1000, 5000, 10000].map(value => <button type="button" aria-pressed={form.aprPercent === String(value)} key={value} onClick={() => update('aprPercent', String(value))}>{amount(value)}%</button>)}</div>
          </section>

          <section className="form-section range-section" aria-labelledby="range-title">
            <div className="section-heading"><h3 id="range-title">你的实际区间</h3><span className="muted">只用于计算本金损失</span></div>
            <div className="relative-range-inputs">
              {slider('downsidePercent', '允许下跌', '%', { min: 0.1, max: 10, step: 0.1 })}
              {slider('upsidePercent', '允许上涨', '%', { min: 0.1, max: 10, step: 0.1 })}
            </div>
            <div className="quick-row"><span>对称区间</span>{[1, 2, 5, 10].map(value => <button type="button" aria-pressed={form.downsidePercent === String(value) && form.upsidePercent === String(value)} key={value} onClick={() => quickWidth(value)}>±{value}%</button>)}</div>
            <p className="section-note">上下幅度相对开仓价。实际换了区间，请同步填写新仓位对应的 APR。</p>
          </section>

          <section className="form-section buy-section" aria-labelledby="buy-title">
            <div className="section-heading"><h3 id="buy-title">开仓配平</h3><span className="muted">这次要买多少币</span></div>
            {slider('entryBuyPercent', '开仓买币比例', '%', { max: 100, step: 1 })}
            <div className="quick-row ratio-presets"><span>买币 : 其余</span>{[[10, '1:9'], [30, '3:7'], [50, '1:1'], [70, '7:3']].map(([value, label]) => <button type="button" aria-pressed={form.entryBuyPercent === String(value)} key={label} onClick={() => update('entryBuyPercent', String(value))}>{label}</button>)}</div>
            {Number.isFinite(buyValue) && buyPercent >= 0 && buyPercent <= 100 && buyValue >= 0 && <div className="buy-budget">
              <div><span>本次买币目标</span><strong>{money(buyValue)}</strong><small>本金的 {amount(buyPercent)}%</small></div>
              {result && <><Icon name="arrow" /><div><span>含损耗预计花费</span><strong>{money(result.entrySpend)}</strong><small>其中损耗 {money(result.entrySwapLoss)}</small></div></>}
            </div>}
            <p className="section-note">比例只计算本次换币金额与磨损；其余资产视为已就绪。LP 本金损失仍按实际区间计算。</p>
          </section>

          <section className="form-section cost-section" aria-labelledby="cost-title">
            <div className="section-heading"><h3 id="cost-title">进出场成本</h3><span className="muted">Gas + 交易磨损</span></div>
            <div className="cost-slider-columns">
              <div className="cost-slider-column"><h4>进场</h4>
                {slider('gasIn', '进场 Gas', 'USD', { max: 20, step: 0.1, compact: true })}
                {slider('tradeWearInPercent', '进场交易磨损', '%', { max: 3, step: 0.01, compact: true })}
              </div>
              <div className="cost-slider-column"><h4>退出</h4>
                {slider('gasOut', '退出 Gas', 'USD', { max: 20, step: 0.1, compact: true })}
                {slider('tradeWearOutPercent', '退出交易磨损', '%', { max: 3, step: 0.01, compact: true })}
              </div>
            </div>
            <p className="section-note">交易磨损包含兑换手续费、实际滑点和价格冲击，填一个总损耗率；Gas 单独计算。</p>
          </section>

          <details className="advanced-settings"><summary><span>高级设置</span><span className="summary-detail">手续费兑现损耗<Icon name="chevron" /></span></summary><div className="advanced-body">
            <label className="checkbox-label"><input type="checkbox" checked={automaticHaircut} onChange={event => {
              setAutomaticHaircut(event.target.checked); setIsExample(false);
              if (!event.target.checked) setForm(previous => ({ ...previous, feeHaircutPercent: previous.tradeWearOutPercent }));
            }} />跟随退出交易磨损</label>
            {slider('feeHaircutPercent', '手续费兑现损耗', '%', { max: 5, step: 0.01, disabled: automaticHaircut, value: automaticHaircut ? form.tradeWearOutPercent : form.feeHaircutPercent })}
            <p className="section-note">默认按全部手续费需要换币估算。仅减少手续费净收入，不重复计入本金成本。</p>
          </div></details>
        </form>

        <div className="results-column">
          {result ? <>
            <section className="result-panel" aria-labelledby="result-title">
              <div className="result-topline"><h2 id="result-title">预计成本覆盖时间</h2><span className="scenario-badge">按美元本金不亏计算</span></div>
              <div className={`result-time ${result.breakEvenHours === null ? 'result-unavailable' : ''}`} role="status" aria-live="polite" aria-atomic="true">
                {result.breakEvenHours !== null && <span className="approx-label">约</span>}<TimeValue hours={result.breakEvenHours} />
              </div>
              <p className="result-explanation">{result.breakEvenHours === null ? '每小时净手续费为 0，无法覆盖当前成本。请检查 APR 或手续费兑现损耗。' : <>累计有效做市后，即使币价下跌 <strong>{amount((1 - result.lowerPrice) * 100)}%</strong> 到区间下沿，<br className="desktop-break" />预估手续费也能覆盖本金损失与进出场成本。</>}</p>
              <div className="result-metrics"><div><span>每小时净手续费</span><strong>{money(result.netHourlyFee)}<small>/ 小时</small></strong></div><div><span>共需覆盖</span><strong>{money(result.requiredFees)}</strong></div></div>
              <FeeChart result={result} />
              <div className="condition-note"><Icon name="info" /><p>按当前实时 APR 持续、成本符合估计且退出价格仍在区间内测算。出区间不累计手续费；该时间不代表多久会触边。</p></div>
            </section>
            <div className="detail-panel"><Ledger result={result} /><ScenarioTable result={result} /></div>
          </> : <section className="result-panel invalid-panel" role="status" aria-live="polite">
            <span className="invalid-symbol"><Icon name="info" /></span><h2>调整参数，就能算成本覆盖时间</h2><p>拖动滑块，或点数字修正标出的项目，结果会自动更新。</p><ul>{Object.entries(errors).map(([key, message]) => <li key={key}>{message}</li>)}</ul>
          </section>}
        </div>
      </div>

      <details className="method-panel" id="method"><summary><span><Icon name="info" />这笔账怎么算</span><span>公式与适用范围<Icon name="chevron" /></span></summary><div className="method-content">
        <div><h3>年化算收入，区间算本金损失，配平算开仓成本</h3><p>直接使用你当前仓位、当前区间的实时手续费 APR。每小时净手续费 = 本金 × APR ÷ 100 ÷ 8760 ×（1 − 手续费兑现损耗率），不再按区间宽度或配比调整年化。</p><p>买币比例是本次要计入兑换成本的净金额占本金的比例。1:9 对应 10%；5000 美元本金即需买到价值 500 美元的币，实际支出另加兑换损耗。它不用于反算区间或决定 LP 库存。</p></div>
        <div><h3>这是条件测算，不是收益预测</h3><p>LP 数量变化按 Uniswap V3 曲线与实际涨跌区间计算，区间内最不利退出点是下沿；损失中已包含配比变化，不再额外扣一次无常损失。本金含已持资产的开仓时价值，历史买入成本不计入。</p><p>稳定币按一美元估值，退出全部换回稳定币。手续费按退出时美元等值估计，不复投、不含激励、不模拟持有价格变化。采用理论连续区间；出区间和进一步下跌不属于“区间内回本”条件。</p><a className="text-link" href="https://app.uniswap.org/whitepaper-v3.pdf" target="_blank" rel="noreferrer">查看 Uniswap V3 公式来源<Icon name="external" /></a></div>
      </div></details>
    </main>
    <footer className="site-footer"><span>LP「包赚」计算器</span><span>算清成本，再看年化。</span><span>浏览器内计算 · 不读取钱包</span></footer>
  </div>;
}
