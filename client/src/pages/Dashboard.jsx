import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import TrendChart from '../components/TrendChart'
import SeverityDonut from '../components/SeverityDonut'
import RunTable from '../components/RunTable'

export default function Dashboard() {
  const [runs, setRuns] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [runsRes, statsRes] = await Promise.all([
          fetch('/api/runs'),
          fetch('/api/runs/stats'),
        ])

        if (!runsRes.ok || !statsRes.ok) {
          throw new Error('Failed to fetch data')
        }

        const [runsData, statsData] = await Promise.all([
          runsRes.json(),
          statsRes.json(),
        ])

        setRuns(runsData)
        setStats(statsData)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="app-layout">
        <Nav />
        <div className="loading-container">
          <div className="spinner" />
          <p className="loading-text">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-layout">
        <Nav />
        <div className="error-container">
          <h2>⚠️ Connection Error</h2>
          <p>{error}</p>
          <p style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Make sure the server is running on port 3001 and Docker services are up.
          </p>
        </div>
      </div>
    )
  }

  const criticalFindings = stats?.findingsBySeverity?.critical || 0

  return (
    <div className="app-layout">
      <Nav />

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Runs</div>
          <div className="stat-value">{stats?.totalRuns || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pass Rate</div>
          <div className="stat-value" style={{ color: (stats?.passRate || 0) >= 70 ? 'var(--color-passed)' : 'var(--color-failed)' }}>
            {stats?.passRate || 0}%
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Coverage</div>
          <div className="stat-value" style={{ color: 'var(--accent-primary-light)' }}>
            {stats?.avgCoverageScore || 0}%
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Critical Findings</div>
          <div className="stat-value" style={{ color: criticalFindings > 0 ? 'var(--color-critical)' : 'var(--color-passed)' }}>
            {criticalFindings}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-title">📈 Pass Rate Trend (14 days)</div>
          <TrendChart runs={runs} />
        </div>
        <div className="chart-card">
          <div className="chart-title">🛡️ Security Findings</div>
          {stats && <SeverityDonut stats={stats} />}
        </div>
      </div>

      {/* Run Table */}
      <RunTable runs={runs} />
    </div>
  )
}

function Nav() {
  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand" style={{ textDecoration: 'none' }}>
        <span className="bot-icon">🤖</span>
        <span>PRbøt</span>
      </Link>
      <div className="navbar-status">
        <div className="status-dot" />
        Agent online
      </div>
    </nav>
  )
}
