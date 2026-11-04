(function (root) {
  'use strict';
  const D = root.Demo;
  const MIN_DATE = '2000-01-01';
  const MAX_DAYS = 366;
  const labels = { 'last-month': '上月同期', 'previous-period': '前一周期', custom: '自选对比' };
  const $ = id => root.document.getElementById(id);
  const completed = () => D.add(D.cutoff, -1);

  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && value >= MIN_DATE && value <= D.cutoff && D.iso(D.dt(value)) === value;
  }
  function validate(start, end) {
    if (!validDate(start) || !validDate(end)) throw Error('请选择有效日期，日期不能晚于今天。');
    if (start > end) throw Error('开始日期不能晚于结束日期。');
    const length = Math.round((D.dt(end) - D.dt(start)) / 86400000) + 1;
    if (length > MAX_DAYS) throw Error('单次查看范围最多为 366 天，请缩短日期区间。');
    return length;
  }
  function init(state) {
    Object.assign(state, { date: completed(), period: 'month', includeToday: false, comparisonMode: 'last-month', compareStart: null, compareEnd: null,
      quick: completed().slice(0,7) === D.cutoff.slice(0,7) ? 'this-month' : null });
  }
  function range(state) {
    let result;
    if (state.period === 'range') {
      validate(state.start, state.end);
      const days = D.dates(state.start, state.end), prevStart = D.previous(state.start);
      result = { start: state.start, end: state.end, days, prevStart,
        prevEnd: D.add(prevStart, days.length - 1) };
      result.prevDays = D.dates(result.prevStart, result.prevEnd);
    } else result = D.periods(state.date, state.period, state.includeToday ? D.cutoff : completed());
    const mode = state.comparisonMode || 'last-month';
    if (mode === 'previous-period') {
      result.prevEnd = D.add(result.start, -1);
      result.prevStart = D.add(result.start, -result.days.length);
      result.prevDays = D.dates(result.prevStart, result.prevEnd);
    } else if (mode === 'custom') {
      validate(state.compareStart, state.compareEnd);
      result.prevStart = state.compareStart;
      result.prevEnd = state.compareEnd;
      result.prevDays = D.dates(state.compareStart, state.compareEnd);
    }
    return { ...result, comparisonMode: mode, compareLabel: labels[mode],
      unequalDays: result.days.length !== result.prevDays.length,
      compareMessage: result.prevStart ? '' : '上月无对应日期' };
  }
  function quick(state, key) {
    const today = D.cutoff;
    if (['this-week','this-month'].includes(key) && D.periods(today, key === 'this-week' ? 'week' : 'month').start > completed()) {
      throw Error((key === 'this-week' ? '本周' : '本月') + '尚无已完成日期，可手动查看今天。');
    }
    state.includeToday = key === 'today';
    if (key === 'last7' || key === 'last30') {
      state.period = 'range';
      state.start = D.add(today, key === 'last7' ? -7 : -30);
      state.end = D.add(today, -1);
      state.date = state.end;
    } else {
      state.period = key === 'this-week' ? 'week' : key === 'this-month' ? 'month' : 'day';
      state.date = key === 'yesterday' ? D.add(today, -1) : today;
    }
    state.quick = key;
  }
  function inferQuick(state) {
    if (state.period === 'day' && state.date === D.cutoff) return 'today';
    if (state.period === 'day' && state.date === D.add(D.cutoff, -1)) return 'yesterday';
    if (state.date === D.cutoff && state.period === 'week') return 'this-week';
    if (state.date === D.cutoff && state.period === 'month') return 'this-month';
    if (!state.includeToday && state.period === 'month' && state.date === completed() && state.date.slice(0,7) === D.cutoff.slice(0,7)) return 'this-month';
    return null;
  }
  function sync(state, r) {
    $('dateInput').value = state.date;
    $('singleDateControl').hidden = state.period === 'range';
    $('currentRangeControls').hidden = state.period !== 'range';
    $('currentStart').value = r.start;
    $('currentEnd').value = r.end;
    $('comparisonMode').value = state.comparisonMode;
    $('customCompareControls').hidden = state.comparisonMode !== 'custom';
    $('compareStart').value = state.compareStart || r.prevStart || '';
    $('compareEnd').value = state.compareEnd || r.prevEnd || '';
    root.document.querySelectorAll('[data-quick]').forEach(button => {
      const active = button.dataset.quick === state.quick;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      const key = button.dataset.quick;
      button.disabled = ['this-week','this-month'].includes(key) && D.periods(D.cutoff, key === 'this-week' ? 'week' : 'month').start > completed();
      button.title = button.disabled ? '当前周期尚无已完成日期，可手动查看今天' : '';
    });
    const note = $('dateFilterNote');
    note.textContent = r.unequalDays && r.prevDays.length
      ? '区间天数不同，指标按各自区间汇总；趋势从第 1 天起对齐。'
      : state.includeToday || (state.period === 'range' && state.end === D.cutoff)
        ? '正在手动查看今天；当天数据通常于次日更新。'
        : '默认统计截至昨天（' + completed().replaceAll('-','.') + '）；日期选择后自动应用。';
    $('dateFilterError').hidden = true;
  }
  function bind({ state, render }) {
    const attempt = action => {
      const saved = { ...state };
      try { action(); render(); }
      catch (error) {
        for (const key of Object.keys(state)) if (!(key in saved)) delete state[key];
        Object.assign(state, saved);
        $('dateFilterError').textContent = error.message; $('dateFilterError').hidden = false;
      }
    };
    root.document.querySelectorAll('.date-filters input[type=date]').forEach(input => {
      input.min = MIN_DATE; input.max = D.cutoff;
    });
    root.document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => attempt(() => {
      if (button.dataset.period === 'range') {
        const r = range(state); state.start = r.start; state.end = r.end;
      }
      state.period = button.dataset.period;
      state.quick = inferQuick(state);
    })));
    root.document.querySelectorAll('[data-quick]').forEach(button => button.addEventListener('click', () => attempt(() => quick(state, button.dataset.quick))));
    $('dateInput').addEventListener('change', event => attempt(() => {
      if (!validDate(event.target.value)) throw Error('请选择有效日期，日期不能晚于今天。');
      state.date = event.target.value; state.includeToday = state.date === D.cutoff; state.quick = inferQuick(state);
    }));
    for (const id of ['currentStart', 'currentEnd']) $(id).addEventListener('change', () => attempt(() => {
      const start = $('currentStart').value, end = $('currentEnd').value;
      validate(start, end);
      Object.assign(state, { start, end, date: end, includeToday: end === D.cutoff, quick: null });
    }));
    $('comparisonMode').addEventListener('change', event => attempt(() => {
      const mode = event.target.value;
      if (mode === 'custom' && (!state.compareStart || !state.compareEnd)) {
        const r = range(state);
        state.compareStart = r.prevStart || D.add(r.start, -r.days.length);
        state.compareEnd = r.prevEnd || D.add(r.start, -1);
      }
      state.comparisonMode = mode;
    }));
    for (const id of ['compareStart', 'compareEnd']) $(id).addEventListener('change', () => attempt(() => {
      const start = $('compareStart').value, end = $('compareEnd').value;
      validate(start, end);
      state.compareStart = start; state.compareEnd = end;
    }));
    $('latestButton').addEventListener('click', () => attempt(() => {
      init(state);
    }));
  }
  root.DateFilter = { init, range, quick, validate, validDate, bind, sync, completed };
})(window);
