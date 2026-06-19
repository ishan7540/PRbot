import { useNavigate } from 'react-router-dom'

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default function RunTable({ runs }) {
  const navigate = useNavigate()

  if (runs.length === 0) {
    return (
      <div className="table-container">
        <div className="table-header">
          <h2>Recent Runs</h2>
        </div>
        <div className="empty-state">
          <div className="emoji">📋</div>
          <p>No runs yet. Install the GitHub App and open a PR to trigger your first run!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="table-container">
      <div className="table-header">
        <h2>Recent Runs</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Repo</th>
            <th>PR</th>
            <th>Branch</th>
            <th>Tests</th>
            <th>Risk</th>
            <th>Coverage</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run._id}
              id={`run-row-${run._id}`}
              onClick={() => navigate(`/runs/${run._id}`)}
            >
              <td>
                <span className={`badge badge-${run.status}`}>
                  {run.status}
                </span>
              </td>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                {run.repo?.split('/')[1] || run.repo}
              </td>
              <td style={{ color: 'var(--text-accent)' }}>
                #{run.prNumber}
              </td>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                {run.branch?.length > 20 ? run.branch.slice(0, 20) + '…' : run.branch}
              </td>
              <td>
                {run.sandboxResult?.total != null ? (
                  <span style={{ color: run.sandboxResult.failed > 0 ? 'var(--color-failed)' : 'var(--color-passed)' }}>
                    {run.sandboxResult.passed}/{run.sandboxResult.total}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </td>
              <td>
                {run.overallRisk ? (
                  <span className={`badge badge-${run.overallRisk}`}>
                    {run.overallRisk}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </td>
              <td>
                {run.coverageScore != null ? (
                  <span style={{ color: 'var(--accent-primary-light)' }}>
                    {run.coverageScore}%
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </td>
              <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                {run.createdAt ? timeAgo(run.createdAt) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
