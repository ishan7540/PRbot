import { useState, useRef, useEffect } from 'react'

export default function AskAboutRun({ runId }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    setMessages((prev) => [...prev, { role: 'user', text: question }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`/api/runs/${runId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })

      const data = await res.json()

      if (data.answer) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: data.answer },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: data.error || 'No response received.' },
        ])
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Error: ${err.message}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="chat-widget" id="ask-about-run">
      <div className="chat-header">
        <span style={{ fontSize: '1.1rem' }}>💬</span>
        <h3>Ask about this run</h3>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '24px',
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
          }}>
            Ask a question about the test results, security findings, or coverage gaps.
          </div>
        )}

        {messages.map((msg, i) => (
          <div className={`chat-message ${msg.role}`} key={i}>
            {msg.text}
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="typing-indicator">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          id="chat-input"
          className="chat-input"
          type="text"
          placeholder="e.g., Why did the auth test fail?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          id="chat-send"
          className="chat-send"
          type="submit"
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  )
}
