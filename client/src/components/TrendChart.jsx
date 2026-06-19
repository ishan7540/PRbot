import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

export default function TrendChart({ runs }) {
  // Group runs by date for the last 14 days
  const now = new Date()
  const days = []

  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10) // YYYY-MM-DD
    days.push({
      key,
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      passed: 0,
      total: 0,
    })
  }

  // Count pass/total per day
  for (const run of runs) {
    if (!run.createdAt) continue
    const runDate = new Date(run.createdAt).toISOString().slice(0, 10)
    const day = days.find((d) => d.key === runDate)
    if (day) {
      day.total++
      if (run.status === 'passed') day.passed++
    }
  }

  // Compute pass rate
  const data = days.map((d) => ({
    date: d.date,
    passRate: d.total > 0 ? Math.round((d.passed / d.total) * 100) : null,
  }))

  if (runs.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>No runs yet — open a PR to get started!</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.08)" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(99,102,241,0.12)' }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: '#64748b', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(99,102,241,0.12)' }}
          tickLine={false}
          width={45}
        />
        <Tooltip
          formatter={(v) => [v != null ? `${v.toFixed(1)}%` : 'No data', 'Pass rate']}
          contentStyle={{
            background: '#161822',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
          labelStyle={{ color: '#f1f5f9' }}
          itemStyle={{ color: '#94a3b8' }}
        />
        <Line
          type="monotone"
          dataKey="passRate"
          stroke="#6366f1"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, fill: '#6366f1', stroke: '#818cf8', strokeWidth: 2 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
