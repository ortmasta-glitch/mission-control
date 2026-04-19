/**
 * WCP Stitch Design System — Apache ECharts Theme
 * Dark editorial theme: obsidian #101418, gold #e6c364
 * All reports share this file for visual consistency.
 */
(function () {
  const stitchTheme = {
    color: [
      '#e6c364',  // gold (primary)
      '#6fcf97',  // green
      '#f08080',  // red/coral
      '#7bc8e0',  // blue
      '#c39bd3',  // purple
      '#f5c842',  // yellow
      '#5dade2',  // light blue
      '#eb984e',  // orange
      '#58d68d',  // light green
      '#f1948a',  // light red
    ],

    backgroundColor: 'transparent',

    textStyle: {
      color: '#e0e3e8',
      fontFamily: 'Inter, Manrope, sans-serif',
    },

    title: {
      textStyle: {
        color: '#e6c364',
        fontFamily: 'Manrope, Inter, sans-serif',
        fontWeight: 700,
        fontSize: 16,
        letterSpacing: '0.02em',
      },
      subtextStyle: {
        color: 'rgba(138,155,176,0.7)',
        fontFamily: 'Inter, sans-serif',
        fontSize: 12,
      },
    },

    legend: {
      textStyle: {
        color: '#8a9bb0',
        fontFamily: 'Manrope, Inter, sans-serif',
        fontSize: 11,
      },
      pageTextStyle: { color: '#8a9bb0' },
      pageIconColor: '#e6c364',
      pageIconInactiveColor: '#4d4637',
    },

    tooltip: {
      backgroundColor: 'rgba(26,30,38,0.96)',
      borderColor: '#e6c364',
      borderWidth: 1,
      textStyle: {
        color: '#e0e3e8',
        fontFamily: 'Inter, sans-serif',
        fontSize: 12,
      },
      extraCssText: 'border-radius:6px;box-shadow:0 8px 32px rgba(0,0,0,0.5);backdrop-filter:blur(8px);',
    },

    axisPointer: {
      lineStyle: { color: '#4d4637' },
      linkStyle: { color: '#e6c364' },
      label: {
        backgroundColor: '#1a1e26',
        borderColor: '#e6c364',
        color: '#e6c364',
        fontFamily: 'Inter, sans-serif',
      },
    },

    categoryAxis: {
      axisLine: { lineStyle: { color: 'rgba(77,70,55,0.5)' } },
      axisTick: { lineStyle: { color: 'rgba(77,70,55,0.5)' } },
      axisLabel: {
        color: '#8a9bb0',
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
      },
      splitLine: { lineStyle: { color: 'rgba(77,70,55,0.15)' } },
    },

    valueAxis: {
      axisLine: { lineStyle: { color: 'rgba(77,70,55,0.5)' } },
      axisTick: { lineStyle: { color: 'rgba(77,70,55,0.5)' } },
      axisLabel: {
        color: '#8a9bb0',
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
      },
      splitLine: { lineStyle: { color: 'rgba(77,70,55,0.2)', type: 'dashed' } },
    },

    logAxis: {
      axisLine: { lineStyle: { color: 'rgba(77,70,55,0.5)' } },
      axisTick: { lineStyle: { color: 'rgba(77,70,55,0.5)' } },
      axisLabel: { color: '#8a9bb0' },
      splitLine: { lineStyle: { color: 'rgba(77,70,55,0.2)' } },
    },

    timeAxis: {
      axisLine: { lineStyle: { color: 'rgba(77,70,55,0.5)' } },
      axisTick: { lineStyle: { color: 'rgba(77,70,55,0.5)' } },
      axisLabel: { color: '#8a9bb0' },
      splitLine: { lineStyle: { color: 'rgba(77,70,55,0.2)' } },
    },

    radar: {
      name: { textStyle: { color: '#8a9bb0', fontFamily: 'Manrope, sans-serif', fontSize: 11 } },
      axisLine: { lineStyle: { color: 'rgba(77,70,55,0.4)' } },
      splitLine: { lineStyle: { color: 'rgba(77,70,55,0.3)' } },
      splitArea: {
        areaStyle: { color: ['rgba(16,20,24,0.1)', 'rgba(26,30,38,0.1)'] },
      },
    },

    funnel: {
      label: { color: '#e0e3e8', fontFamily: 'Inter, sans-serif' },
    },

    gauge: {
      axisLine: {
        lineStyle: {
          color: [[0.3, '#f08080'], [0.7, '#f5c842'], [1, '#6fcf97']],
        },
      },
      axisTick: { lineStyle: { color: '#4d4637' } },
      axisLabel: { color: '#8a9bb0' },
      pointer: { itemStyle: { color: '#e6c364' } },
      detail: { color: '#e6c364', fontFamily: 'Inter, sans-serif' },
    },

    sankey: {
      label: { color: '#8a9bb0' },
      lineStyle: { color: 'source', opacity: 0.3 },
    },

    treemap: {
      label: { color: '#e0e3e8' },
      breadcrumb: { itemStyle: { color: '#1a1e26', textStyle: { color: '#8a9bb0' } } },
    },

    graph: {
      label: { color: '#e0e3e8' },
      edgeLabel: { color: '#8a9bb0' },
      lineStyle: { color: 'rgba(138,155,176,0.3)' },
    },

    // Series defaults
    line: {
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { width: 2 },
      itemStyle: { borderWidth: 0 },
      emphasis: { itemStyle: { borderWidth: 2, borderColor: '#e6c364' } },
    },

    bar: {
      barWidth: '45%',
      itemStyle: {
        borderRadius: [3, 3, 0, 0],
        shadowColor: 'rgba(0,0,0,0.3)',
        shadowBlur: 4,
        shadowOffsetY: 2,
      },
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetY: 4 } },
    },

    pie: {
      itemStyle: {
        borderRadius: 4,
        borderColor: '#101418',
        borderWidth: 2,
        shadowColor: 'rgba(0,0,0,0.4)',
        shadowBlur: 8,
      },
      label: { color: '#e0e3e8', fontFamily: 'Inter, sans-serif' },
    },

    scatter: {
      itemStyle: {
        shadowColor: 'rgba(0,0,0,0.3)',
        shadowBlur: 6,
      },
    },

    candlestick: {
      itemStyle: { color: '#6fcf97', color0: '#f08080', borderColor: '#6fcf97', borderColor0: '#f08080' },
    },

    heatmap: {
      itemStyle: { borderColor: '#101418', borderWidth: 2 },
      label: { color: '#e0e3e8' },
    },

    map: {
      label: { color: '#8a9bb0' },
      itemStyle: { areaColor: '#1a1e26', borderColor: 'rgba(77,70,55,0.4)' },
      emphasis: {
        itemStyle: { areaColor: '#e6c364' },
        label: { color: '#101418' },
      },
    },
  };

  // Register globally
  if (typeof echarts !== 'undefined') {
    echarts.registerTheme('stitch', stitchTheme);
  }
  // Also export for module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = stitchTheme;
  }
})();