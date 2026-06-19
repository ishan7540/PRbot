import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import AskAboutRun from '../components/AskAboutRun'

export default function RunDetail() {
  const { id } = useParams()
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('tests')

  useEffect(() => {
    async function fetchRun() {
      try {
        const res = await fetch(`/api/runs/${id}`)
        if (!res.ok) throw new Error('Run not found')
        const data = await res.json()
        setRun(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchRun()
  }, [id])

  if (loading) {
    return (
      <div className="app-layout">
        <NavBar />
        <div className="loading-container">
          <div className="spinner" />
          <p className="loading-text">Loading run details...</p>
        </div>
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="app-layout">
        <NavBar />
        <div className="error-container">
          <h2>⚠️ {error || 'Run not found'}</h2>
          <p><Link to="/">← Back to dashboard</Link></p>
        </div>
      </div>
    )
  }

  const sandbox = run.sandboxResult || {}

  return (
    <div className="app-layout">
      <NavBar />

      {/* Header */}
      <div className="run-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Link to="/" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>← Dashboard</Link>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {run.repo} <span style={{ color: 'var(--text-accent)' }}>#{run.prNumber}</span>
          </h1>
        </div>
        <span className={`badge badge-${run.status}`}>
          {run.status}
        </span>
      </div>

      {/* Meta row */}
      <div className="run-meta" style={{ marginBottom: '24px' }}>
        <div className="run-meta-item">
          🌿 <span className="mono">{run.branch}</span>
        </div>
        <div className="run-meta-item">
          📌 <span className="mono">{run.sha?.slice(0, 7)}</span>
        </div>
        <div className="run-meta-item">
          ⏱️ {run.duration ? `${Math.round(run.duration / 1000)}s` : 'N/A'}
        </div>
        <div className="run-meta-item">
          🕐 {run.createdAt ? new Date(run.createdAt).toLocaleString() : 'N/A'}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          id="tab-tests"
          className={`tab ${activeTab === 'tests' ? 'active' : ''}`}
          onClick={() => setActiveTab('tests')}
        >
          🧪 Tests {sandbox.total != null && `(${sandbox.passed}/${sandbox.total})`}
        </button>
        <button
          id="tab-security"
          className={`tab ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          🛡️ Security {run.securityFindings?.length > 0 && `(${run.securityFindings.length})`}
        </button>
        <button
          id="tab-coverage"
          className={`tab ${activeTab === 'coverage' ? 'active' : ''}`}
          onClick={() => setActiveTab('coverage')}
        >
          📊 Coverage {run.coverageScore != null && `(${run.coverageScore}%)`}
        </button>
      </div>

      {/* Tab Content */}
      <div className="glass-card" style={{ marginBottom: '24px' }}>
        {activeTab === 'tests' && <TestsTab sandbox={sandbox} />}
        {activeTab === 'security' && (
          <SecurityTab
            findings={run.securityFindings || []}
            summary={run.securitySummary}
            risk={run.overallRisk}
          />
        )}
        {activeTab === 'coverage' && (
          <CoverageTab
            gaps={run.coverageGaps || []}
            score={run.coverageScore}
            summary={run.coverageGaps?.summary}
          />
        )}
      </div>

      {/* Chat Widget */}
      <AskAboutRun runId={id} />
    </div>
  )
}

/* ─── Sub-components ─── */

function NavBar() {
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

function TestsTab({ sandbox }) {
  if (!sandbox || sandbox.total === 0) {
    return (
      <div className="empty-state">
        <div className="emoji">🧪</div>
        <p>No test results available</p>
        {sandbox?.rawOutput && (
          <pre style={{
            marginTop: '16px',
            padding: '12px',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            textAlign: 'left',
            maxHeight: '200px',
            overflow: 'auto',
            fontFamily: 'var(--font-mono)',
          }}>
            {sandbox.rawOutput.slice(0, 2000)}
          </pre>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <span className="badge badge-passed">✓ {sandbox.passed} passed</span>
        <span className="badge badge-failed">✗ {sandbox.failed} failed</span>
        <span className="badge badge-info">{sandbox.total} total</span>
      </div>

      {(sandbox.testResults || []).map((file, i) => (
        <div className="test-file" key={i}>
          <div className="test-file-header">
            <span className="test-file-name">{file.name}</span>
            <span className={`badge badge-${file.status === 'passed' ? 'passed' : 'failed'}`}>
              {file.status}
            </span>
          </div>
          {(file.assertionResults || []).map((a, j) => (
            <div className="test-assertion" key={j}>
              <span className={a.status === 'passed' ? 'test-icon-pass' : 'test-icon-fail'}>
                {a.status === 'passed' ? '✓' : '✗'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--text-secondary)' }}>{a.title}</div>
                {a.failureMessages?.length > 0 && (
                  <div className="failure-message">
                    {a.failureMessages.join('\n')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function SecurityTab({ findings, summary, risk }) {
  const severityIcons = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🔵',
    info: '⚪',
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span className={`badge badge-${risk || 'info'}`} style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
          Overall Risk: {risk || 'N/A'}
        </span>
      </div>

      {summary && (
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
          {summary}
        </p>
      )}

      {findings.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">🟢</div>
          <p>No security findings — looking clean!</p>
        </div>
      ) : (
        findings.map((f, i) => (
          <div className="finding-card" key={i}>
            <div className="finding-header">
              <span>{severityIcons[f.severity] || '⚪'}</span>
              <span className={`badge badge-${f.severity}`}>{f.severity}</span>
              <span className="finding-type">{f.type}</span>
            </div>
            <div className="finding-location">{f.file}:{f.line}</div>
            <div className="finding-description">{f.description}</div>
            {f.recommendation && (
              <div className="finding-recommendation">
                💡 {f.recommendation}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

function CoverageTab({ gaps, score, summary }) {
  const gapList = Array.isArray(gaps) ? gaps : []

  return (
    <div>
      <div className="coverage-score-big">
        {score != null ? `${score}%` : 'N/A'}
      </div>

      {summary && (
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '24px' }}>
          {summary}
        </p>
      )}

      {gapList.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">✅</div>
          <p>No coverage gaps identified</p>
        </div>
      ) : (
        <>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Coverage Gaps ({gapList.length})
          </h3>
          {gapList.map((gap, i) => (
            <div className="gap-item" key={i}>
              <span className={`badge badge-${gap.priority}`}>{gap.priority}</span>
              <div className="gap-item-content">
                <div className="gap-function">{gap.functionOrBlock}</div>
                <div className="gap-file">{gap.file}</div>
                <div className="gap-reason">{gap.reason}</div>
                {gap.suggestedTestDescription && (
                  <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--text-accent)' }}>
                    💡 {gap.suggestedTestDescription}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
