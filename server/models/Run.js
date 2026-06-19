import mongoose from 'mongoose'

const findingSchema = new mongoose.Schema(
  {
    type: String,
    file: String,
    line: Number,
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'info'],
    },
    description: String,
    recommendation: String,
    codeSnippet: String,
  },
  { _id: false }
)

const runSchema = new mongoose.Schema(
  {
    repo: { type: String, required: true },
    prNumber: { type: Number, required: true },
    sha: { type: String, required: true },
    branch: { type: String, required: true },
    installationId: Number,
    status: {
      type: String,
      enum: ['pending', 'running', 'passed', 'failed', 'timeout'],
      default: 'pending',
    },
    orchestratorPlan: mongoose.Schema.Types.Mixed,
    generatedTests: [
      {
        path: String,
        type: String,
        content: String,
        targetFile: String,
      },
    ],
    sandboxResult: {
      passed: Number,
      failed: Number,
      total: Number,
      timedOut: Boolean,
      testResults: mongoose.Schema.Types.Mixed,
      rawOutput: String,
    },
    securityFindings: [findingSchema],
    securitySummary: String,
    overallRisk: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'clean'],
    },
    coverageGaps: mongoose.Schema.Types.Mixed,
    coverageScore: Number,
    duration: Number,
    error: String,
  },
  { timestamps: true }
)

runSchema.index({ repo: 1, createdAt: -1 })
runSchema.index({ prNumber: 1, repo: 1 })

export default mongoose.model('Run', runSchema)
