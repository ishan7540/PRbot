import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#3b82f6',
}

export default function SeverityDonut({ stats }) {
  if (!stats?.findingsBySeverity) {
    return <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No data</p>
  }

  const data = [
    { name: 'Critical', value: stats.findingsBySeverity.critical || 0 },
    { name: 'High', value: stats.findingsBySeverity.high || 0 },
    { name: 'Medium', value: stats.findingsBySeverity.medium || 0 },
    { name: 'Low', value: stats.findingsBySeverity.low || 0 },
  ].filter((d) => d.value > 0)

  if (data.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>
          <div className="emoji">🟢</div>
          <p>No findings</p>
        </div>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          innerRadius={55}
          outerRadius={85}
          dataKey="value"
          paddingAngle={3}
          stroke="none"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={COLORS[entry.name]} />
          ))}
        </Pie>
        <Legend
          formatter={(value) => (
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{value}</span>
          )}
        />
        <Tooltip
          contentStyle={{
            background: '#161822',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
          itemStyle={{ color: '#94a3b8' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
