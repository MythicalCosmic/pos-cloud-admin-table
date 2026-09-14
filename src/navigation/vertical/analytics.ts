export default [
  {
    heading: 'Analytics',
  },
  {
    title: 'Menu Engineering',
    icon: { icon: 'bx-pie-chart-alt-2' },
    to: 'analytics-menu-engineering',
    action: 'manage',
    subject: 'all',
  },
  {
    title: 'Product sales analytics',
    icon: { icon: 'bx-bar-chart-alt-2' },
    to: 'analytics-product-statistics',
    action: 'manage',
    subject: 'all',
  },
  {
    title: 'report_title',
    icon: { icon: 'bx-receipt' },
    to: 'reports-product-performance',
    action: 'manage',
    subject: 'all',
    allowedRoles: ['ADMIN', 'MANAGER'],
  },
  {
    title: 'Demand Forecast',
    icon: { icon: 'bx-bulb' },
    to: 'forecast-tomorrow',
    action: 'manage',
    subject: 'all',
  },
]
